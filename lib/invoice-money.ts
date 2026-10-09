/**
 * Single source of truth for invoice/bill payment math. Every page that shows
 * a balance, a payment badge, or an overdue flag must derive it from here,
 * never from the stored `status` column alone — that column can go stale
 * relative to grandTotal/paidAmount after an item edit (see Tahap 1 audit,
 * invoice 021/MDA-INV/XII/2025: stored status stayed "paid" after a line-item
 * edit raised grandTotal past what was actually collected).
 *
 * `paidAmount` on Invoice/Bill already includes PPh withheld (see schema
 * comment: "cash received + PPh withheld"), so cash actually collected is
 * paidAmount - pphAmount.
 */

// Accepts Prisma's Decimal (or any value with a usable Number() conversion),
// plain numbers, or numeric strings — call sites pass Decimal fields straight through.
type Numeric = number | string | { toString(): string };

export interface MoneyRow {
  grandTotal: Numeric;
  paidAmount: Numeric;
  pphAmount: Numeric;
  status: string;
  dueDate: Date | string | null;
}

export type PaymentState = "unpaid" | "partial" | "paid" | "overpaid";

export interface InvoiceMoney {
  grandTotal: number;
  cashPaid: number;
  pphWithheld: number;
  totalCredited: number;
  balanceDue: number;
  overpaidAmount: number;
  paymentState: PaymentState;
  isCancelled: boolean;
  isOverdue: boolean;
  daysOverdue: number;
}

const EPS = 0.5; // rupiah rounding tolerance shared by every money comparison in this module
const round2 = (n: number) => Math.round(n * 100) / 100;

export const PAYMENT_STATE_LABEL: Record<PaymentState, string> = {
  unpaid: "Belum dibayar",
  partial: "Dibayar sebagian",
  paid: "Lunas",
  overpaid: "Kelebihan bayar",
};

export function computeInvoiceMoney(row: MoneyRow, now: Date = new Date()): InvoiceMoney {
  const grandTotal = round2(Number(row.grandTotal));
  const totalCredited = round2(Number(row.paidAmount));
  const pphWithheld = round2(Number(row.pphAmount));
  const cashPaid = round2(totalCredited - pphWithheld);
  const balanceDueRaw = round2(grandTotal - totalCredited);
  const isCancelled = row.status === "cancelled";

  let paymentState: PaymentState;
  if (balanceDueRaw <= -EPS) paymentState = "overpaid";
  else if (balanceDueRaw <= EPS) paymentState = "paid";
  else if (totalCredited > EPS) paymentState = "partial";
  else paymentState = "unpaid";

  const dueDate = row.dueDate ? new Date(row.dueDate) : null;
  const isOverdue = !isCancelled && (paymentState === "unpaid" || paymentState === "partial") && !!dueDate && dueDate.getTime() < now.getTime();
  const daysOverdue = isOverdue && dueDate ? Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / 86400000)) : 0;

  return {
    grandTotal,
    cashPaid,
    pphWithheld,
    totalCredited,
    balanceDue: Math.max(0, balanceDueRaw),
    overpaidAmount: balanceDueRaw < 0 ? round2(-balanceDueRaw) : 0,
    paymentState,
    isCancelled,
    isOverdue,
    daysOverdue,
  };
}

/**
 * Maps computed payment state onto the legacy document-status enum
 * (draft/<preStatus>/partial_paid/paid/overdue/cancelled) so the stored
 * `status` column — still used to filter/sort in several queries — stays
 * consistent with the real money. Cancelled and draft are left untouched;
 * "overpaid" still counts as settled for workflow purposes and maps to
 * "paid". `preStatus` is "sent" for invoices and "received" for bills: the
 * pre-payment state each document type falls back to once no longer settled.
 */
export type AgingBucket = "not_due" | "1-30" | "31-60" | "61-90" | "90+";

export const AGING_BUCKET_LABEL: Record<AgingBucket, string> = {
  not_due: "Belum jatuh tempo",
  "1-30": "1-30 hari",
  "31-60": "31-60 hari",
  "61-90": "61-90 hari",
  "90+": "> 90 hari",
};

/** Aging bucket for the AR workbench (Tahap 2). Only meaningful when there is still a balance due. */
export function agingBucket(money: InvoiceMoney): AgingBucket {
  if (!money.isOverdue) return "not_due";
  if (money.daysOverdue <= 30) return "1-30";
  if (money.daysOverdue <= 60) return "31-60";
  if (money.daysOverdue <= 90) return "61-90";
  return "90+";
}

export function nextDocumentStatus(currentStatus: string, money: InvoiceMoney, preStatus: string = "sent"): string {
  if (money.isCancelled || currentStatus === "draft") return currentStatus;
  if (money.paymentState === "paid" || money.paymentState === "overpaid") return "paid";
  if (money.paymentState === "partial") return "partial_paid";
  if (money.isOverdue) return "overdue";
  if (currentStatus === "paid" || currentStatus === "partial_paid" || currentStatus === "overdue") return preStatus;
  return currentStatus;
}
