import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { computeInvoiceMoney, agingBucket, type AgingBucket } from "@/lib/invoice-money";

const AGING_ORDER: AgingBucket[] = ["not_due", "1-30", "31-60", "61-90", "90+"];

// AR collections workbench (Tahap 2A). Every row is derived live from the same
// computeInvoiceMoney() used by the dashboard and invoice pages, so the aging
// subtotals here always foot back to the same AR total shown elsewhere.
export async function GET(req: NextRequest) {
  try {
    { const denied = await guard(["finance"], "view"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { memberships: { where: { isActive: true }, include: { company: true } } },
    });
    if (!user?.memberships.length) return NextResponse.json({ error: "No company access" }, { status: 403 });

    const accessibleIds = user.memberships.map((m) => m.companyId);
    const params = req.nextUrl.searchParams;
    const companyId = params.get("companyId");
    const companyIds = companyId && accessibleIds.includes(companyId) ? [companyId] : accessibleIds;
    const customerId = params.get("customerId");
    const pic = params.get("pic");
    const stateFilter = params.get("state"); // unpaid | partial | overdue

    // Draft is excluded on top of cancelled: a draft invoice has no journal entry
    // yet (lib/accounting.ts returns null for it), so it is not a booked
    // receivable and must not be treated as AR here (Tahap 5 audit).
    const invoices = await prisma.invoice.findMany({
      where: {
        companyId: { in: companyIds },
        deletedAt: null,
        status: { notIn: ["cancelled", "draft"] },
        ...(customerId ? { customerId } : {}),
        ...(pic ? { collectionsPic: pic } : {}),
      },
      select: {
        id: true, invoiceNumber: true, invoiceDate: true, dueDate: true, status: true,
        grandTotal: true, paidAmount: true, pphAmount: true, collectionsPic: true, companyId: true,
        customer: { select: { id: true, name: true } },
        company: { select: { name: true } },
        _count: { select: { followUps: true } },
        followUps: { orderBy: { createdAt: "desc" }, take: 5 },
      },
    });

    const attachmentCounts = await prisma.attachment.groupBy({
      by: ["referenceId"],
      where: { referenceType: "Invoice", referenceId: { in: invoices.map((i) => i.id) } },
      _count: { id: true },
    });
    const attachmentCountByInvoice = new Map(attachmentCounts.map((a) => [a.referenceId, a._count.id]));

    const now = new Date();
    let rows = invoices
      .map((inv) => {
        const money = computeInvoiceMoney(inv, now);
        const latest = inv.followUps[0] ?? null;
        const promise = inv.followUps.find((f) => f.type === "payment_promise") ?? null;
        return {
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          invoiceDate: inv.invoiceDate,
          dueDate: inv.dueDate,
          companyId: inv.companyId,
          companyName: inv.company.name,
          customerId: inv.customer.id,
          customerName: inv.customer.name,
          grandTotal: money.grandTotal,
          balanceDue: money.balanceDue,
          paymentState: money.paymentState,
          isOverdue: money.isOverdue,
          daysOverdue: money.daysOverdue,
          aging: agingBucket(money),
          collectionsPic: inv.collectionsPic,
          lastFollowUpAt: latest?.createdAt ?? null,
          lastFollowUpNote: latest?.note ?? null,
          nextFollowUpAt: latest?.nextFollowUpAt ?? null,
          promise: promise ? { date: promise.promiseDate, amount: promise.promiseAmount ? Number(promise.promiseAmount) : null, note: promise.note } : null,
          followUpCount: inv._count.followUps,
          attachmentCount: attachmentCountByInvoice.get(inv.id) ?? 0,
          href: `/finance/invoices/${inv.id}`,
        };
      })
      .filter((r) => r.paymentState === "unpaid" || r.paymentState === "partial");

    if (stateFilter === "overdue") rows = rows.filter((r) => r.isOverdue);
    else if (stateFilter === "unpaid" || stateFilter === "partial") rows = rows.filter((r) => r.paymentState === stateFilter);

    rows.sort((a, b) => b.daysOverdue - a.daysOverdue || b.balanceDue - a.balanceDue);

    const agingSummary = AGING_ORDER.map((bucket) => {
      const bucketRows = rows.filter((r) => r.aging === bucket);
      return { bucket, count: bucketRows.length, value: bucketRows.reduce((s, r) => s + r.balanceDue, 0) };
    });

    const picOptions = [...new Set(invoices.map((i) => i.collectionsPic).filter((p): p is string => !!p))];
    const customerOptions = [...new Map(invoices.map((i) => [i.customer.id, i.customer.name])).entries()].map(([id, name]) => ({ id, name }));

    // Draft invoices, shown separately — not counted in AR since no journal
    // entry exists for them yet (see the exclusion above).
    const draftInvoices = await prisma.invoice.findMany({
      where: { companyId: { in: companyIds }, deletedAt: null, status: "draft" },
      select: { invoiceNumber: true, grandTotal: true, paidAmount: true },
    });

    return NextResponse.json({
      rows,
      summary: {
        totalOutstanding: rows.reduce((s, r) => s + r.balanceDue, 0),
        totalCount: rows.length,
        aging: agingSummary,
        draftPendingBilling: {
          count: draftInvoices.length,
          value: draftInvoices.reduce((s, i) => s + (Number(i.grandTotal) - Number(i.paidAmount)), 0),
          invoiceNumbers: draftInvoices.map((i) => i.invoiceNumber),
        },
      },
      filters: {
        companies: user.memberships.filter((m) => !m.company.deletedAt).map((m) => ({ id: m.companyId, name: m.company.name })),
        customers: customerOptions,
        pics: picOptions,
      },
    });
  } catch (error) {
    console.error("GET /api/finance/collections error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
