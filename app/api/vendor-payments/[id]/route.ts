import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { recalcBillStatus } from "@/lib/workflow";
import { syncJournal } from "@/lib/accounting";
import { guard } from "@/lib/rbac";
import { userHasCompanyAccess } from "@/lib/company-access";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    { const denied = await guard(["finance"], "view"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const payment = await prisma.payment.findUnique({
      where: { id },
      include: { supplier: true },
    });

    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }
    if (!(await userHasCompanyAccess(prisma, session.user.id, payment.companyId))) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    return NextResponse.json(payment);
  } catch (error) {
    console.error("GET /api/vendor-payments/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    { const denied = await guard(["finance"], "edit"); if (denied) return denied; }
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payment = await prisma.payment.findUnique({ where: { id } });
    if (!payment) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const membership = await prisma.userMembership.findFirst({
      where: { userId: session.user.id, companyId: payment.companyId },
    });
    if (!membership) {
      return NextResponse.json({ error: "No access" }, { status: 403 });
    }

    const body = await req.json();
    const { paymentDate, amount, method, bankAccount, description, notes, status } = body;

    if (amount !== undefined && (!Number.isFinite(Number(amount)) || Number(amount) <= 0)) {
      return NextResponse.json({ error: "Jumlah pembayaran harus lebih dari 0" }, { status: 400 });
    }
    if (paymentDate !== undefined && Number.isNaN(new Date(paymentDate).getTime())) {
      return NextResponse.json({ error: "Tanggal pembayaran tidak valid" }, { status: 400 });
    }

    const amountChanged =
      payment.referenceType === "Bill" && !!payment.referenceId && amount !== undefined && Number(amount) !== Number(payment.amount);
    if (amountChanged) {
      const bill = await prisma.bill.findUnique({ where: { id: payment.referenceId as string } });
      if (bill) {
        const room = Number(bill.grandTotal) - Number(bill.paidAmount) + Number(payment.amount);
        if (Number(amount) > room + 0.5) {
          return NextResponse.json({ error: "Jumlah melebihi sisa tagihan bill ini" }, { status: 400 });
        }
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (amountChanged) {
        await tx.bill.update({
          where: { id: payment.referenceId as string },
          data: { paidAmount: { increment: Number(amount) - Number(payment.amount) } },
        });
      }
      return tx.payment.update({
        where: { id },
        data: {
          amount,
          method,
          bankAccount,
          description,
          notes,
          status,
          paymentDate: paymentDate ? new Date(paymentDate) : undefined,
        },
        include: { supplier: true },
      });
    });

    if (payment.referenceType === "Bill" && payment.referenceId) await recalcBillStatus(prisma, payment.referenceId);
    await syncJournal(prisma, "Payment", id);

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT /api/vendor-payments/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    { const denied = await guard(["finance"], "edit"); if (denied) return denied; }
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payment = await prisma.payment.findUnique({ where: { id } });
    if (!payment) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const membership = await prisma.userMembership.findFirst({
      where: { userId: session.user.id, companyId: payment.companyId },
    });
    if (!membership) {
      return NextResponse.json({ error: "No access" }, { status: 403 });
    }

    await prisma.$transaction(async (tx) => {
      if (payment.referenceType === "Bill" && payment.referenceId) {
        await tx.bill.update({
          where: { id: payment.referenceId },
          data: { paidAmount: { decrement: payment.amount } },
        });
      }
      await tx.payment.delete({ where: { id } });
    });
    if (payment.referenceType === "Bill" && payment.referenceId) {
      await recalcBillStatus(prisma, payment.referenceId);
    }
    await syncJournal(prisma, "Payment", id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/vendor-payments/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
