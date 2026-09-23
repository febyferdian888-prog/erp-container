import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { recalcSalesOrderStatus } from "@/lib/workflow";
import { formatDocumentNumber, currentYearRange } from "@/lib/document-number";
import { guard } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  try {
    { const denied = await guard(["finance"], "view"); if (denied) return denied; }
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

    const invoices = await prisma.invoice.findMany({
      where: {
        companyId: { in: companyIds },
        deletedAt: null,
      },
      include: {
        customer: { select: { name: true } },
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
    { const denied = await guard(["finance"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { companyId, customerId, soId, invoiceDate, dueDate, paymentTerms, ppnPercent, notes, items, pphAmount, pphProofNumber, pphProofDate } =
      body;

    const membership = await prisma.userMembership.findFirst({
      where: { userId: session.user.id, companyId },
    }).catch(() => null);

    if (!membership) {
      return NextResponse.json({ error: "No access" }, { status: 403 });
    }

    const { year, start, end } = currentYearRange();
    const count = await prisma.invoice.count({
      where: { companyId, createdAt: { gte: start, lt: end } },
    });
    const invoiceNumber = formatDocumentNumber("INV", year, count + 1);

    const lineItems = (items || []).map((item: any) => ({
      lineNumber: item.lineNumber,
      partNumber: item.partNumber,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
      notes: item.notes,
    }));
    const subtotal = lineItems.reduce((sum: number, i: any) => sum + Number(i.subtotal || 0), 0);
    const ppn = ppnPercent ?? 11;
    const taxAmount = (subtotal * ppn) / 100;
    const grandTotal = subtotal + taxAmount;
    const pph = Math.min(Math.max(Number(pphAmount) || 0, 0), grandTotal);

    const invoice = await prisma.invoice.create({
      data: {
        companyId,
        customerId,
        soId: soId || null,
        invoiceNumber,
        invoiceDate: new Date(invoiceDate),
        dueDate: dueDate ? new Date(dueDate) : null,
        paymentTerms,
        ppnPercent: ppn,
        totalAmount: subtotal,
        taxAmount,
        grandTotal,
        paidAmount: pph, // tax withheld by the customer counts as settled
        pphAmount: pph,
        pphPercent: subtotal > 0 ? Math.round((pph / subtotal) * 10000) / 100 : 0,
        pphProofNumber: pphProofNumber || null,
        pphProofDate: pphProofDate ? new Date(pphProofDate) : null,
        notes,
        status: "draft",
        items: { create: lineItems },
      },
      include: { customer: true, items: true },
    });

    await recalcSalesOrderStatus(prisma, invoice.soId);

    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    console.error("POST /api/invoices error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
