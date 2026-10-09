import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { computeInvoiceMoney } from "@/lib/invoice-money";

const CASH_ACCOUNT_CODES = ["1000", "1100"]; // Kas, Bank (per company chart of accounts)
const WEEKS = 13;
const DELAY_DAYS = 14; // "keterlambatan penerimaan" scenario: receipts pushed back this many days

function startOfWeek(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // Monday as week start
  x.setDate(x.getDate() + diff);
  return x;
}

/**
 * Kas/bank projection over 13 weeks (Tahap 2B). Every figure is either:
 * - real (opening balance, from posted journal lines), or
 * - derived from a real outstanding document (AR/AP balance from
 *   computeInvoiceMoney / bill balance), placed in the week its own dueDate
 *   falls into, or
 * - explicitly labeled as not covered (payroll, recurring operating cost —
 *   this system has no schedule for either, so they are never estimated).
 * AP only counts each Bill's remaining balance, never the originating PO
 * value too — POs with no bill yet are reported separately, out of the
 * weekly total, so nothing is counted twice as it moves PO -> Bill -> Payment.
 */
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

    const accessibleCompanies = user.memberships.filter((m) => !m.company.deletedAt).map((m) => m.company);
    const requested = req.nextUrl.searchParams.get("companyId");
    const company = accessibleCompanies.find((c) => c.id === requested) ?? accessibleCompanies[0];
    if (!company) return NextResponse.json({ error: "No company access" }, { status: 403 });

    const now = new Date();
    const weekStarts = Array.from({ length: WEEKS }, (_, i) => {
      const d = startOfWeek(now);
      d.setDate(d.getDate() + i * 7);
      return d;
    });
    const horizonEnd = new Date(weekStarts[WEEKS - 1]);
    horizonEnd.setDate(horizonEnd.getDate() + 7);

    const weekIndexFor = (date: Date, delayDays = 0) => {
      const d = new Date(date);
      d.setDate(d.getDate() + delayDays);
      if (d < weekStarts[0]) return 0; // already due/overdue -> expected this week in the base case
      for (let i = WEEKS - 1; i >= 0; i--) if (d >= weekStarts[i]) return i;
      return WEEKS - 1; // beyond the 13-week horizon -> dumped in the last week, flagged separately
    };

    const [cashLines, invoices, bills, unbilledPOs] = await Promise.all([
      prisma.journalLine.findMany({
        where: {
          journalEntry: { companyId: company.id, status: "posted", entryDate: { lt: horizonEnd } },
          accountCode: { in: CASH_ACCOUNT_CODES },
        },
        select: { debitAmount: true, creditAmount: true, journalEntry: { select: { entryDate: true } } },
      }),
      // Draft excluded: no journal entry exists for a draft invoice/bill
      // (lib/accounting.ts), so it is not a booked, collectible/payable amount —
      // projecting cash against it would count money that was never committed
      // (Tahap 5 audit).
      prisma.invoice.findMany({
        where: { companyId: company.id, deletedAt: null, status: { notIn: ["cancelled", "draft"] } },
        select: {
          id: true, invoiceNumber: true, invoiceDate: true, dueDate: true, grandTotal: true, paidAmount: true, pphAmount: true, status: true, customer: { select: { name: true } },
          followUps: { where: { type: "payment_promise" }, orderBy: { createdAt: "desc" }, take: 1, select: { promiseDate: true, promiseAmount: true } },
        },
      }),
      prisma.bill.findMany({
        where: { companyId: company.id, deletedAt: null, status: { notIn: ["cancelled", "draft"] } },
        select: { id: true, billNumber: true, billDate: true, dueDate: true, grandTotal: true, paidAmount: true, pphAmount: true, status: true, supplier: { select: { name: true } } },
      }),
      prisma.purchaseOrder.findMany({
        where: { companyId: company.id, deletedAt: null, status: { notIn: ["cancelled", "invoiced"] }, bills: { none: {} } },
        select: { id: true, poNumber: true, status: true, items: { select: { subtotal: true } } },
      }),
    ]);

    // Opening balance = cumulative Kas+Bank as of "now" (entries dated before today).
    const asOfNow = cashLines.filter((l) => l.journalEntry.entryDate < now);
    const openingBalance = asOfNow.reduce((s, l) => s + Number(l.debitAmount) - Number(l.creditAmount), 0);

    const weeks = weekStarts.map((start, i) => {
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      return { index: i, weekStart: start, weekEnd: end, receiptsBase: 0, receiptsDelayed: 0, payments: 0 };
    });

    // Overdue money with no logged payment promise is a guess, not a commitment —
    // flagged per-line and summed separately so the projection never implies
    // certainty it doesn't have (Tahap 5 audit).
    let unconfirmedOverdueValue = 0;
    let unconfirmedOverdueCount = 0;
    const receiptSources: { invoiceNumber: string; customer: string; dueDate: Date | null; amount: number; weekBase: number; weekDelayed: number; isOverdue: boolean; hasPaymentPromise: boolean }[] = [];
    for (const inv of invoices) {
      const money = computeInvoiceMoney(inv, now);
      if (money.paymentState !== "unpaid" && money.paymentState !== "partial") continue;
      const dueDate = inv.dueDate ?? new Date(new Date(inv.invoiceDate).setDate(new Date(inv.invoiceDate).getDate() + 30));
      const wBase = weekIndexFor(dueDate, 0);
      const wDelayed = weekIndexFor(dueDate, DELAY_DAYS);
      weeks[wBase].receiptsBase += money.balanceDue;
      weeks[wDelayed].receiptsDelayed += money.balanceDue;
      const isOverdue = dueDate < now;
      const hasPaymentPromise = inv.followUps.length > 0;
      if (isOverdue && !hasPaymentPromise) {
        unconfirmedOverdueValue += money.balanceDue;
        unconfirmedOverdueCount++;
      }
      receiptSources.push({ invoiceNumber: inv.invoiceNumber, customer: inv.customer.name, dueDate: inv.dueDate, amount: money.balanceDue, weekBase: wBase, weekDelayed: wDelayed, isOverdue, hasPaymentPromise });
    }

    const paymentSources: { billNumber: string; supplier: string; dueDate: Date | null; amount: number; week: number }[] = [];
    for (const bill of bills) {
      const money = computeInvoiceMoney(bill, now);
      if (money.paymentState !== "unpaid" && money.paymentState !== "partial") continue;
      const dueDate = bill.dueDate ?? new Date(new Date(bill.billDate).setDate(new Date(bill.billDate).getDate() + 30));
      const w = weekIndexFor(dueDate, 0);
      weeks[w].payments += money.balanceDue;
      paymentSources.push({ billNumber: bill.billNumber, supplier: bill.supplier.name, dueDate: bill.dueDate, amount: money.balanceDue, week: w });
    }

    let runningBase = openingBalance;
    let runningDelayed = openingBalance;
    const weekRows = weeks.map((w) => {
      runningBase += w.receiptsBase - w.payments;
      runningDelayed += w.receiptsDelayed - w.payments;
      return {
        weekStart: w.weekStart,
        weekEnd: w.weekEnd,
        receiptsBase: w.receiptsBase,
        receiptsDelayed: w.receiptsDelayed,
        payments: w.payments,
        endingBalanceBase: runningBase,
        endingBalanceDelayed: runningDelayed,
        isShortfallBase: runningBase < 0,
        isShortfallDelayed: runningDelayed < 0,
      };
    });

    const orderValue = (items: { subtotal: unknown }[]) => items.reduce((s, i) => s + Number(i.subtotal || 0), 0);
    // A draft PO is not yet a real commitment (no vendor has confirmed anything
    // against it); only sent/confirmed/partial_received/received POs are actual
    // procurement commitments awaiting a bill (Tahap 5 audit — a Rp422jt draft
    // PO was previously shown as if it were as certain as a received one).
    const committedPOs = unbilledPOs.filter((po) => po.status !== "draft");
    const draftPOs = unbilledPOs.filter((po) => po.status === "draft");
    const poCommitmentNotBilled = committedPOs.reduce((s, po) => s + orderValue(po.items), 0);
    const poDraftNotCommitted = draftPOs.reduce((s, po) => s + orderValue(po.items), 0);

    return NextResponse.json({
      company: { id: company.id, name: company.name },
      companies: accessibleCompanies.map((c) => ({ id: c.id, name: c.name })),
      asOf: now,
      openingBalance: { total: openingBalance, source: "Saldo akun 1000 (Kas) + 1100 (Bank) dari jurnal yang sudah diposting, per hari ini." },
      weeks: weekRows,
      unscheduled: {
        poCommitmentNotBilled,
        poCount: committedPOs.length,
        // Separate, deliberately NOT summed into poCommitmentNotBilled: draft POs
        // are not a definite obligation and must not be presented as one.
        poDraftNotCommitted,
        poDraftCount: draftPOs.length,
        note: "Komitmen PO yang belum ada vendor bill-nya. Di luar total proyeksi mingguan supaya tidak terhitung dua kali begitu bill dibuat.",
      },
      notCovered: [
        "Payroll: tidak ada data gaji/jadwal pembayaran di sistem — bukan berarti Rp0, hanya tidak dilacak di sini. Wajib ditambahkan manual di luar proyeksi ini.",
        "Biaya operasional rutin (sewa, listrik, dll): tidak ada jadwal berulang tercatat — bukan berarti Rp0, hanya tidak dilacak di sini. Wajib ditambahkan manual di luar proyeksi ini.",
      ],
      unconfirmedOverdue: {
        value: unconfirmedOverdueValue,
        count: unconfirmedOverdueCount,
        note: "Piutang lewat jatuh tempo yang belum punya janji bayar tercatat (follow-up penagihan). Tetap dihitung di total minggu berjalan, tapi ini asumsi paling lemah — kapan (atau apakah) benar-benar cair belum ada dasarnya.",
      },
      assumptions: {
        delayDays: DELAY_DAYS,
        receiptFallback: "Invoice tanpa due date diasumsikan jatuh tempo 30 hari setelah tanggal invoice.",
        overdueHandling: "Piutang/utang yang sudah lewat jatuh tempo ditempatkan di minggu berjalan (belum tentu benar-benar masuk minggu ini) — lihat unconfirmedOverdue untuk yang belum ada janji bayar sama sekali.",
        pphHandling: "Nilai piutang yang diproyeksikan sudah dikurangi PPh yang dipotong customer — bagian PPh itu bukan kas yang akan diterima, jadi tidak dihitung sebagai penerimaan.",
      },
      sources: { receipts: receiptSources, payments: paymentSources },
    });
  } catch (error) {
    console.error("GET /api/finance/cash-projection error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
