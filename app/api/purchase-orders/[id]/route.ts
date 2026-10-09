import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { ApprovalRequiredError, assertReleaseAllowed } from "@/lib/approval";
import { guard } from "@/lib/rbac";
import { findUnlinkedProductLines, unlinkedProductMessage } from "@/lib/part-registry";
import { ensureAutoGoodsReceipt } from "@/lib/goods-receipt";

const AUTO_GR_TRIGGER_STATUSES = new Set(["sent", "confirmed"]);

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
    const purchaseOrder = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        company: true,
        supplier: true,
        purchaseRequest: { select: { id: true, requestNumber: true } },
        salesOrder: { select: { id: true, soNumber: true, poNumber: true } },
        sources: { select: { salesOrder: { select: { id: true, soNumber: true, poNumber: true } } } },
        items: { orderBy: { lineNumber: "asc" } },
      },
    });

    if (!purchaseOrder) {
      return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });
    }

    return NextResponse.json(purchaseOrder);
  } catch (error) {
    console.error("GET /api/purchase-orders/[id] error:", error);
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
    const {
      supplierId,
      projectId,
      soId,
      poDate,
      deliveryDate,
      paymentTerms,
      shipToAddress,
      ppnPercent,
      pphPercent,
      dpPercent,
      revisionNumber,
      status,
      notes,
      items,
    } = body;

    const existing = await prisma.purchaseOrder.findUnique({ where: { id }, include: { items: true, sources: { select: { soId: true } } } });
    if (!existing) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });
    if (items) {
      const bad = await findUnlinkedProductLines(prisma, existing.companyId, items);
      if (bad.length) return NextResponse.json({ error: unlinkedProductMessage(bad), code: "PRODUCT_NOT_LINKED" }, { status: 400 });
    }
    const total = items
      ? items.reduce((sum: number, i: any) => sum + Number(i.quantity) * Number(i.unitPrice), 0)
      : existing.items.reduce((sum, i) => sum + Number(i.subtotal), 0);
    try {
      await assertReleaseAllowed(prisma, "PurchaseOrder", id, total, existing.status, status);
    } catch (e) {
      if (e instanceof ApprovalRequiredError) return NextResponse.json({ error: e.message, code: "APPROVAL_REQUIRED" }, { status: 400 });
      throw e;
    }

    const poSoIds = [...new Set([...(existing.soId ? [existing.soId] : []), ...existing.sources.map((x) => x.soId)])];
    const validSoItemIds = new Set(
      poSoIds.length ? (await prisma.salesOrderItem.findMany({ where: { soId: { in: poSoIds } }, select: { id: true } })).map((x) => x.id) : []
    );

    const purchaseOrder = await prisma.$transaction(async (tx) => {
      if (items) {
        await tx.purchaseOrderItem.deleteMany({ where: { poId: id } });
      }

      const updated = await tx.purchaseOrder.update({
        where: { id },
        data: {
          supplierId,
          projectId: projectId || null,
          soId: soId || existing.soId || existing.sources[0]?.soId || null,
          poDate: poDate ? new Date(poDate) : undefined,
          deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
          paymentTerms,
          shipToAddress: shipToAddress || null,
          ...(ppnPercent !== undefined ? { ppnPercent } : {}),
          ...(pphPercent !== undefined ? { pphPercent } : {}),
          ...(dpPercent !== undefined ? { dpPercent: Math.min(Math.max(Number(dpPercent) || 0, 0), 100) } : {}),
          ...(revisionNumber !== undefined ? { revisionNumber } : {}),
          status,
          notes,
          ...(items
            ? {
                items: {
                  create: items.map((item: any, index: number) => ({
                    productId: item.productId || null,
                    soItemId: item.soItemId && validSoItemIds.has(item.soItemId) ? item.soItemId : null,
                    lineNumber: index + 1,
                    description: item.description,
                    brand: item.brand || null,
                    quantity: item.quantity,
                    unit: item.unit,
                    unitPrice: item.unitPrice,
                    subtotal: Number(item.quantity) * Number(item.unitPrice),
                    notes: item.notes,
                  })),
                },
              }
            : {}),
        },
        include: { items: true, supplier: true },
      });

      // Raise (or re-sync) the draft GR waiting for SCM once this PO is out to the vendor.
      if (AUTO_GR_TRIGGER_STATUSES.has(updated.status) || items) {
        await ensureAutoGoodsReceipt(tx, id, session.user!.email!);
      }

      return updated;
    });

    return NextResponse.json(purchaseOrder);
  } catch (error) {
    console.error("PUT /api/purchase-orders/[id] error:", error);
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
    await prisma.purchaseOrder.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/purchase-orders/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
