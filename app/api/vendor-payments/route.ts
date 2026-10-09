import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { recalcBillStatus } from "@/lib/workflow";
import { syncJournal } from "@/lib/accounting";
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

    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return NextResponse.json({ error: "Jumlah pembayaran harus lebih dari 0" }, { status: 400 });
    }
    if (Number.isNaN(new Date(paymentDate).getTime())) {
      return NextResponse.json({ error: "Tanggal pembayaran tidak valid" }, { status: 400 });
    }
    if (referenceId) {
      const bill = await prisma.bill.findFirst({ where: { id: referenceId, deletedAt: null } });
      if (!bill || bill.supplierId !== supplierId) {
        return NextResponse.json({ error: "Bill bukan milik vendor yang dipilih" }, { status: 400 });
      }
      if (bill.status === "draft" || bill.status === "cancelled") {
        return NextResponse.json({ error: "Bill ini belum dicatat masuk atau sudah dibatalkan, belum bisa dibayar" }, { status: 400 });
      }
      const outstanding = Number(bill.grandTotal) - Number(bill.paidAmount);
      if (amountNum > outstanding + 0.5) {
        return NextResponse.json({ error: "Jumlah melebihi sisa tagihan bill ini (" + Math.max(Math.round(outstanding), 0).toLocaleString("id-ID") + ")" }, { status: 400 });
      }
    }

    const { year, start, end } = currentYearRange();
    const count = await prisma.payment.count({
      where: { companyId, createdAt: { gte: start, lt: end }, supplierId: { not: null } },
    });
    const paymentNumber = formatDocumentNumber("BP", year, count + 1);

    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          companyId,
          supplierId,
          referenceType: referenceId ? "Bill" : null,
          referenceId: referenceId || null,
          paymentNumber,
          paymentDate: new Date(paymentDate),
          amount: amountNum,
          method,
          bankAccount,
          description,
          notes,
          status: "recorded",
        },
        include: { supplier: true },
      });
      if (referenceId) {
        await tx.bill.update({ where: { id: referenceId }, data: { paidAmount: { increment: amountNum } } });
      }
      return created;
    });

    // Journal and status are refreshed after commit: the sync hooks skip rows still inside a transaction.
    if (referenceId) await recalcBillStatus(prisma, referenceId);
    await syncJournal(prisma, "Payment", payment.id);

    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    console.error("POST /api/vendor-payments error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
