import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export const ACCOUNT = {
  CASH: "1000",
  BANK: "1100",
  AR: "1200",
  PPN_IN: "1400",
  PPH_PREPAID: "1410",
  AP: "2000",
  PPN_OUT: "2100",
  PPH_PAYABLE: "2110",
  EQUITY: "3000",
  RETAINED: "3100",
  REVENUE: "4000",
  PURCHASES: "5000",
  REIMBURSEMENT: "6100",
} as const;

export const DEFAULT_ACCOUNTS: { code: string; name: string; type: string }[] = [
  { code: "1000", name: "Kas", type: "Asset" },
  { code: "1100", name: "Bank", type: "Asset" },
  { code: "1200", name: "Piutang Usaha", type: "Asset" },
  { code: "1300", name: "Persediaan", type: "Asset" },
  { code: "1400", name: "PPN Masukan", type: "Asset" },
  { code: "1410", name: "Pajak Dibayar Dimuka (PPh)", type: "Asset" },
  { code: "2000", name: "Utang Usaha", type: "Liability" },
  { code: "2100", name: "PPN Keluaran", type: "Liability" },
  { code: "2110", name: "Utang PPh 23", type: "Liability" },
  { code: "2200", name: "Utang Lain-lain", type: "Liability" },
  { code: "3000", name: "Modal Disetor", type: "Equity" },
  { code: "3100", name: "Laba Ditahan", type: "Equity" },
  { code: "4000", name: "Pendapatan Penjualan", type: "Revenue" },
  { code: "4100", name: "Pendapatan Lain-lain", type: "Revenue" },
  { code: "5000", name: "Pembelian / Harga Pokok Penjualan", type: "Expense" },
  { code: "6000", name: "Beban Gaji", type: "Expense" },
  { code: "6100", name: "Beban Reimbursement", type: "Expense" },
  { code: "6200", name: "Beban Operasional", type: "Expense" },
  { code: "6900", name: "Beban Lain-lain", type: "Expense" },
];

const seeded = new Set<string>();

export async function ensureDefaultAccounts(db: Db, companyId: string) {
  if (seeded.has(companyId)) return;
  await db.chartOfAccount.createMany({
    data: DEFAULT_ACCOUNTS.map((a) => ({ companyId, accountCode: a.code, accountName: a.name, accountType: a.type })),
    skipDuplicates: true,
  });
  seeded.add(companyId);
}

interface Line {
  accountCode: string;
  description: string;
  debit: number;
  credit: number;
}
interface Draft {
  companyId: string;
  date: Date;
  description: string;
  lines: Line[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

async function nextEntryNumber(db: Db, companyId: string, year: number) {
  const prefix = `JE-${year}-`;
  const last = await db.journalEntry.findFirst({
    where: { companyId, entryNumber: { startsWith: prefix } },
    orderBy: { entryNumber: "desc" },
    select: { entryNumber: true },
  });
  const seq = last ? parseInt(last.entryNumber.slice(prefix.length), 10) || 0 : 0;
  return `${prefix}${String(seq + 1).padStart(4, "0")}`;
}

async function buildDraft(db: Db, sourceType: string, sourceId: string): Promise<Draft | null> {
  if (sourceType === "Invoice") {
    const inv = await db.invoice.findUnique({ where: { id: sourceId } });
    if (!inv || inv.deletedAt || inv.status === "draft" || inv.status === "cancelled") return null;
    const grand = Number(inv.grandTotal);
    const tax = Number(inv.taxAmount);
    if (grand <= 0) return null;
    const pph = Math.min(Number(inv.pphAmount), grand);
    const lines: Line[] = [
      { accountCode: ACCOUNT.AR, description: `Piutang ${inv.invoiceNumber}`, debit: r2(grand - pph), credit: 0 },
      { accountCode: ACCOUNT.REVENUE, description: `Penjualan ${inv.invoiceNumber}`, debit: 0, credit: r2(grand - tax) },
    ];
    if (tax > 0) lines.push({ accountCode: ACCOUNT.PPN_OUT, description: `PPN keluaran ${inv.invoiceNumber}`, debit: 0, credit: tax });
    if (pph > 0) lines.splice(1, 0, { accountCode: ACCOUNT.PPH_PREPAID, description: `PPh 23 dipotong customer ${inv.invoiceNumber}`, debit: pph, credit: 0 });
    return { companyId: inv.companyId, date: inv.invoiceDate, description: `Invoice ${inv.invoiceNumber}`, lines };
  }

  if (sourceType === "Bill") {
    const bill = await db.bill.findUnique({ where: { id: sourceId } });
    if (!bill || bill.deletedAt || bill.status === "draft" || bill.status === "cancelled") return null;
    const grand = Number(bill.grandTotal);
    const tax = Number(bill.taxAmount);
    if (grand <= 0) return null;
    const pph = Math.min(Number(bill.pphAmount), grand);
    const lines: Line[] = [
      { accountCode: ACCOUNT.PURCHASES, description: `Pembelian ${bill.billNumber}`, debit: r2(grand - tax), credit: 0 },
      { accountCode: ACCOUNT.AP, description: `Utang ${bill.billNumber}`, debit: 0, credit: r2(grand - pph) },
    ];
    if (pph > 0) lines.push({ accountCode: ACCOUNT.PPH_PAYABLE, description: `PPh 23 dipotong dari vendor ${bill.billNumber}`, debit: 0, credit: pph });
    if (tax > 0) lines.splice(1, 0, { accountCode: ACCOUNT.PPN_IN, description: `PPN masukan ${bill.billNumber}`, debit: tax, credit: 0 });
    return { companyId: bill.companyId, date: bill.billDate, description: `Bill ${bill.billNumber}`, lines };
  }

  if (sourceType === "PphRemit") {
    const bill = await db.bill.findUnique({ where: { id: sourceId } });
    const pph = bill ? Number(bill.pphAmount) : 0;
    if (!bill || bill.deletedAt || bill.status === "draft" || bill.status === "cancelled" || !bill.pphRemittedAt || pph <= 0) return null;
    return {
      companyId: bill.companyId,
      date: bill.pphRemittedAt,
      description: `Setor PPh 23 ${bill.billNumber}`,
      lines: [
        { accountCode: ACCOUNT.PPH_PAYABLE, description: `Setor PPh 23 ${bill.billNumber}`, debit: pph, credit: 0 },
        { accountCode: ACCOUNT.BANK, description: `Setor PPh 23 ${bill.billNumber}`, debit: 0, credit: pph },
      ],
    };
  }

  if (sourceType === "Payment") {
    const pay = await db.payment.findUnique({ where: { id: sourceId } });
    const amount = pay ? Number(pay.amount) : 0;
    if (!pay || pay.status === "reversed" || amount <= 0) return null;
    const cash = pay.method === "cash" ? ACCOUNT.CASH : ACCOUNT.BANK;
    if (pay.supplierId) {
      return {
        companyId: pay.companyId,
        date: pay.paymentDate,
        description: `Pembayaran vendor ${pay.paymentNumber}`,
        lines: [
          { accountCode: ACCOUNT.AP, description: pay.paymentNumber, debit: amount, credit: 0 },
          { accountCode: cash, description: pay.paymentNumber, debit: 0, credit: amount },
        ],
      };
    }
    return {
      companyId: pay.companyId,
      date: pay.paymentDate,
      description: `Penerimaan ${pay.paymentNumber}`,
      lines: [
        { accountCode: cash, description: pay.paymentNumber, debit: amount, credit: 0 },
        { accountCode: ACCOUNT.AR, description: pay.paymentNumber, debit: 0, credit: amount },
      ],
    };
  }

  if (sourceType === "Reimbursement") {
    const r = await db.reimbursement.findUnique({ where: { id: sourceId }, include: { employee: { select: { companyId: true } } } });
    const amount = r ? Number(r.amount) : 0;
    if (!r || r.status !== "paid" || amount <= 0) return null;
    return {
      companyId: r.employee.companyId,
      date: r.approvedAt ?? r.submissionDate,
      description: `Reimbursement ${r.reimbursementNumber}`,
      lines: [
        { accountCode: ACCOUNT.REIMBURSEMENT, description: r.reimbursementNumber, debit: amount, credit: 0 },
        { accountCode: ACCOUNT.CASH, description: r.reimbursementNumber, debit: 0, credit: amount },
      ],
    };
  }
  return null;
}

// Line descriptions are compared too: they carry the document number, so a renumbered invoice must refresh its journal.
const same = (a: { accountCode: string; description: string | null; debitAmount: unknown; creditAmount: unknown }[], b: Line[]) =>
  a.length === b.length &&
  a.every((x, i) => x.accountCode === b[i].accountCode && (x.description ?? "") === (b[i].description ?? "") && Number(x.debitAmount) === b[i].debit && Number(x.creditAmount) === b[i].credit);

// Keeps the system-generated journal for one source document in step with the document.
export async function syncJournal(db: Db, sourceType: string, sourceId: string) {
  const draft = await buildDraft(db, sourceType, sourceId);
  const existing = await db.journalEntry.findFirst({
    where: { sourceType, sourceId },
    include: { lines: { orderBy: { createdAt: "asc" } } },
  });

  if (!draft) {
    if (existing) await db.journalEntry.delete({ where: { id: existing.id } });
    return;
  }

  await ensureDefaultAccounts(db, draft.companyId);

  if (existing) {
    if (existing.entryDate.getTime() === draft.date.getTime() && existing.description === draft.description && same(existing.lines, draft.lines)) return;
    await db.journalLine.deleteMany({ where: { journalId: existing.id } });
    await db.journalEntry.update({
      where: { id: existing.id },
      data: {
        entryDate: draft.date,
        description: draft.description,
        lines: { create: draft.lines.map(toLine) },
      },
    });
    return;
  }

  await db.journalEntry.create({
    data: {
      companyId: draft.companyId,
      entryNumber: await nextEntryNumber(db, draft.companyId, draft.date.getFullYear()),
      entryDate: draft.date,
      description: draft.description,
      status: "posted",
      postedBy: "system",
      postedAt: new Date(),
      createdBy: "system",
      sourceType,
      sourceId,
      lines: { create: draft.lines.map(toLine) },
    },
  });
}

function toLine(l: Line) {
  return { accountCode: l.accountCode, description: l.description, debitAmount: l.debit, creditAmount: l.credit };
}

const SYNCED = new Set(["Invoice", "Bill", "Payment", "Reimbursement"]);

export function installAccountingSync(client: PrismaClient) {
  const flagged = client as unknown as { __acctInstalled?: boolean };
  if (flagged.__acctInstalled) return;
  flagged.__acctInstalled = true;

  client.$use(async (params, next) => {
    const model = params.model;
    const result = await next(params);
    if (!model || !SYNCED.has(model) || !["create", "update", "delete"].includes(params.action)) return result;
    // Inside an interactive transaction the row is not committed yet, so the journal would be built from stale data.
    if (params.runInTransaction) return result;
    try {
      const id = (result as { id?: string } | null)?.id;
      if (id) {
        await syncJournal(client, model, id);
        if (model === "Bill") await syncJournal(client, "PphRemit", id);
      }
    } catch (err) {
      console.error("journal sync failed:", err);
    }
    return result;
  });
}
