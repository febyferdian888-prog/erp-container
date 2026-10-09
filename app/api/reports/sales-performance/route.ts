import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rbac";

const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (now: number, before: number) => (before > 0 ? r2(((now - before) / before) * 100) : null);

// Sales performance for the owner dashboard. Sales (omzet) = invoices raised in the period,
// before PPN, excluding draft and cancelled. Orders in = value of customer POs (sales orders)
// received in the period. Monthly view covers one year; yearly view covers every year on file.
export async function GET(req: NextRequest) {
  try {
    { const denied = await guard(["reports"], "view"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { memberships: { where: { isActive: true } } },
    });
    if (!user?.memberships.length) return NextResponse.json({ error: "No company access" }, { status: 403 });
    const accessible = user.memberships.map((m) => m.companyId);
    const requested = req.nextUrl.searchParams.get("companyId");
    const companyIds = requested && accessible.includes(requested) ? [requested] : accessible;

    const [invoices, orders] = await Promise.all([
      prisma.invoice.findMany({
        where: { companyId: { in: companyIds }, deletedAt: null, status: { notIn: ["draft", "cancelled"] } },
        select: { invoiceDate: true, totalAmount: true, customer: { select: { id: true, name: true } } },
      }),
      prisma.salesOrder.findMany({
        where: { companyId: { in: companyIds }, deletedAt: null, status: { not: "cancelled" } },
        select: { poDate: true, items: { select: { subtotal: true } } },
      }),
    ]);

    const yearOf = (d: Date) => d.getFullYear();
    const years = [...new Set([...invoices.map((i) => yearOf(i.invoiceDate)), ...orders.map((o) => yearOf(o.poDate))])].sort((a, b) => a - b);
    const nowYear = new Date().getFullYear();
    const view = req.nextUrl.searchParams.get("view") === "yearly" ? "yearly" : "monthly";
    const yearParam = Number(req.nextUrl.searchParams.get("year"));
    const year = years.includes(yearParam) ? yearParam : years.includes(nowYear) ? nowYear : years[years.length - 1] ?? nowYear;

    const orderValue = (o: (typeof orders)[number]) => o.items.reduce((s, i) => s + Number(i.subtotal), 0);

    const bucketKeys = view === "monthly" ? Array.from({ length: 12 }, (_, i) => i) : years;
    const buckets = bucketKeys.map((k) => ({ key: k, revenue: 0, invoiceCount: 0, orders: 0, orderCount: 0 }));
    const prevMonthly = Array.from({ length: 12 }, () => 0);

    for (const inv of invoices) {
      const y = yearOf(inv.invoiceDate);
      const amount = Number(inv.totalAmount);
      if (view === "monthly") {
        if (y === year) {
          const b = buckets[inv.invoiceDate.getMonth()];
          b.revenue += amount;
          b.invoiceCount++;
        } else if (y === year - 1) prevMonthly[inv.invoiceDate.getMonth()] += amount;
      } else {
        const b = buckets.find((x) => x.key === y);
        if (b) { b.revenue += amount; b.invoiceCount++; }
      }
    }
    for (const o of orders) {
      const y = yearOf(o.poDate);
      if (view === "monthly") {
        if (y === year) {
          const b = buckets[o.poDate.getMonth()];
          b.orders += orderValue(o);
          b.orderCount++;
        }
      } else {
        const b = buckets.find((x) => x.key === y);
        if (b) { b.orders += orderValue(o); b.orderCount++; }
      }
    }

    const inScope = (d: Date) => (view === "monthly" ? yearOf(d) === year : true);
    const customerTotals = new Map<string, { name: string; revenue: number }>();
    for (const inv of invoices) {
      if (!inScope(inv.invoiceDate)) continue;
      const c = customerTotals.get(inv.customer.id) ?? { name: inv.customer.name, revenue: 0 };
      c.revenue += Number(inv.totalAmount);
      customerTotals.set(inv.customer.id, c);
    }

    const revenue = buckets.reduce((s, b) => s + b.revenue, 0);
    const orderValueTotal = buckets.reduce((s, b) => s + b.orders, 0);
    const now = new Date();
    // Compare like with like: this year so far against the same months of last year.
    const monthsElapsed = year === nowYear ? now.getMonth() + 1 : 12;
    const revenueSoFar = view === "monthly" ? buckets.slice(0, monthsElapsed).reduce((s, b) => s + b.revenue, 0) : 0;
    const prevSoFar = view === "monthly" ? prevMonthly.slice(0, monthsElapsed).reduce((s, v) => s + v, 0) : 0;

    return NextResponse.json({
      view,
      year,
      years,
      buckets: buckets.map((b, i) => ({
        key: b.key,
        revenue: r2(b.revenue),
        invoiceCount: b.invoiceCount,
        orders: r2(b.orders),
        orderCount: b.orderCount,
        previousRevenue: view === "monthly" ? r2(prevMonthly[i]) : null,
      })),
      totals: {
        revenue: r2(revenue),
        invoiceCount: buckets.reduce((s, b) => s + b.invoiceCount, 0),
        orders: r2(orderValueTotal),
        orderCount: buckets.reduce((s, b) => s + b.orderCount, 0),
        averageInvoice: buckets.reduce((s, b) => s + b.invoiceCount, 0) ? r2(revenue / buckets.reduce((s, b) => s + b.invoiceCount, 0)) : 0,
        growthVsPrevious: view === "monthly" ? pct(revenueSoFar, prevSoFar) : null,
        previousYear: view === "monthly" ? year - 1 : null,
        comparedMonths: view === "monthly" ? monthsElapsed : null,
      },
      topCustomers: [...customerTotals.values()]
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5)
        .map((c) => ({ name: c.name, revenue: r2(c.revenue), share: revenue > 0 ? r2((c.revenue / revenue) * 100) : 0 })),
    });
  } catch (error) {
    console.error("GET /api/reports/sales-performance error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
