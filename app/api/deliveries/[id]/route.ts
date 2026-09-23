import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { applyDeliveryStock, reverseDeliveryStock, recalcSalesOrderStatus } from "@/lib/workflow";
import { guard } from "@/lib/rbac";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    { const denied = await guard(["sales"], "view"); if (denied) return denied; }
    const { id } = await params;
    const delivery = await prisma.delivery.findUnique({
      where: { id },
      include: {
        customer: true,
        salesOrder: { select: { id: true, soNumber: true, poNumber: true } },
        items: { orderBy: { lineNumber: "asc" } },
      },
    });

    if (!delivery) {
      return NextResponse.json({ error: "Delivery not found" }, { status: 404 });
    }

    return NextResponse.json(delivery);
  } catch (error) {
    console.error("GET /api/deliveries/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    { const denied = await guard(["sales"], "edit"); if (denied) return denied; }
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const delivery = await prisma.delivery.findUnique({ where: { id } });
    if (!delivery) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const membership = await prisma.userMembership.findFirst({
      where: { userId: session.user.id, companyId: delivery.companyId },
    });
    if (!membership) {
      return NextResponse.json({ error: "No access" }, { status: 403 });
    }

    const body = await req.json();
    const { items, deliveryDate, invoiceId, warehouseId, ...rest } = body;

    const updated = await prisma.$transaction(async (tx) => {
      await reverseDeliveryStock(tx, id);
      await tx.deliveryItem.deleteMany({ where: { deliveryId: id } });

      const result = await tx.delivery.update({
        where: { id },
        data: {
          ...rest,
          invoiceId: invoiceId || null,
          warehouseId: warehouseId || null,
          deliveryDate: deliveryDate ? new Date(deliveryDate) : undefined,
          items: {
            create: (items || []).map((item: any, index: number) => ({
              lineNumber: item.lineNumber ?? index + 1,
              partNumber: item.partNumber,
              description: item.description,
              quantity: item.quantity,
              unit: item.unit,
              notes: item.notes,
            })),
          },
        },
        include: { customer: true, items: true },
      });

      if (result.status !== "cancelled") {
        await applyDeliveryStock(tx, result, result.items, session.user.email!);
      }
      await recalcSalesOrderStatus(tx, delivery.soId);
      await recalcSalesOrderStatus(tx, result.soId);
      return result;
    }, { timeout: 30000, maxWait: 10000 });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Insufficient stock")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("PUT /api/deliveries/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    { const denied = await guard(["sales"], "edit"); if (denied) return denied; }
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const delivery = await prisma.delivery.findUnique({ where: { id } });
    if (!delivery) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const membership = await prisma.userMembership.findFirst({
      where: { userId: session.user.id, companyId: delivery.companyId },
    });
    if (!membership) {
      return NextResponse.json({ error: "No access" }, { status: 403 });
    }

    await prisma.$transaction(async (tx) => {
      await reverseDeliveryStock(tx, id);
      await tx.delivery.update({ where: { id }, data: { deletedAt: new Date() } });
      await recalcSalesOrderStatus(tx, delivery.soId);
    }, { timeout: 30000, maxWait: 10000 });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/deliveries/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
