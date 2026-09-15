import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
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

    const quotations = await prisma.quotation.findMany({
      where: {
        companyId: { in: companyIds },
        deletedAt: null,
      },
      include: {
        customer: { select: { id: true, name: true } },
        items: { select: { id: true, lineNumber: true, subtotal: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Calculate totals
    const quotationsWithTotals = quotations.map((q: any) => ({
      ...q,
      totalAmount: q.items.reduce((sum: number, item: any) => sum + (item.subtotal || 0), 0),
    }));

    return NextResponse.json(quotationsWithTotals);
  } catch (error) {
    console.error("GET /api/quotations error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { companyId, customerId, number, quotationDate, expiryDate, paymentTerms, notes, items } =
      body;

    const membership = await prisma.userMembership.findFirst({
      where: { userId: session.user.id, companyId },
    }).catch(() => null);

    if (!membership) {
      return NextResponse.json({ error: "No access" }, { status: 403 });
    }

    const existing = await prisma.quotation.findUnique({
      where: { companyId_number: { companyId, number } },
    });

    if (existing) {
      return NextResponse.json({ error: "Quotation number already exists" }, { status: 400 });
    }

    const quotation = await prisma.quotation.create({
      data: {
        companyId,
        customerId,
        number,
        quotationDate: new Date(quotationDate),
        expiryDate: new Date(expiryDate),
        paymentTerms,
        notes,
        status: "draft",
        revisionNumber: 1,
        items: {
          create: (items || []).map((item: any) => ({
            lineNumber: item.lineNumber,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            subtotal: item.subtotal,
          })),
        },
      },
      include: { customer: true, items: true },
    });

    return NextResponse.json(quotation, { status: 201 });
  } catch (error) {
    console.error("POST /api/quotations error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
