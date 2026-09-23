import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { formatDocumentNumber, currentYearRange } from "@/lib/document-number";
import { guard } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  try {
    { const denied = await guard("any", "view"); if (denied) return denied; }
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

    const salesOrders = await prisma.salesOrder.findMany({
      where: {
        companyId: { in: companyIds },
        deletedAt: null,
      },
      include: {
        customer: { select: { id: true, name: true, code: true } },
        quotation: { select: { id: true, number: true } },
        items: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(salesOrders);
  } catch (error) {
    console.error("GET /api/sales-orders error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    { const denied = await guard(["sales"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      companyId,
      customerId,
      quotationId,
      poNumber,
      poDate,
      deliveryDate,
      notes,
      items,
    } = body;

    if (!companyId || !customerId || !poNumber || !poDate || !items?.length) {
      return NextResponse.json(
        { error: "companyId, customerId, poNumber, poDate, and at least one item are required" },
        { status: 400 }
      );
    }

    const { year, start, end } = currentYearRange();
    const count = await prisma.salesOrder.count({
      where: { companyId, createdAt: { gte: start, lt: end } },
    });
    const soNumber = formatDocumentNumber("SO", year, count + 1);

    const salesOrder = await prisma.salesOrder.create({
      data: {
        companyId,
        customerId,
        quotationId: quotationId || null,
        poNumber,
        poDate: new Date(poDate),
        soNumber,
        deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
        notes,
        createdBy: session.user.email,
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
      },
      include: { customer: true, items: true },
    });

    return NextResponse.json(salesOrder, { status: 201 });
  } catch (error) {
    console.error("POST /api/sales-orders error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
