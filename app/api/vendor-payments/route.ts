import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { recalcBillStatus } from "@/lib/workflow";
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
      where: {
        companyId: { in: companyIds },
        supplierId: { not: null },
      },
      include: { supplier: { select: { name: true, code: true } } },
      orderBy: { paymentDate: "desc" },
    });

    return NextResponse.json(payments);
  } catch (error) {
    console.error("GET /api/vendor-payments error:", error);
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
      supplierId,
      referenceId,
      paymentDate,
      amount,
      method,
      bankAccount,
      description,
      notes,
    } = body;

    if (!companyId || !supplierId || !paymentDate || !amount) {
      return NextResponse.json(
        { error: "companyId, supplierId, paymentDate, and amount are required" },
        { status: 400 }
      );
    }

    if (!(await userHasCompanyAccess(prisma, session.user.id, companyId))) {
      return NextResponse.json({ error: "No access" }, { status: 403 });
    }
    if (!(await prisma.supplier.findFirst({ where: { id: supplierId, companyId }, select: { id: true } }))) {
      return NextResponse.json({ error: "Supplier does not belong to this company" }, { status: 400 });
    }
    if (referenceId && (await referenceCompanyId(prisma, "Bill", referenceId)) !== companyId) {
      return NextResponse.json({ error: "Bill reference does not belong to this company" }, { status: 400 });
    }

    const { year, start, end } = currentYearRange();
    const count = await prisma.payment.count({
      where: { companyId, createdAt: { gte: start, lt: end }, supplierId: { not: null } },
    });
    const paymentNumber = formatDocumentNumber("BP", year, count + 1);

    const payment = await prisma.payment.create({
      data: {
        companyId,
        supplierId,
        referenceType: referenceId ? "Bill" : null,
        referenceId: referenceId || null,
        paymentNumber,
        paymentDate: new Date(paymentDate),
        amount,
        method,
        bankAccount,
        description,
        notes,
        status: "recorded",
      },
      include: { supplier: true },
    });

    if (referenceId) {
      await prisma.bill.update({
        where: { id: referenceId },
        data: { paidAmount: { increment: amount } },
      });
      await recalcBillStatus(prisma, referenceId);
    }

    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    console.error("POST /api/vendor-payments error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
