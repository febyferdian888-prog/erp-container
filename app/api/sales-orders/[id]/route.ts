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
    { const denied = await guard("any", "view"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const salesOrder = await prisma.salesOrder.findUnique({
      where: { id },
      include: {
        customer: true,
        quotation: { select: { id: true, number: true } },
        items: { orderBy: { lineNumber: "asc" } },
        deliveries: { where: { deletedAt: null }, select: { id: true, deliveryNumber: true } },
        invoices: { where: { deletedAt: null }, select: { id: true, invoiceNumber: true } },
      },
    });

    if (!salesOrder) {
      return NextResponse.json({ error: "Sales order not found" }, { status: 404 });
    }

    return NextResponse.json(salesOrder);
  } catch (error) {
    console.error("GET /api/sales-orders/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    { const denied = await guard(["sales"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { customerId, poNumber, poDate, deliveryDate, status, notes, items } = body;

    if (items) {
      await prisma.salesOrderItem.deleteMany({ where: { soId: id } });
    }

    const salesOrder = await prisma.salesOrder.update({
      where: { id },
      data: {
        customerId,
        poNumber,
        poDate: poDate ? new Date(poDate) : undefined,
        deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
        status,
        notes,
        ...(items
          ? {
              items: {
                create: items.map((item: any, index: number) => ({
                  lineNumber: index + 1,
                  partNumber: item.partNumber || null,
                  description: item.description,
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
      include: { customer: true, items: true },
    });

    return NextResponse.json(salesOrder);
  } catch (error) {
    console.error("PUT /api/sales-orders/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    { const denied = await guard(["sales"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    await prisma.salesOrder.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/sales-orders/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
