import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rbac";

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
    const { status, notes } = body;

    const goodsReceipt = await prisma.goodsReceipt.update({
      where: { id },
      data: { status, notes },
      include: { items: true, purchaseOrder: { select: { poNumber: true } } },
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
