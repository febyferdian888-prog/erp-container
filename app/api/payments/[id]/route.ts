import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { recalcInvoiceStatus } from "@/lib/workflow";
import { guard } from "@/lib/rbac";
import { referenceCompanyId, userHasCompanyAccess } from "@/lib/company-access";

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
      include: { customer: true },
    });

    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }
    if (!(await userHasCompanyAccess(prisma, session.user.id, payment.companyId))) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    return NextResponse.json(payment);
  } catch (error) {
    console.error("GET /api/payments/[id] error:", error);
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
    const { paymentDate, ...rest } = body;
    const nextReferenceType = rest.referenceType ?? payment.referenceType;
    const nextReferenceId = rest.referenceId ?? payment.referenceId;
    if (nextReferenceType || nextReferenceId) {
      if (nextReferenceType !== "Invoice" || !nextReferenceId || (await referenceCompanyId(prisma, nextReferenceType, nextReferenceId)) !== payment.companyId) {
        return NextResponse.json({ error: "Invoice reference does not belong to this company" }, { status: 400 });
      }
    }

    if (
      payment.referenceType === "Invoice" &&
      payment.referenceId &&
      rest.amount !== undefined &&
      Number(rest.amount) !== Number(payment.amount)
    ) {
      const delta = Number(rest.amount) - Number(payment.amount);
      await prisma.invoice.update({
        where: { id: payment.referenceId },
        data: { paidAmount: { increment: delta } },
      });
      await prisma.paymentAllocation.updateMany({
        where: { paymentId: id, invoiceId: payment.referenceId },
        data: { amount: Number(rest.amount) },
      });
      await recalcInvoiceStatus(prisma, payment.referenceId);
    }

    const updated = await prisma.payment.update({
      where: { id },
      data: {
        ...rest,
        customerId: rest.customerId || null,
        referenceType: rest.referenceType || null,
        referenceId: rest.referenceId || null,
        paymentDate: paymentDate ? new Date(paymentDate) : undefined,
      },
      include: { customer: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT /api/payments/[id] error:", error);
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

    if (payment.referenceType === "Invoice" && payment.referenceId) {
      await prisma.invoice.update({
        where: { id: payment.referenceId },
        data: { paidAmount: { decrement: payment.amount } },
      });
    }

    await prisma.payment.delete({ where: { id } });
    if (payment.referenceType === "Invoice" && payment.referenceId) {
      await recalcInvoiceStatus(prisma, payment.referenceId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/payments/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
