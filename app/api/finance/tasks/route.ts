import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { evaluateBillMatch, isPayableByMatch } from "@/lib/three-way-match";

const r2 = (n: number) => Math.round(n * 100) / 100;

// Finance task summary: vendor bills that have come in and are waiting to be paid (DP and
// invoices raised from a PO), plus overdue customer invoices.
export async function GET() {
  try {
    { const denied = await guard(["finance"], "view"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { memberships: { where: { isActive: true } } },
    });
    if (!user?.memberships.length) return NextResponse.json({ error: "No company access" }, { status: 403 });
    const companyIds = user.memberships.map((m) => m.companyId);

    const bills = await prisma.bill.findMany({
      where: { companyId: { in: companyIds }, deletedAt: null, status: { in: ["received", "partial_paid", "overdue"] } },
      select: {
        id: true, billNumber: true, billKind: true, status: true, vendorInvoiceNumber: true, billDate: true, dueDate: true,
        grandTotal: true, paidAmount: true, notes: true, matchOverrideAt: true, matchOverrideBy: true, matchOverrideNote: true, vendorTaxInvoiceNumber: true,
        supplier: { select: { name: true } },
        purchaseOrder: { select: { id: true, poNumber: true, salesOrder: { select: { soNumber: true } }, sources: { select: { salesOrder: { select: { soNumber: true } } } } } },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    });

    const attachments = await prisma.attachment.findMany({
      where: { referenceType: "Bill", referenceId: { in: bills.map((b) => b.id) }, deletedAt: null },
      orderBy: { uploadedAt: "desc" },
      select: { id: true, referenceId: true },
    });
    const fileOf = new Map<string, string>();
    for (const a of attachments) if (!fileOf.has(a.referenceId)) fileOf.set(a.referenceId, a.id);

    const live = new Map<string, Awaited<ReturnType<typeof evaluateBillMatch>>>();
    await Promise.all(bills.filter((b) => b.billKind !== "down_payment").map(async (b) => { live.set(b.id, await evaluateBillMatch(prisma, b.id)); }));

    const now = new Date();
    const payable = bills
      .map((b) => {
        const m = live.get(b.id) ?? null;
        const outstanding = r2(Number(b.grandTotal) - Number(b.paidAmount));
        const soNumbers = [...new Set([b.purchaseOrder?.salesOrder?.soNumber, ...(b.purchaseOrder?.sources.map((s) => s.salesOrder.soNumber) ?? [])].filter(Boolean) as string[])];
        return {
          id: b.id,
          billNumber: b.billNumber,
          kind: b.billKind,
          vendorName: b.supplier.name,
          vendorInvoiceNumber: b.vendorInvoiceNumber,
          vendorTaxInvoiceNumber: b.vendorTaxInvoiceNumber,
          dueDate: b.dueDate,
          overdue: !!b.dueDate && b.dueDate < now,
          grandTotal: Number(b.grandTotal),
          paidAmount: Number(b.paidAmount),
          outstanding,
          poId: b.purchaseOrder?.id ?? null,
          poNumber: b.purchaseOrder?.poNumber ?? null,
          soNumbers,
          attachmentId: fileOf.get(b.id) ?? null,
          match: m
            ? {
                status: m.status,
                note: m.note,
                variance: m.variance,
                overridden: !!b.matchOverrideAt,
                overrideBy: b.matchOverrideBy,
                overrideNote: b.matchOverrideNote,
                blocked: !isPayableByMatch({ matchStatus: m.status, matchOverrideAt: b.matchOverrideAt }, m),
              }
            : null,
        };
      })
      .filter((b) => b.outstanding > 0.5);

    const overdueInvoices = await prisma.invoice.findMany({
      where: { companyId: { in: companyIds }, deletedAt: null, status: { in: ["sent", "partial_paid", "overdue"] }, dueDate: { lt: now } },
      select: { grandTotal: true, paidAmount: true },
    });

    return NextResponse.json({
      vendorBills: payable,
      vendorBillTotal: r2(payable.reduce((s, b) => s + b.outstanding, 0)),
      vendorBillOverdueCount: payable.filter((b) => b.overdue).length,
      overdueInvoiceCount: overdueInvoices.length,
      overdueInvoiceTotal: r2(overdueInvoices.reduce((s, i) => s + Math.max(Number(i.grandTotal) - Number(i.paidAmount), 0), 0)),
    });
  } catch (error) {
    console.error("GET /api/finance/tasks error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
