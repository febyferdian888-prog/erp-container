import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { ApprovalRequiredError, assertReleaseAllowed } from "@/lib/approval";
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
    const purchaseOrder = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        company: true,
        supplier: true,
        purchaseRequest: { select: { id: true, requestNumber: true } },
        salesOrder: { select: { id: true, soNumber: true, poNumber: true } },
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
      status,
      notes,
      items,
    } = body;

    const existing = await prisma.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
    if (!existing) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });
    const total = items
      ? items.reduce((sum: number, i: any) => sum + Number(i.quantity) * Number(i.unitPrice), 0)
      : existing.items.reduce((sum, i) => sum + Number(i.subtotal), 0);
    try {
      await assertReleaseAllowed(prisma, "PurchaseOrder", id, total, existing.status, status);
    } catch (e) {
      if (e instanceof ApprovalRequiredError) return NextResponse.json({ error: e.message, code: "APPROVAL_REQUIRED" }, { status: 400 });
      throw e;
    }

    if (items) {
      await prisma.purchaseOrderItem.deleteMany({ where: { poId: id } });
    }

    const purchaseOrder = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        supplierId,
        projectId: projectId || null,
        soId: soId || null,
        poDate: poDate ? new Date(poDate) : undefined,
        deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
        paymentTerms,
        status,
        notes,
        ...(items
          ? {
              items: {
                create: items.map((item: any, index: number) => ({
                  productId: item.productId || null,
                  lineNumber: index + 1,
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
      include: { items: true, supplier: true },
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
