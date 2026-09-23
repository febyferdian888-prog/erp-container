import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import { guard, getAccess } from "@/lib/rbac";
import { can } from "@/lib/rbac-shared";

const DAY = 86400000;

export async function GET() {
  try {
    { const denied = await guard(["reports", "finance"], "view"); if (denied) return denied; }
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
    const companyId = { in: user.memberships.map((m) => m.companyId) };
    const live = { companyId, deletedAt: null };

    const [rfqs, quotations, salesOrders, invoices, purchaseOrders, bills] = await Promise.all([
      prisma.rFQ.findMany({
        where: live,
        select: { id: true, number: true, status: true, requestDate: true, customer: { select: { name: true } }, _count: { select: { quotations: true } } },
      }),
      prisma.quotation.findMany({
        where: live,
        select: { id: true, status: true, items: { select: { subtotal: true } } },
      }),
      prisma.salesOrder.findMany({
        where: live,
        select: {
          id: true, soNumber: true, poNumber: true, status: true, poDate: true,
          customer: { select: { id: true, name: true } },
          items: { select: { subtotal: true } },
          deliveries: { where: { deletedAt: null, status: { not: "cancelled" } }, select: { id: true } },
        },
      }),
      prisma.invoice.findMany({
        where: { ...live, status: { not: "cancelled" } },
        select: {
          id: true, invoiceNumber: true, invoiceDate: true, dueDate: true, status: true,
          grandTotal: true, paidAmount: true, soId: true,
          items: { orderBy: { lineNumber: "asc" }, select: { lineNumber: true, partNumber: true, description: true, quantity: true, unit: true, unitPrice: true, subtotal: true } },
          customer: { select: { id: true, name: true } },
        },
      }),
      prisma.purchaseOrder.findMany({
        where: { ...live, status: { not: "cancelled" }, soId: { not: null } },
        select: { id: true, soId: true, items: { select: { subtotal: true } } },
      }),
      prisma.bill.findMany({
        where: { ...live, status: { not: "cancelled" } },
        select: {
          id: true, billNumber: true, vendorInvoiceNumber: true, billDate: true, dueDate: true, status: true,
          totalAmount: true, grandTotal: true, paidAmount: true, poId: true, soId: true,
          supplier: { select: { id: true, name: true } },
          items: { orderBy: { lineNumber: "asc" }, select: { lineNumber: true, soId: true, description: true, quantity: true, unit: true, unitPrice: true, subtotal: true } },
        },
      }),
    ]);

    const sum = (xs: { subtotal: unknown }[]) => xs.reduce((s, i) => s + Number(i.subtotal), 0);
    const activeSo = salesOrders.filter((s) => s.status !== "cancelled" && s.status !== "draft");
    const soValue = (s: (typeof salesOrders)[number]) => sum(s.items);

    // ---- Pipeline ----
    const invoicedSoIds = new Set(invoices.filter((i) => i.soId).map((i) => i.soId as string));
    const paidInvoices = invoices.filter((i) => Number(i.paidAmount) >= Number(i.grandTotal) && Number(i.grandTotal) > 0);
    const funnel = [
      { key: "rfq", label: "RFQ diterima", count: rfqs.length, value: null as number | null },
      { key: "quotation", label: "Quotation dikirim", count: quotations.length, value: quotations.reduce((s, q) => s + sum(q.items), 0) },
      { key: "so", label: "Sales Order (PO customer)", count: activeSo.length, value: activeSo.reduce((s, o) => s + soValue(o), 0) },
      { key: "delivered", label: "Sudah dikirim", count: activeSo.filter((s) => s.deliveries.length > 0).length, value: activeSo.filter((s) => s.deliveries.length > 0).reduce((s, o) => s + soValue(o), 0) },
      { key: "invoiced", label: "Sudah ditagih", count: invoices.length, value: invoices.reduce((s, i) => s + Number(i.grandTotal), 0) },
      { key: "paid", label: "Sudah dibayar lunas", count: paidInvoices.length, value: paidInvoices.reduce((s, i) => s + Number(i.grandTotal), 0) },
    ];

    const byCustomer = new Map<string, { name: string; soCount: number; soValue: number; invoiced: number; paid: number }>();
    const row = (id: string, name: string) => {
      if (!byCustomer.has(id)) byCustomer.set(id, { name, soCount: 0, soValue: 0, invoiced: 0, paid: 0 });
      return byCustomer.get(id)!;
    };
    for (const s of activeSo) {
      const r = row(s.customer.id, s.customer.name);
      r.soCount++;
      r.soValue += soValue(s);
    }
    for (const i of invoices) {
      const r = row(i.customer.id, i.customer.name);
      r.invoiced += Number(i.grandTotal);
      r.paid += Number(i.paidAmount);
    }
    const customers = [...byCustomer.values()].sort((a, b) => b.soValue - a.soValue);

    const stalledRfqs = rfqs
      .filter((r) => (r.status === "sent" || r.status === "draft") && r._count.quotations === 0)
      .sort((a, b) => a.requestDate.getTime() - b.requestDate.getTime())
      .map((r) => ({ id: r.id, number: r.number, customer: r.customer.name, date: r.requestDate }));
    const notDelivered = activeSo
      .filter((s) => s.deliveries.length === 0 && !invoicedSoIds.has(s.id))
      .map((s) => ({ id: s.id, soNumber: s.soNumber, poNumber: s.poNumber, customer: s.customer.name, value: soValue(s), date: s.poDate }));
    const notInvoiced = activeSo
      .filter((s) => s.deliveries.length > 0 && !invoicedSoIds.has(s.id))
      .map((s) => ({ id: s.id, soNumber: s.soNumber, poNumber: s.poNumber, customer: s.customer.name, value: soValue(s), date: s.poDate }));

    // ---- Aging (piutang dan utang) ----
    const now = Date.now();
    type AgingDoc = {
      id: string; number: string; party: string; date: Date; dueDate: Date | null; grand: number; paid: number;
      items: { lineNumber: number; partNumber: string | null; description: string; quantity: number; unit: string | null; unitPrice: number; subtotal: number }[];
    };
    const buildAging = (docs: AgingDoc[]) => {
      const buckets = [
        { key: "current", label: "Belum jatuh tempo", total: 0, count: 0 },
        { key: "d1_30", label: "1–30 hari", total: 0, count: 0 },
        { key: "d31_60", label: "31–60 hari", total: 0, count: 0 },
        { key: "d61_90", label: "61–90 hari", total: 0, count: 0 },
        { key: "d90", label: "> 90 hari", total: 0, count: 0 },
      ];
      const rows = docs
        .map((d) => ({ d, balance: d.grand - d.paid }))
        .filter((x) => x.balance > 0.5)
        .map(({ d, balance }) => {
          const due = d.dueDate ?? d.date;
          const daysOverdue = Math.floor((now - due.getTime()) / DAY);
          const idx = daysOverdue <= 0 ? 0 : daysOverdue <= 30 ? 1 : daysOverdue <= 60 ? 2 : daysOverdue <= 90 ? 3 : 4;
          buckets[idx].total += balance;
          buckets[idx].count++;
          return {
            id: d.id, invoiceNumber: d.number, customer: d.party, invoiceDate: d.date, dueDate: d.dueDate,
            grandTotal: d.grand, balance, daysOverdue: Math.max(daysOverdue, 0), bucket: buckets[idx].key, items: d.items,
          };
        })
        .sort((x, y) => y.daysOverdue - x.daysOverdue);
      const byParty = new Map<
        string,
        { customer: string; invoiceCount: number; totalInvoice: number; balance: number; oldest: number; buckets: Record<string, number> }
      >();
      for (const r of rows) {
        const c = byParty.get(r.customer) ?? {
          customer: r.customer, invoiceCount: 0, totalInvoice: 0, balance: 0, oldest: 0,
          buckets: { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90: 0 },
        };
        c.invoiceCount++;
        c.totalInvoice += r.grandTotal;
        c.balance += r.balance;
        c.oldest = Math.max(c.oldest, r.daysOverdue);
        c.buckets[r.bucket] += r.balance;
        byParty.set(r.customer, c);
      }
      return {
        buckets,
        totalOutstanding: rows.reduce((t, r) => t + r.balance, 0),
        overdueOutstanding: buckets.slice(1).reduce((t, x) => t + x.total, 0),
        byCustomer: [...byParty.values()].sort((x, y) => y.balance - x.balance),
        invoices: rows,
      };
    };
    const aging = buildAging(
      invoices.map((i) => ({
        id: i.id, number: i.invoiceNumber, party: i.customer.name, date: i.invoiceDate, dueDate: i.dueDate,
        grand: Number(i.grandTotal), paid: Number(i.paidAmount),
        items: i.items.map((it) => ({ lineNumber: it.lineNumber, partNumber: it.partNumber, description: it.description, quantity: Number(it.quantity), unit: it.unit, unitPrice: Number(it.unitPrice), subtotal: Number(it.subtotal) })),
      }))
    );
    const payables = buildAging(
      bills
        .filter((bl) => bl.status !== "draft")
        .map((bl) => ({
          id: bl.id, number: bl.vendorInvoiceNumber ? `${bl.billNumber} (${bl.vendorInvoiceNumber})` : bl.billNumber,
          party: bl.supplier.name, date: bl.billDate, dueDate: bl.dueDate, grand: Number(bl.grandTotal), paid: Number(bl.paidAmount),
          items: bl.items.map((it) => ({ lineNumber: it.lineNumber, partNumber: null, description: it.description, quantity: Number(it.quantity), unit: it.unit, unitPrice: Number(it.unitPrice), subtotal: Number(it.subtotal) })),
        }))
    );

    // ---- Margin per SO ----
    // Cost per SO: for each PO, the vendor bills booked against it (actual) or, when none, the PO value;
    // plus bills tied straight to the SO without a PO.
    const activeBills = bills.filter((bl) => bl.status !== "draft");
    const costBySo = new Map<string, { cost: number; poCount: number; billCount: number }>();
    const addCost = (soId: string, cost: number, po: number, bill: number) => {
      const c = costBySo.get(soId) ?? { cost: 0, poCount: 0, billCount: 0 };
      c.cost += cost;
      c.poCount += po;
      c.billCount += bill;
      costBySo.set(soId, c);
    };
    const poSo = new Map(purchaseOrders.map((p) => [p.id, p.soId as string]));
    for (const po of purchaseOrders) {
      const poBills = activeBills.filter((bl) => bl.poId === po.id);
      if (poBills.length) addCost(po.soId as string, poBills.reduce((t, bl) => t + Number(bl.totalAmount), 0), 1, poBills.length);
      else addCost(po.soId as string, sum(po.items), 1, 0);
    }
    for (const bl of activeBills) {
      if (bl.poId && poSo.has(bl.poId)) continue;
      const perSo = new Map<string, number>();
      for (const it of bl.items) {
        const so = it.soId ?? bl.soId;
        if (so) perSo.set(so, (perSo.get(so) ?? 0) + Number(it.subtotal));
      }
      for (const [so, cost] of perSo) addCost(so, cost, 0, 1);
    }
    const marginRows = activeSo
      .map((s) => {
        const revenue = soValue(s);
        const c = costBySo.get(s.id);
        return {
          id: s.id, soNumber: s.soNumber, poNumber: s.poNumber, customer: s.customer.name, revenue,
          cost: c ? c.cost : null, poCount: c?.poCount ?? 0, billCount: c?.billCount ?? 0,
          margin: c ? revenue - c.cost : null,
          marginPct: c && revenue > 0 ? ((revenue - c.cost) / revenue) * 100 : null,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
    const withCost = marginRows.filter((r) => r.cost !== null);

    const access = await getAccess();
    const financeView = !!access && can(access.perms, ["finance"], "view");
    const emptyAging = { buckets: [], totalOutstanding: 0, overdueOutstanding: 0, byCustomer: [], invoices: [] };
    return NextResponse.json({
      limited: !financeView,
      pipeline: { funnel, customers, stalledRfqs, notDelivered, notInvoiced },
      aging: financeView ? aging : emptyAging,
      payables: financeView ? payables : emptyAging,
      margin: financeView
        ? {
            rows: marginRows,
            coveredCount: withCost.length,
            totalCount: marginRows.length,
            coveredRevenue: withCost.reduce((s, r) => s + r.revenue, 0),
            coveredCost: withCost.reduce((s, r) => s + (r.cost ?? 0), 0),
          }
        : { rows: [], coveredCount: 0, totalCount: 0, coveredRevenue: 0, coveredCost: 0 },
    });
  } catch (error) {
    console.error("GET /api/reports/sales error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
