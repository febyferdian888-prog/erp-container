import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rbac";

const DEBIT_NORMAL = new Set(["Asset", "Expense"]);

export async function GET(req: NextRequest) {
  try {
    { const denied = await guard(["finance"], "view"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = await prisma.user.findUnique({ where: { email: session.user.email }, include: { memberships: true } });
    if (!user?.memberships.length) return NextResponse.json({ error: "No company access" }, { status: 403 });
    const companyIds = user.memberships.map((m) => m.companyId);

    const url = new URL(req.url);
    const now = new Date();
    const from = new Date(url.searchParams.get("from") || `${now.getFullYear()}-01-01`);
    const to = new Date(url.searchParams.get("to") || now.toISOString().slice(0, 10));
    const toEnd = new Date(to.getTime() + 86400000); // exclusive
    const accountParam = url.searchParams.get("account");

    const [coa, entries] = await Promise.all([
      prisma.chartOfAccount.findMany({ where: { companyId: { in: companyIds }, deletedAt: null }, orderBy: { accountCode: "asc" } }),
      prisma.journalEntry.findMany({
        where: { companyId: { in: companyIds }, status: "posted", entryDate: { lt: toEnd } },
        include: { lines: true },
        orderBy: [{ entryDate: "asc" }, { entryNumber: "asc" }],
      }),
    ]);

    const info = new Map<string, { name: string; type: string }>();
    for (const a of coa) if (!info.has(a.accountCode)) info.set(a.accountCode, { name: a.accountName, type: a.accountType });

    // totals per account: all time up to "to" (cumulative) and inside [from, to] (period)
    const cum = new Map<string, { d: number; c: number }>();
    const per = new Map<string, { d: number; c: number }>();
    const bump = (m: Map<string, { d: number; c: number }>, code: string, d: number, c: number) => {
      const x = m.get(code) ?? { d: 0, c: 0 };
      x.d += d;
      x.c += c;
      m.set(code, x);
    };
    for (const e of entries) {
      const inPeriod = e.entryDate >= from;
      for (const l of e.lines) {
        const d = Number(l.debitAmount);
        const c = Number(l.creditAmount);
        bump(cum, l.accountCode, d, c);
        if (inPeriod) bump(per, l.accountCode, d, c);
      }
    }

    const typeOf = (code: string) => info.get(code)?.type ?? "Lainnya";
    const nameOf = (code: string) => info.get(code)?.name ?? "(akun tidak terdaftar)";
    const balance = (code: string, t: { d: number; c: number }) => (DEBIT_NORMAL.has(typeOf(code)) ? t.d - t.c : t.c - t.d);
    const list = (m: Map<string, { d: number; c: number }>, type: string) =>
      [...m.entries()]
        .filter(([code]) => typeOf(code) === type)
        .map(([code, t]) => ({ code, name: nameOf(code), amount: balance(code, t) }))
        .filter((r) => Math.abs(r.amount) > 0.004)
        .sort((a, b) => a.code.localeCompare(b.code));
    const total = (rows: { amount: number }[]) => rows.reduce((s, r) => s + r.amount, 0);

    const revenue = list(per, "Revenue");
    const expense = list(per, "Expense");
    const incomeStatement = {
      revenue,
      expense,
      totalRevenue: total(revenue),
      totalExpense: total(expense),
      netIncome: total(revenue) - total(expense),
    };

    const cumRevenue = total(list(cum, "Revenue"));
    const cumExpense = total(list(cum, "Expense"));
    const assets = list(cum, "Asset");
    const liabilities = list(cum, "Liability");
    const equity = list(cum, "Equity");
    const earnings = cumRevenue - cumExpense;
    const balanceSheet = {
      assets,
      liabilities,
      equity,
      earnings,
      totalAssets: total(assets),
      totalLiabilities: total(liabilities),
      totalEquity: total(equity) + earnings,
    };

    const trialBalance = [...cum.entries()]
      .map(([code, t]) => ({ code, name: nameOf(code), type: typeOf(code), debit: t.d, credit: t.c }))
      .sort((a, b) => a.code.localeCompare(b.code));

    // ledger for one account
    type LedgerRow = {
      date: Date; number: string; description: string | null; debit: number; credit: number;
      balance: number; sourceType: string | null; sourceId: string | null;
    };
    let ledger: { code: string; name: string; opening: number; rows: LedgerRow[] } | null = null;
    if (accountParam) {
      const debitNormal = DEBIT_NORMAL.has(typeOf(accountParam));
      let running = 0;
      const rows: LedgerRow[] = [];
      for (const e of entries) {
        for (const l of e.lines.filter((x) => x.accountCode === accountParam)) {
          const d = Number(l.debitAmount);
          const c = Number(l.creditAmount);
          running += debitNormal ? d - c : c - d;
          if (e.entryDate >= from) {
            rows.push({
              date: e.entryDate, number: e.entryNumber, description: l.description || e.description,
              debit: d, credit: c, balance: running, sourceType: e.sourceType, sourceId: e.sourceId,
            });
          }
        }
      }
      const opening = rows.length ? rows[0].balance - (debitNormal ? rows[0].debit - rows[0].credit : rows[0].credit - rows[0].debit) : running;
      ledger = { code: accountParam, name: nameOf(accountParam), opening, rows };
    }

    // PPN recap straight from documents
    const [invoices, bills] = await Promise.all([
      prisma.invoice.findMany({
        where: { companyId: { in: companyIds }, deletedAt: null, status: { notIn: ["draft", "cancelled"] }, invoiceDate: { gte: from, lt: toEnd } },
        select: { invoiceDate: true, totalAmount: true, taxAmount: true },
      }),
      prisma.bill.findMany({
        where: { companyId: { in: companyIds }, deletedAt: null, status: { notIn: ["draft", "cancelled"] }, billDate: { gte: from, lt: toEnd } },
        select: { billDate: true, totalAmount: true, taxAmount: true },
      }),
    ]);
    const months = new Map<string, { month: string; salesBase: number; output: number; purchaseBase: number; input: number }>();
    const mrow = (d: Date) => {
      const key = d.toISOString().slice(0, 7);
      if (!months.has(key)) months.set(key, { month: key, salesBase: 0, output: 0, purchaseBase: 0, input: 0 });
      return months.get(key)!;
    };
    for (const i of invoices) {
      const m = mrow(i.invoiceDate);
      m.salesBase += Number(i.totalAmount);
      m.output += Number(i.taxAmount);
    }
    for (const b of bills) {
      const m = mrow(b.billDate);
      m.purchaseBase += Number(b.totalAmount);
      m.input += Number(b.taxAmount);
    }
    const ppn = [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).map((m) => ({ ...m, net: m.output - m.input }));

    // PPh 23: withheld from us by customers (tax credit) and withheld by us from vendors (tax payable)
    const [pphInvoices, pphBills] = await Promise.all([
      prisma.invoice.findMany({
        where: { companyId: { in: companyIds }, deletedAt: null, status: { notIn: ["draft", "cancelled"] }, pphAmount: { gt: 0 }, invoiceDate: { gte: from, lt: toEnd } },
        select: { id: true, invoiceNumber: true, invoiceDate: true, totalAmount: true, pphAmount: true, pphProofNumber: true, pphProofDate: true, customer: { select: { name: true } } },
        orderBy: { invoiceDate: "asc" },
      }),
      prisma.bill.findMany({
        where: { companyId: { in: companyIds }, deletedAt: null, status: { notIn: ["draft", "cancelled"] }, pphAmount: { gt: 0 }, billDate: { gte: from, lt: toEnd } },
        select: { id: true, billNumber: true, vendorInvoiceNumber: true, billDate: true, totalAmount: true, pphAmount: true, pphProofNumber: true, pphProofDate: true, pphRemittedAt: true, supplier: { select: { name: true } } },
        orderBy: { billDate: "asc" },
      }),
    ]);
    const nowMs = Date.now();
    const pph = {
      byCustomers: pphInvoices.map((i) => ({
        id: i.id, number: i.invoiceNumber, date: i.invoiceDate, party: i.customer.name, base: Number(i.totalAmount),
        amount: Number(i.pphAmount), proofNumber: i.pphProofNumber, proofDate: i.pphProofDate,
      })),
      toVendors: pphBills.map((b) => {
        // remitted by the 10th of the month after the bill month
        const due = new Date(Date.UTC(b.billDate.getUTCFullYear(), b.billDate.getUTCMonth() + 1, 10));
        return {
          id: b.id, number: b.vendorInvoiceNumber ? `${b.billNumber} (${b.vendorInvoiceNumber})` : b.billNumber, date: b.billDate,
          party: b.supplier.name, base: Number(b.totalAmount), amount: Number(b.pphAmount),
          proofNumber: b.pphProofNumber, proofDate: b.pphProofDate, remittedAt: b.pphRemittedAt,
          dueDate: due, overdue: !b.pphRemittedAt && nowMs > due.getTime() + 86400000,
        };
      }),
    };

    const years = [...new Set(entries.map((e) => e.entryDate.getFullYear()))].sort();

    return NextResponse.json({
      period: { from, to },
      years,
      accounts: coa.map((a) => ({ code: a.accountCode, name: a.accountName, type: a.accountType })),
      incomeStatement,
      balanceSheet,
      trialBalance,
      ledger,
      ppn,
      pph,
      entryCount: entries.length,
    });
  } catch (error) {
    console.error("GET /api/reports/finance error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
