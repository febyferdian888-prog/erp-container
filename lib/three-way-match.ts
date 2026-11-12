// 3-way match: a vendor bill is only payable when it agrees with the PO (price, qty ordered)
// and the goods receipt (qty actually received). DP bills are advances and are not matched.
type Db = any;

export type MatchStatus = "matched" | "variance" | "not_received" | "legacy";

export interface MatchLine {
  description: string;
  ordered: number;
  received: number;
  billed: number; // cumulative qty billed on this PO line, including this bill
  poPrice: number;
  billPrice: number;
  problem: string | null;
}

export interface MatchResult {
  status: MatchStatus;
  note: string;
  expectedAmount: number | null;
  variance: number | null;
  lines: MatchLine[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => Math.round(n).toLocaleString("id-ID");

// Rounding noise and small vendor rounding are fine; anything above this needs a human.
export const matchTolerance = (expected: number) => Math.max(1000, Math.abs(expected) * 0.005);

export const isDpDeductionLine = (description: string) => /uang muka|penyesuaian/i.test(description);

// What the bill should total according to the PO prices: linked lines plus the pro-rata DP deduction.
export function expectedFromLines(lines: { poItemId: string | null; description: string; subtotal: unknown }[]) {
  return r2(lines.filter((l) => l.poItemId || isDpDeductionLine(l.description)).reduce((s, l) => s + Number(l.subtotal), 0));
}

export async function evaluateBillMatch(db: Db, billId: string): Promise<MatchResult | null> {
  const bill = await db.bill.findFirst({
    where: { id: billId, deletedAt: null },
    include: { items: { orderBy: { lineNumber: "asc" } } },
  });
  if (!bill || bill.billKind === "down_payment" || !bill.poId) return null;

  const linked = bill.items.filter((l: any) => l.poItemId);
  if (linked.length === 0) {
    return { status: "legacy", note: "Tagihan tanpa item PO bertaut, cocokkan manual dengan PO dan penerimaan barang", expectedAmount: null, variance: null, lines: [] };
  }

  const poItems = await db.purchaseOrderItem.findMany({ where: { id: { in: linked.map((l: any) => l.poItemId) } } });
  const byId = new Map<string, any>(poItems.map((p: any) => [p.id, p]));
  const pending = bill.status === "draft"; // qty of a draft bill is not yet in invoicedQty

  const lines: MatchLine[] = linked.map((l: any) => {
    const po = byId.get(l.poItemId);
    const ordered = Number(po?.quantity ?? 0);
    const received = Number(po?.receivedQty ?? 0);
    const billed = Number(po?.invoicedQty ?? 0) + (pending ? Number(l.quantity) : 0);
    const poPrice = Number(po?.unitPrice ?? 0);
    const billPrice = Number(l.unitPrice);
    let problem: string | null = null;
    if (!po) problem = "Item PO tidak ditemukan";
    else if (billed > ordered + 0.0001) problem = `Ditagih ${billed} melebihi pesanan ${ordered}`;
    else if (billed > received + 0.0001) problem = `Ditagih ${billed} tapi baru diterima ${received}`;
    else if (Math.abs(billPrice - poPrice) > 0.5) problem = `Harga ${fmt(billPrice)} beda dari PO ${fmt(poPrice)}`;
    return { description: l.description, ordered, received, billed, poPrice, billPrice, problem };
  });

  const expected = bill.expectedAmount != null ? Number(bill.expectedAmount) : expectedFromLines(bill.items);
  const variance = r2(Number(bill.totalAmount) - expected);
  const notReceived = lines.filter((l) => l.problem && /diterima|melebihi|tidak ditemukan/.test(l.problem));
  const priceIssues = lines.filter((l) => l.problem && !notReceived.includes(l));

  if (notReceived.length) {
    return { status: "not_received", note: notReceived.map((l) => `${l.description}: ${l.problem}`).join("; "), expectedAmount: expected, variance, lines };
  }
  if (priceIssues.length || Math.abs(variance) > matchTolerance(expected)) {
    const parts = priceIssues.map((l) => `${l.description}: ${l.problem}`);
    if (Math.abs(variance) > matchTolerance(expected)) parts.push(`Total invoice vendor ${fmt(Number(bill.totalAmount))} vs hitungan PO ${fmt(expected)} (selisih ${variance > 0 ? "+" : "-"}${fmt(Math.abs(variance))})`);
    return { status: "variance", note: parts.join("; "), expectedAmount: expected, variance, lines };
  }
  return { status: "matched", note: "Cocok dengan PO dan penerimaan barang", expectedAmount: expected, variance, lines };
}

// Payable when it matched, has no matched data to judge (legacy), or Finance signed off on the difference.
export function isPayableByMatch(bill: { matchStatus: string | null; matchOverrideAt: Date | null }, live: MatchResult | null) {
  if (!live) return true;
  if (live.status === "matched" || live.status === "legacy") return true;
  return !!bill.matchOverrideAt;
}

// Recompute and store the result on the bill (call outside a transaction).
export async function refreshBillMatch(db: Db, billId: string) {
  const res = await evaluateBillMatch(db, billId);
  if (!res) return null;
  await db.bill.update({
    where: { id: billId },
    data: { matchStatus: res.status, matchNote: res.note.slice(0, 500), ...(res.expectedAmount != null ? { expectedAmount: res.expectedAmount } : {}) },
  });
  return res;
}
