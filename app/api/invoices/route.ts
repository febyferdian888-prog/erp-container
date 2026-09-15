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

    const companyIds = user.memberships.map((m) => m.companyId);

    const invoices = await prisma.invoice.findMany({
      where: {
        companyId: { in: companyIds },
        deletedAt: null,
      },
      include: {
        customer: { select: { name: true } },
        items: { select: { subtotal: true } },
      },
      orderBy: { invoiceDate: "desc" },
    });

    return NextResponse.json(invoices);
  } catch (error) {
    console.error("GET /api/invoices error:", error);
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
    const { companyId, customerId, invoiceNumber, invoiceDate, dueDate, paymentTerms, notes } =
      body;

    const membership = await prisma.userMembership.findFirst({
      where: { userId: session.user.id, companyId },
    }).catch(() => null);

    if (!membership) {
      return NextResponse.json({ error: "No access" }, { status: 403 });
    }

    const existing = await prisma.invoice.findUnique({
      where: { companyId_invoiceNumber: { companyId, invoiceNumber } },
    });

    if (existing) {
      return NextResponse.json({ error: "Invoice number already exists" }, { status: 400 });
    }

    const invoice = await prisma.invoice.create({
      data: {
        companyId,
        customerId,
        invoiceNumber,
        invoiceDate: new Date(invoiceDate),
        dueDate: dueDate ? new Date(dueDate) : null,
        paymentTerms,
        notes,
        status: "draft",
        totalAmount: 0,
        taxAmount: 0,
        grandTotal: 0,
        paidAmount: 0,
      },
      include: { customer: true },
    });

    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    console.error("POST /api/invoices error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
