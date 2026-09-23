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

    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where: {
        companyId: { in: companyIds },
        deletedAt: null,
      },
      include: {
        supplier: { select: { id: true, name: true, code: true } },
        purchaseRequest: { select: { id: true, requestNumber: true } },
        salesOrder: { select: { id: true, soNumber: true, poNumber: true } },
        items: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(purchaseOrders);
  } catch (error) {
    console.error("GET /api/purchase-orders error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
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
    const {
      companyId,
      supplierId,
      projectId,
      prId,
      soId,
      poDate,
      deliveryDate,
      paymentTerms,
      notes,
      items,
    } = body;

    if (!companyId || !supplierId || !poDate || !items?.length) {
      return NextResponse.json(
        { error: "companyId, supplierId, poDate, and at least one item are required" },
        { status: 400 }
      );
    }

    const { year, start, end } = currentYearRange();
    const count = await prisma.purchaseOrder.count({
      where: { companyId, createdAt: { gte: start, lt: end } },
    });
    const poNumber = formatDocumentNumber("PO", year, count + 1);

    const purchaseOrder = await prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.create({
        data: {
          companyId,
          supplierId,
          projectId: projectId || null,
          prId: prId || null,
          soId: soId || null,
          poNumber,
          poDate: new Date(poDate),
          deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
          paymentTerms,
          notes,
          createdBy: session.user.email,
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
        },
        include: { items: true, supplier: true },
      });

      if (prId) {
        await tx.purchaseRequest.update({
          where: { id: prId },
          data: { status: "converted_to_po" },
        });
      }

      return po;
    });

    return NextResponse.json(purchaseOrder, { status: 201 });
  } catch (error) {
    console.error("POST /api/purchase-orders error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
