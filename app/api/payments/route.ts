import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { recalcInvoiceStatus } from "@/lib/workflow";
import { formatDocumentNumber, currentYearRange } from "@/lib/document-number";
import { guard } from "@/lib/rbac";
import { referenceCompanyId, userHasCompanyAccess } from "@/lib/company-access";

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

    const payments = await prisma.payment.findMany({
      where: { companyId: { in: companyIds } },
      include: { customer: { select: { name: true } } },
      orderBy: { paymentDate: "desc" },
    });

    return NextResponse.json(payments);
  } catch (error) {
    console.error("GET /api/payments error:", error);
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
    const {
      companyId,
      customerId,
      referenceType,
      referenceId,
      paymentDate,
      amount,
      method,
      bankAccount,
      description,
      notes,
    } = body;

    if (!(await userHasCompanyAccess(prisma, session.user.id, companyId))) {
      return NextResponse.json({ error: "No access" }, { status: 403 });
    }
    if (customerId && !(await prisma.customer.findFirst({ where: { id: customerId, companyId }, select: { id: true } }))) {
      return NextResponse.json({ error: "Customer does not belong to this company" }, { status: 400 });
    }
    if (referenceType || referenceId) {
      if (referenceType !== "Invoice" || !referenceId || (await referenceCompanyId(prisma, referenceType, referenceId)) !== companyId) {
        return NextResponse.json({ error: "Invoice reference does not belong to this company" }, { status: 400 });
      }
    }

    const { year, start, end } = currentYearRange();
    const count = await prisma.payment.count({
      where: { companyId, createdAt: { gte: start, lt: end } },
    });
    const paymentNumber = formatDocumentNumber("KW", year, count + 1);

    const payment = await prisma.payment.create({
      data: {
        companyId,
        customerId: customerId || null,
        referenceType: referenceType || null,
        referenceId: referenceId || null,
        paymentNumber,
        paymentDate: new Date(paymentDate),
        amount,
        method,
        bankAccount,
        description,
        notes,
        status: "recorded",
        ...(referenceType === "Invoice" && referenceId
          ? { allocations: { create: [{ invoiceId: referenceId, amount }] } }
          : {}),
      },
      include: { customer: true },
    });

    if (referenceType === "Invoice" && referenceId) {
      await prisma.invoice.update({
        where: { id: referenceId },
        data: { paidAmount: { increment: amount } },
      });
      await recalcInvoiceStatus(prisma, referenceId);
    }

    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    console.error("POST /api/payments error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
