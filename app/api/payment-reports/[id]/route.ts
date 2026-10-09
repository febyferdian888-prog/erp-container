import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { computeInvoiceMoney } from "@/lib/invoice-money";
import { recalcInvoiceStatus } from "@/lib/workflow";
import { formatDocumentNumber, currentYearRange } from "@/lib/document-number";
import { syncJournal } from "@/lib/accounting";

export const maxDuration = 30;

// Finance verifies the money actually landed; approving is what records the Payment.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    { const denied = await guard(["finance"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { memberships: { where: { isActive: true } } },
    });
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const { decision, reviewNotes } = await req.json();
    if (decision !== "approved" && decision !== "rejected") {
      return NextResponse.json({ error: "decision harus approved atau rejected" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const report = await tx.paymentReport.findUnique({ where: { id }, include: { invoice: true } });
      if (!report || !user.memberships.some((m) => m.companyId === report.companyId)) {
        return { error: "Laporan tidak ditemukan", code: 404 };
      }
      if (report.status !== "pending") return { error: "Laporan ini sudah diputuskan", code: 400 };

      if (decision === "rejected") {
        const updated = await tx.paymentReport.update({
          where: { id },
          data: { status: "rejected", reviewedBy: user.id, reviewedAt: new Date(), reviewNotes: reviewNotes || null },
        });
        return { report: updated };
      }

      const money = computeInvoiceMoney(report.invoice);
      if (Number(report.amount) > money.balanceDue + 0.5) {
        return { error: "Nominal melebihi sisa tagihan saat ini (mungkin sudah ada pembayaran lain)", code: 400 };
      }

      const { year, start, end } = currentYearRange();
      const count = await tx.payment.count({ where: { companyId: report.companyId, createdAt: { gte: start, lt: end } } });
      const payment = await tx.payment.create({
        data: {
          companyId: report.companyId,
          customerId: report.invoice.customerId,
          referenceType: "Invoice",
          referenceId: report.invoiceId,
          paymentNumber: formatDocumentNumber("KW", year, count + 1),
          paymentDate: report.paidDate,
          amount: report.amount,
          method: report.method,
          description: `Pembayaran invoice ${report.invoice.invoiceNumber}`,
          notes: report.notes,
          status: "recorded",
          createdBy: user.id,
          allocations: { create: [{ invoiceId: report.invoiceId, amount: report.amount }] },
        },
      });
      await tx.invoice.update({ where: { id: report.invoiceId }, data: { paidAmount: { increment: report.amount } } });
      await recalcInvoiceStatus(tx, report.invoiceId);
      const updated = await tx.paymentReport.update({
        where: { id },
        data: { status: "approved", reviewedBy: user.id, reviewedAt: new Date(), reviewNotes: reviewNotes || null, paymentId: payment.id },
      });
      return { report: updated, invoiceId: report.invoiceId, paymentId: payment.id };
    });

    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.code });

    // The write-hooks that post journal entries skip rows created inside an interactive
    // transaction (the row isn't committed yet when they'd run), so sync them explicitly now.
    if (result.invoiceId) await syncJournal(prisma, "Invoice", result.invoiceId);
    if (result.paymentId) await syncJournal(prisma, "Payment", result.paymentId);

    return NextResponse.json(result.report);
  } catch (error) {
    console.error("PUT /api/payment-reports/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
