import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { formatDocumentNumber, currentYearRange } from "@/lib/document-number";
import { guard } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  try {
    { const denied = await guard(["purchasing"], "view"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { memberships: true },
    });

    if (!user?.memberships.length) {
      return NextResponse.json({ error: "No company access" }, { status: 403 });
    }

    const companyIds = user.memberships.map((m: any) => m.companyId);

    const goodsReceipts = await prisma.goodsReceipt.findMany({
      where: {
        companyId: { in: companyIds },
        deletedAt: null,
      },
      include: {
        purchaseOrder: { select: { id: true, poNumber: true, supplier: { select: { name: true } } } },
        warehouse: { select: { id: true, code: true, name: true } },
        items: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(goodsReceipts);
  } catch (error) {
    console.error("GET /api/goods-receipts error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    { const denied = await guard(["purchasing"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { companyId, poId, warehouseId, receiptDate, notes, items } = body;

    if (!companyId || !poId || !receiptDate || !items?.length) {
      return NextResponse.json(
        { error: "companyId, poId, receiptDate, and at least one item are required" },
        { status: 400 }
      );
    }

    const { year, start, end } = currentYearRange();
    const count = await prisma.goodsReceipt.count({
      where: { companyId, createdAt: { gte: start, lt: end } },
    });
    const receiptNumber = formatDocumentNumber("GR", year, count + 1);

    const goodsReceipt = await prisma.$transaction(async (tx) => {
      const gr = await tx.goodsReceipt.create({
        data: {
          companyId,
          poId,
          warehouseId: warehouseId || null,
          receiptNumber,
          receiptDate: new Date(receiptDate),
          notes,
          createdBy: session.user.email,
          items: {
            create: items.map((item: any) => ({
              poItemId: item.poItemId || null,
              productId: item.productId || null,
              quantity: item.quantity,
              unit: item.unit,
              condition: item.condition || "good",
              notes: item.notes,
            })),
          },
        },
        include: { items: true },
      });

      for (const item of items) {
        if (item.poItemId) {
          await tx.purchaseOrderItem.update({
            where: { id: item.poItemId },
            data: { receivedQty: { increment: Number(item.quantity) } },
          });
        }

        if (warehouseId && item.productId && item.condition !== "defect") {
          const product = await tx.product.findUnique({ where: { id: item.productId } });
          if (product) {
            const existingStock = await tx.stock.findFirst({
              where: { warehouseId, productId: item.productId, locationId: null },
            });
            if (existingStock) {
              await tx.stock.update({
                where: { id: existingStock.id },
                data: { quantity: { increment: Number(item.quantity) } },
              });
            } else {
              await tx.stock.create({
                data: { warehouseId, productId: item.productId, quantity: Number(item.quantity) },
              });
            }

            await tx.stockMovement.create({
              data: {
                warehouseId,
                productId: item.productId,
                unitId: product.unitId,
                referenceType: "GoodsReceipt",
                referenceId: gr.id,
                quantity: Number(item.quantity),
                type: "IN",
                reason: "Goods receipt",
                notes: `Received against ${receiptNumber}`,
                createdBy: session.user.email,
              },
            });
          }
        }
      }

      const poItems = await tx.purchaseOrderItem.findMany({ where: { poId } });
      const allReceived = poItems.every((i) => Number(i.receivedQty) >= Number(i.quantity));
      const anyReceived = poItems.some((i) => Number(i.receivedQty) > 0);
      await tx.purchaseOrder.update({
        where: { id: poId },
        data: { status: allReceived ? "received" : anyReceived ? "partial_received" : undefined },
      });

      return gr;
    });

    return NextResponse.json(goodsReceipt, { status: 201 });
  } catch (error) {
    console.error("POST /api/goods-receipts error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
