import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { applyGoodsReceiptToStock, ensureAutoGoodsReceipt } from "@/lib/goods-receipt";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    { const denied = await guard(["purchasing"], "view"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const goodsReceipt = await prisma.goodsReceipt.findUnique({
      where: { id },
      include: {
        company: true,
        purchaseOrder: {
          include: { supplier: true, items: true },
        },
        warehouse: { select: { id: true, code: true, name: true } },
        items: true,
        claims: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    if (!goodsReceipt) {
      return NextResponse.json({ error: "Goods receipt not found" }, { status: 404 });
    }

    return NextResponse.json(goodsReceipt);
  } catch (error) {
    console.error("GET /api/goods-receipts/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    { const denied = await guard(["purchasing"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { status, notes, warehouseId, items } = body;

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    const existing = await prisma.goodsReceipt.findUnique({
      where: { id },
      include: { items: true, purchaseOrder: { select: { supplierId: true } } },
    });
    if (!existing) return NextResponse.json({ error: "Goods receipt not found" }, { status: 404 });

    // Confirming an auto-raised draft: this is the first time its quantities post to
    // PO receivedQty / warehouse stock (see lib/goods-receipt.ts — never twice).
    const isConfirming = !existing.stockApplied && status && status !== "draft";

    const QC_DONE_STATUSES = ["inspected", "accepted", "rejected"];
    const enteringQcDone = QC_DONE_STATUSES.includes(status) && !existing.inspectedByName;

    const goodsReceipt = await prisma.$transaction(async (tx) => {
      // While still a draft, SCM can correct quantities/condition before confirming.
      if (items && !existing.stockApplied) {
        for (const it of items) {
          await tx.goodsReceiptItem.update({
            where: { id: it.id },
            data: { quantity: it.quantity, condition: it.condition, notes: it.notes },
          });
        }
        if (warehouseId !== undefined) {
          await tx.goodsReceipt.update({ where: { id }, data: { warehouseId: warehouseId || null } });
        }
      }

      const updated = await tx.goodsReceipt.update({
        where: { id },
        data: {
          status,
          notes,
          ...(isConfirming ? { stockApplied: true } : {}),
          ...(enteringQcDone
            ? { inspectedByName: user?.name || session.user!.email, inspectedAt: new Date() }
            : {}),
        },
        include: { items: true, purchaseOrder: { select: { poNumber: true } } },
      });

      if (isConfirming) {
        await applyGoodsReceiptToStock(
          tx,
          { id: updated.id, poId: existing.poId, warehouseId: updated.warehouseId, receiptNumber: updated.receiptNumber },
          updated.items,
          session.user!.email!
        );
        // If this only covered part of the PO, raise a fresh draft for what's still outstanding.
        await ensureAutoGoodsReceipt(tx, existing.poId, session.user!.email!);
      }

      const hasIssueItems = updated.items.some((i) => i.condition === "defect" || i.condition === "partial");
      const needsClaim = QC_DONE_STATUSES.includes(status) && hasIssueItems;
      if (needsClaim && existing.purchaseOrder.supplierId) {
        const alreadyClaimed = await tx.supplierClaim.findFirst({ where: { grId: id } });
        if (!alreadyClaimed) {
          const count = await tx.supplierClaim.count({ where: { companyId: existing.companyId } });
          await tx.supplierClaim.create({
            data: {
              companyId: existing.companyId,
              grId: id,
              supplierId: existing.purchaseOrder.supplierId,
              claimNumber: `CLM-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`,
              status: "open",
              reason: "Auto-generated: goods receipt has item(s) marked defect/partial during QC inspection.",
              createdBy: user?.id || null,
            },
          });
        }
      }

      return updated;
    });

    return NextResponse.json(goodsReceipt);
  } catch (error) {
    console.error("PUT /api/goods-receipts/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    { const denied = await guard(["purchasing"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    await prisma.$transaction(async (tx) => {
      const gr = await tx.goodsReceipt.findUnique({ where: { id }, include: { items: true } });
      if (!gr) throw new Error("Goods receipt not found");

      // An unconfirmed auto-draft never touched stock/receivedQty, so there's nothing to reverse.
      if (gr.stockApplied) {
        for (const item of gr.items) {
          if (item.poItemId) {
            await tx.purchaseOrderItem.update({
              where: { id: item.poItemId },
              data: { receivedQty: { decrement: Number(item.quantity) } },
            });
          }

          if (gr.warehouseId && item.productId) {
            const stock = await tx.stock.findFirst({
              where: { warehouseId: gr.warehouseId, productId: item.productId, locationId: null },
            });
            if (stock) {
              await tx.stock.update({
                where: { id: stock.id },
                data: { quantity: { decrement: Number(item.quantity) } },
              });
            }
          }
        }

        await tx.stockMovement.deleteMany({ where: { referenceType: "GoodsReceipt", referenceId: gr.id } });
      }

      const poItems = await tx.purchaseOrderItem.findMany({ where: { poId: gr.poId } });
      const allReceived = poItems.every((i) => Number(i.receivedQty) >= Number(i.quantity));
      const anyReceived = poItems.some((i) => Number(i.receivedQty) > 0);
      await tx.purchaseOrder.update({
        where: { id: gr.poId },
        data: { status: allReceived ? "received" : anyReceived ? "partial_received" : "confirmed" },
      });

      await tx.goodsReceipt.update({ where: { id }, data: { deletedAt: new Date() } });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/goods-receipts/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
