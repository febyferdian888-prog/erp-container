import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rbac";

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

    const [activeSalesOrders, overdueInvoices, arOutstandingInvoices, pendingDeliveries, activeProjects, apOutstandingBills, pendingLeaves, pendingReimbursements, yearBounds] = await Promise.all([
      prisma.salesOrder.findMany({
        where: {
          ...companyFilter,
          status: { in: ["confirmed", "partially_delivered"] },
          ...(range ? { poDate: { gte: range.start, ...(range.end ? { lt: range.end } : {}) } } : {}),
        },
        select: { id: true, soNumber: true, poNumber: true, status: true, deliveryDate: true, companyId: true, customer: { select: { name: true } }, items: { select: { subtotal: true } } },
        orderBy: { deliveryDate: "asc" },
      }),
      prisma.invoice.findMany({
        where: { ...companyFilter, status: { notIn: ["paid", "cancelled"] }, dueDate: { lt: now } },
        select: { id: true, invoiceNumber: true, status: true, dueDate: true, grandTotal: true, paidAmount: true, companyId: true, customer: { select: { name: true } } },
        orderBy: { dueDate: "asc" },
      }),
      prisma.invoice.findMany({
        where: { ...companyFilter, status: { notIn: ["paid", "cancelled"] } },
        select: { grandTotal: true, paidAmount: true },
      }),
      prisma.delivery.findMany({
        where: { ...companyFilter, status: { in: ["draft", "in_transit"] }, deliveryDate: { lt: now } },
        select: { id: true, deliveryNumber: true, status: true, deliveryDate: true, companyId: true, customer: { select: { name: true } } },
        orderBy: { deliveryDate: "asc" },
      }),
      prisma.project.findMany({
        where: { ...companyFilter, status: { in: ["in_progress", "on_hold"] } },
        select: { id: true, status: true },
      }),
      prisma.bill.findMany({
        where: { ...companyFilter, status: { notIn: ["paid", "cancelled"] } },
        select: { grandTotal: true, paidAmount: true },
      }),
      prisma.leave.count({ where: { status: "pending", employee: companyFilter } }),
      prisma.reimbursement.count({ where: { status: "pending", employee: companyFilter } }),
      prisma.salesOrder.aggregate({ where: companyFilter, _min: { poDate: true }, _max: { poDate: true } }),
    ]);

    const currentYear = now.getFullYear();
    const earliestYear = yearBounds._min.poDate ? yearBounds._min.poDate.getFullYear() : currentYear;
    const latestYear = Math.max(currentYear, yearBounds._max.poDate ? yearBounds._max.poDate.getFullYear() : currentYear);
    const availableYears: number[] = [];
    for (let y = latestYear; y >= earliestYear; y--) availableYears.push(y);

    const orderValue = (items: { subtotal: unknown }[]) => items.reduce((sum, i) => sum + Number(i.subtotal || 0), 0);
    const balance = (row: { grandTotal: unknown; paidAmount: unknown }) => Number(row.grandTotal) - Number(row.paidAmount);
    const daysOverdue = (due: Date) => Math.max(0, Math.floor((now.getTime() - due.getTime()) / 86400000));

    const activeOrdersValue = activeSalesOrders.reduce((sum, so) => sum + orderValue(so.items), 0);
    const overdueReceivablesValue = overdueInvoices.reduce((sum, inv) => sum + balance(inv), 0);
    const receivablesOutstanding = arOutstandingInvoices.reduce((sum, inv) => sum + balance(inv), 0);
    const payablesOutstanding = apOutstandingBills.reduce((sum, b) => sum + balance(b), 0);

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
      },
      hr: {
        pendingLeaves,
        pendingReimbursements,
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
          daysLate: daysOverdue(d.deliveryDate),
          href: `/sales/delivery/${d.id}`,
        })),
        payments: overdueInvoices.slice(0, 8).map((inv) => ({
          id: inv.id,
          number: inv.invoiceNumber,
          customer: inv.customer.name,
          companyId: inv.companyId,
          status: inv.status,
          dueDate: inv.dueDate,
          daysLate: inv.dueDate ? daysOverdue(inv.dueDate) : 0,
          value: balance(inv),
          href: `/finance/invoices/${inv.id}`,
        })),
      },
      multiCompany: accessibleCompanies.length > 1,
    });
  } catch (error) {
    console.error("GET /api/reports/dashboard error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
