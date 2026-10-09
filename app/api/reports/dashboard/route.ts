import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { computeInvoiceMoney } from "@/lib/invoice-money";
import { loadSoProgress } from "@/lib/so-progress";
import { entityCompanyId } from "@/lib/company-access";

const PERIOD_DAYS: Record<string, number | null> = { "7d": 7, "30d": 30, month: null, all: null };
const YEAR_RE = /^\d{4}$/;

// Returns [start, end) for the chosen period, or null for "all" (no bound).
function periodRange(period: string): { start: Date; end: Date | null } | null {
  const now = new Date();
  if (period === "month") return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: null };
  if (YEAR_RE.test(period)) {
    const year = Number(period);
    return { start: new Date(year, 0, 1), end: new Date(year + 1, 0, 1) };
  }
  const days = PERIOD_DAYS[period];
  if (!days) return null;
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  return { start, end: null };
}

export async function GET(req: NextRequest) {
  try {
    { const denied = await guard(["reports"], "view"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { memberships: { where: { isActive: true }, include: { company: true } } },
    });

    if (!user?.memberships.length) {
      return NextResponse.json({ error: "No company access" }, { status: 403 });
    }

    const accessibleCompanies = user.memberships
      .map((m) => m.company)
      .filter((c) => !c.deletedAt);
    const accessibleIds = accessibleCompanies.map((c) => c.id);

    const requestedCompanyId = req.nextUrl.searchParams.get("companyId");
    const selectedCompanyId = requestedCompanyId && accessibleIds.includes(requestedCompanyId) ? requestedCompanyId : null;
    const companyIds = selectedCompanyId ? [selectedCompanyId] : accessibleIds;

    const rawPeriod = req.nextUrl.searchParams.get("period") || "";
    const period = ["7d", "30d", "month", "all"].includes(rawPeriod) || YEAR_RE.test(rawPeriod) ? rawPeriod : "all";
    const range = periodRange(period);

    const companyFilter = { companyId: { in: companyIds }, deletedAt: null };
    const now = new Date();

    const [
      candidateSalesOrders,
      allInvoices,
      draftInvoicesAgg,
      allBills,
      pendingDeliveries,
      pendingLeaves,
      pendingReimbursements,
      pendingReimbursementsValue,
      activeEmployees,
      yearBounds,
      allQuotations,
      allSalesOrders,
      allPurchaseOrders,
      allProjects,
      pendingApprovalsRaw,
    ] = await Promise.all([
      // Not filtered by the legacy `status` column here (see below): a Sales
      // Order can sit at status "draft" indefinitely while real procurement
      // work (a vendor PO, goods received) is already happening on it — that
      // column only ever moves once a delivery or invoice exists, so a
      // status-based filter under-counts genuinely active orders (Tahap 5
      // audit: SO-2026-0048 had Rp581jt of real work and two vendor POs, but
      // stayed "draft" and was invisible to this KPI). "Active" is instead
      // computed after the fetch from the same lib/so-progress.ts signals the
      // Sales Orders list already shows in its status badge, so the KPI here
      // and that badge never disagree again.
      prisma.salesOrder.findMany({
        where: {
          ...companyFilter,
          status: { not: "cancelled" },
          ...(range ? { poDate: { gte: range.start, ...(range.end ? { lt: range.end } : {}) } } : {}),
        },
        select: { id: true, soNumber: true, poNumber: true, status: true, deliveryDate: true, companyId: true, customer: { select: { name: true } }, items: { select: { subtotal: true } } },
        orderBy: { deliveryDate: "asc" },
      }),
      // All posted (non-draft, non-cancelled) invoices — AR must be derived from
      // real balances (see Tahap 1 audit part A), never from
      // `status: notIn [paid, cancelled]`, because a stale stored status can
      // wrongly hide money still owed. Draft is excluded on top of that: a
      // draft invoice has no journal entry yet (lib/accounting.ts returns null
      // for it), so it is not a booked receivable and must not appear as AR
      // (Tahap 5 audit: drafts were inflating this figure past the GL 1200
      // balance). Also carries the latest follow-up (Tahap 4B) so a second
      // full invoice fetch isn't needed just to find overdue follow-ups.
      prisma.invoice.findMany({
        where: { ...companyFilter, status: { notIn: ["cancelled", "draft"] } },
        select: {
          id: true, invoiceNumber: true, status: true, dueDate: true, grandTotal: true, paidAmount: true, pphAmount: true, companyId: true, customer: { select: { name: true } },
          followUps: { orderBy: { createdAt: "desc" }, take: 1, select: { nextFollowUpAt: true } },
        },
      }),
      // Draft invoices are unposted — surfaced separately as a distinct figure,
      // never folded into AR (see comment above).
      prisma.invoice.aggregate({
        where: { ...companyFilter, status: "draft" },
        _count: { id: true },
        _sum: { grandTotal: true, paidAmount: true },
      }),
      // dueDate is already selected here (Tahap 1), reused directly for the
      // "AP due soon" widget (Tahap 4B) instead of a second bill fetch. Draft
      // bills excluded for the same reason as draft invoices above.
      prisma.bill.findMany({
        where: { ...companyFilter, status: { notIn: ["cancelled", "draft"] } },
        select: { id: true, billNumber: true, grandTotal: true, paidAmount: true, pphAmount: true, status: true, dueDate: true, supplier: { select: { name: true } } },
      }),
      prisma.delivery.findMany({
        where: { ...companyFilter, status: { in: ["draft", "in_transit"] }, deliveryDate: { lt: now } },
        select: { id: true, deliveryNumber: true, status: true, deliveryDate: true, companyId: true, customer: { select: { name: true } } },
        orderBy: { deliveryDate: "asc" },
      }),
      prisma.leave.count({ where: { status: "pending", employee: companyFilter } }),
      prisma.reimbursement.count({ where: { status: "pending", employee: companyFilter } }),
      prisma.reimbursement.aggregate({ where: { status: "pending", employee: companyFilter }, _sum: { amount: true } }),
      prisma.employee.count({ where: { ...companyFilter, status: "active" } }),
      prisma.salesOrder.aggregate({ where: companyFilter, _min: { poDate: true }, _max: { poDate: true } }),
      // Legacy fields kept for /reports and any other consumer of this endpoint
      // (see Tahap 1 audit part C — removing these broke /reports with an
      // uncaught "Cannot read properties of undefined" render crash). Also
      // carries status/probability so Tahap 4B's pipeline view reuses this
      // same fetch instead of querying quotations twice.
      prisma.quotation.findMany({ where: companyFilter, select: { status: true, probability: true, items: { select: { subtotal: true } } } }),
      prisma.salesOrder.findMany({ where: companyFilter, select: { items: { select: { subtotal: true } } } }),
      prisma.purchaseOrder.findMany({ where: companyFilter, select: { items: { select: { subtotal: true } } } }),
      // Carries everything both the plain project totals (Tahap 1) and the
      // at-risk-margin check (Tahap 4B) need, so projects are only fetched once.
      prisma.project.findMany({
        where: companyFilter,
        select: {
          id: true, projectNumber: true, projectName: true, status: true, budget: true, estimatedCostToComplete: true,
          salesOrder: { select: { items: { select: { subtotal: true } } } },
          purchaseOrders: { where: { deletedAt: null, status: { not: "cancelled" } }, select: { items: { select: { subtotal: true } }, bills: { where: { deletedAt: null, status: { not: "cancelled" } }, select: { totalAmount: true } } } },
          reimbursements: { where: { status: { in: ["approved", "paid"] } }, select: { amount: true } },
        },
      }),
      // Global by necessity (Approval has no companyId column); filtered down to
      // this user's companies below. Pending approvals are rare by design, so
      // this stays cheap even unfiltered.
      prisma.approval.findMany({ where: { status: "pending" }, orderBy: { createdAt: "asc" }, take: 50 }),
    ]);

    // "Active" = real progress signals (PO/receipt/delivery/invoice) place it
    // before "done", not the legacy status column — see the comment on the
    // query above. This is the exact same lib/so-progress.ts logic the Sales
    // Orders list uses for its status badge (app/api/sales-orders/route.ts),
    // so this KPI and that badge can never disagree again (Tahap 5 audit).
    const soProgressById = await loadSoProgress(prisma, candidateSalesOrders.map((so) => so.id));
    const activeSalesOrders = candidateSalesOrders.filter((so) => {
      const key = soProgressById[so.id]?.key;
      return key && key !== "done";
    });

    const orderValue = (items: { subtotal: unknown }[]) => items.reduce((sum, i) => sum + Number(i.subtotal || 0), 0);
    const activeProjects = allProjects.filter((p) => p.status === "in_progress" || p.status === "on_hold");

    // --- Tahap 4B: director-priority additions --------------------------
    // Best-effort: any failure here must never take down the core dashboard
    // above, so it's isolated in its own try/catch with a safe empty fallback.
    let director = {
      pendingApprovals: [] as { id: string; documentLabel: string | null; referenceType: string; amount: number; requestedBy: string | null; createdAt: Date; companyId: string }[],
      overdueFollowUps: [] as { id: string; number: string; customer: string; nextFollowUpAt: Date | null; href: string }[],
      atRiskProjects: [] as { id: string; projectNumber: string; projectName: string; margin: number | null; estimatedFinalCost: number; budget: number; overBudget: number }[],
      pipeline: { weightedValue: 0, openCount: 0 },
      apDueSoon: [] as { id: string; number: string; supplier: string; dueDate: Date | null; value: number; href: string }[],
    };
    let safeCounts = { pendingApprovalsCount: 0, overdueFollowUpsCount: 0, atRiskProjectsCount: 0, apDueSoonCount: 0, apDueSoonValue: 0 };
    try {
      const pendingApprovals: typeof director.pendingApprovals = [];
      const resolved = await Promise.all(
        pendingApprovalsRaw.map((a) => entityCompanyId(prisma, a.referenceType, a.referenceId).catch(() => null).then((companyId) => ({ a, companyId })))
      );
      for (const { a, companyId } of resolved) {
        if (companyId && companyIds.includes(companyId)) {
          pendingApprovals.push({ id: a.id, documentLabel: a.documentLabel, referenceType: a.referenceType, amount: Number(a.amount || 0), requestedBy: a.requestedBy, createdAt: a.createdAt, companyId });
        }
      }

      const overdueFollowUps = allInvoices
        .filter((inv) => inv.followUps[0]?.nextFollowUpAt && inv.followUps[0].nextFollowUpAt < now)
        .map((inv) => ({ id: inv.id, number: inv.invoiceNumber, customer: inv.customer.name, nextFollowUpAt: inv.followUps[0].nextFollowUpAt, href: `/finance/collections` }));

      const finalProjects = allProjects.filter((p) => p.status !== "completed" && p.status !== "cancelled" && p.estimatedCostToComplete !== null);
      const projectRisk = (p: (typeof finalProjects)[number]) => {
        const contractValue = p.salesOrder ? orderValue(p.salesOrder.items) : null;
        const actualCost = p.purchaseOrders.reduce((s, po) => s + po.bills.reduce((s2, b) => s2 + Number(b.totalAmount), 0), 0) + p.reimbursements.reduce((s, r) => s + Number(r.amount), 0);
        const committed = p.purchaseOrders.reduce((s, po) => {
          const billed = po.bills.reduce((s2, b) => s2 + Number(b.totalAmount), 0);
          return s + Math.max(0, orderValue(po.items) - billed);
        }, 0);
        const etc = Number(p.estimatedCostToComplete);
        const estimatedFinalCost = actualCost + committed + etc;
        const margin = contractValue !== null ? contractValue - estimatedFinalCost : null;
        return { id: p.id, projectNumber: p.projectNumber, projectName: p.projectName, margin, estimatedFinalCost, budget: Number(p.budget), overBudget: estimatedFinalCost - Number(p.budget) };
      };
      const atRiskProjects = finalProjects.map(projectRisk).filter((p) => (p.margin !== null && p.margin < 0) || p.overBudget > 0);

      const openPipelineQuotations = allQuotations.filter((q) => q.status === "draft" || q.status === "sent");
      const openPipelineRfqCount = await prisma.rFQ.count({ where: { ...companyFilter, status: { in: ["draft", "sent"] } } });
      const pipelineWeighted = openPipelineQuotations.reduce((s, q) => s + orderValue(q.items) * ((q.probability ?? 50) / 100), 0);
      const pipelineOpenCount = openPipelineQuotations.length + openPipelineRfqCount;

      const sevenDaysOut = new Date(now.getTime() + 7 * 86400000);
      const apDueSoon = allBills
        .filter((b) => b.status !== "paid" && b.status !== "cancelled" && b.dueDate && b.dueDate >= now && b.dueDate < sevenDaysOut)
        .map((b) => {
          const m = computeInvoiceMoney(b, now);
          return { id: b.id, number: b.billNumber, supplier: b.supplier.name, dueDate: b.dueDate, value: m.balanceDue, href: `/supply-chain/bills/${b.id}` };
        })
        .filter((b) => b.value > 0.5);

      director = {
        pendingApprovals: pendingApprovals.slice(0, 8),
        overdueFollowUps: overdueFollowUps.slice(0, 8),
        atRiskProjects: atRiskProjects.slice(0, 8),
        pipeline: { weightedValue: pipelineWeighted, openCount: pipelineOpenCount },
        apDueSoon: apDueSoon.slice(0, 8),
      };
      safeCounts = {
        pendingApprovalsCount: pendingApprovals.length,
        overdueFollowUpsCount: overdueFollowUps.length,
        atRiskProjectsCount: atRiskProjects.length,
        apDueSoonCount: apDueSoon.length,
        apDueSoonValue: apDueSoon.reduce((s, b) => s + b.value, 0),
      };
    } catch (directorError) {
      console.error("GET /api/reports/dashboard director-block error (non-fatal):", directorError);
    }
    // ----------------------------------------------------------------------

    const currentYear = now.getFullYear();
    const earliestYear = yearBounds._min.poDate ? yearBounds._min.poDate.getFullYear() : currentYear;
    const latestYear = Math.max(currentYear, yearBounds._max.poDate ? yearBounds._max.poDate.getFullYear() : currentYear);
    const availableYears: number[] = [];
    for (let y = latestYear; y >= earliestYear; y--) availableYears.push(y);

    const activeOrdersValue = activeSalesOrders.reduce((sum, so) => sum + orderValue(so.items), 0);

    const invoiceMoney = allInvoices.map((inv) => ({ inv, money: computeInvoiceMoney(inv, now) }));
    const overdueInvoices = invoiceMoney.filter((r) => r.money.isOverdue);
    const arOutstanding = invoiceMoney.filter((r) => r.money.paymentState === "unpaid" || r.money.paymentState === "partial");
    const overdueReceivablesValue = overdueInvoices.reduce((s, r) => s + r.money.balanceDue, 0);
    const receivablesOutstanding = arOutstanding.reduce((s, r) => s + r.money.balanceDue, 0);

    const billMoney = allBills.map((b) => computeInvoiceMoney(b, now));
    const payablesOutstanding = billMoney
      .filter((m) => m.paymentState === "unpaid" || m.paymentState === "partial")
      .reduce((s, m) => s + m.balanceDue, 0);

    const projectsByStatus: Record<string, number> = {};
    let projectsBudgetTotal = 0;
    for (const p of allProjects) {
      projectsByStatus[p.status] = (projectsByStatus[p.status] || 0) + 1;
      projectsBudgetTotal += Number(p.budget || 0);
    }

    return NextResponse.json({
      scope: {
        companies: accessibleCompanies.map((c) => ({ id: c.id, name: c.name })),
        selectedCompanyId,
        period,
        availableYears,
      },
      summary: {
        activeOrders: { count: activeSalesOrders.length, value: activeOrdersValue },
        overdueReceivables: { count: overdueInvoices.length, value: overdueReceivablesValue },
        pendingDeliveries: { count: pendingDeliveries.length },
        activeWork: { count: activeProjects.length },
      },
      finance: {
        receivablesOutstanding,
        payablesOutstanding,
        // Draft invoices are unbilled/unposted — no journal entry exists for them
        // (lib/accounting.ts), so they are kept out of receivablesOutstanding
        // and reported here instead as a distinct, clearly-labeled figure.
        draftInvoices: {
          count: draftInvoicesAgg._count.id,
          value: Number(draftInvoicesAgg._sum.grandTotal || 0) - Number(draftInvoicesAgg._sum.paidAmount || 0),
        },
      },
      hr: {
        activeEmployees,
        pendingLeaves,
        pendingReimbursementsValue: Number(pendingReimbursementsValue._sum.amount || 0),
        pendingReimbursements,
        pendingReimbursementsCount: pendingReimbursements,
      },
      // Legacy shape, kept intact for /reports and other existing consumers.
      sales: {
        quotationsCount: allQuotations.length,
        quotationsValue: allQuotations.reduce((s, q) => s + orderValue(q.items), 0),
        salesOrdersCount: allSalesOrders.length,
        salesOrdersValue: allSalesOrders.reduce((s, so) => s + orderValue(so.items), 0),
        invoicesCount: allInvoices.length,
        invoicesTotal: allInvoices.reduce((s, i) => s + Number(i.grandTotal), 0),
        invoicesOutstanding: receivablesOutstanding,
      },
      procurement: {
        poCount: allPurchaseOrders.length,
        poValue: allPurchaseOrders.reduce((s, po) => s + orderValue(po.items), 0),
        billsCount: allBills.length,
        billsTotal: allBills.reduce((s, b) => s + Number(b.grandTotal), 0),
        billsOutstanding: payablesOutstanding,
      },
      projects: {
        total: allProjects.length,
        byStatus: projectsByStatus,
        budgetTotal: projectsBudgetTotal,
      },
      followUp: {
        sales: activeSalesOrders.slice(0, 8).map((so) => ({
          id: so.id,
          number: so.soNumber,
          customer: so.customer.name,
          companyId: so.companyId,
          status: so.status,
          dueDate: so.deliveryDate,
          value: orderValue(so.items),
          href: `/sales/orders/${so.id}`,
        })),
        deliveries: pendingDeliveries.slice(0, 8).map((d) => ({
          id: d.id,
          number: d.deliveryNumber,
          customer: d.customer.name,
          companyId: d.companyId,
          status: d.status,
          dueDate: d.deliveryDate,
          daysLate: Math.max(0, Math.floor((now.getTime() - d.deliveryDate.getTime()) / 86400000)),
          href: `/sales/delivery/${d.id}`,
        })),
        payments: overdueInvoices
          .sort((a, b) => b.money.daysOverdue - a.money.daysOverdue)
          .slice(0, 8)
          .map(({ inv, money }) => ({
            id: inv.id,
            number: inv.invoiceNumber,
            customer: inv.customer.name,
            companyId: inv.companyId,
            status: inv.status,
            dueDate: inv.dueDate,
            daysLate: money.daysOverdue,
            value: money.balanceDue,
            href: `/finance/invoices/${inv.id}`,
          })),
      },
      multiCompany: accessibleCompanies.length > 1,
      director: {
        pendingApprovals: director.pendingApprovals,
        pendingApprovalsCount: safeCounts.pendingApprovalsCount,
        overdueFollowUps: director.overdueFollowUps,
        overdueFollowUpsCount: safeCounts.overdueFollowUpsCount,
        atRiskProjects: director.atRiskProjects,
        atRiskProjectsCount: safeCounts.atRiskProjectsCount,
        pipeline: director.pipeline,
        apDueSoon: director.apDueSoon,
        apDueSoonCount: safeCounts.apDueSoonCount,
        apDueSoonValue: safeCounts.apDueSoonValue,
      },
    });
  } catch (error) {
    console.error("GET /api/reports/dashboard error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
