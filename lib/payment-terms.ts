// "N30", "Net 30", "TOP 30 hari" -> 30. Cash/COD/tunai -> 2. Numbers outside 1-90 and anything else -> null (due date stays manual).
export const CASH_DUE_DAYS = 2;
export const MIN_TERM_DAYS = 1;
export const MAX_TERM_DAYS = 90;

export function termsToDays(terms: string | null | undefined): number | null {
  const t = (terms || "").trim();
  if (!t) return null;
  if (/\b(cash|tunai|cod|lunas)\b/i.test(t)) return CASH_DUE_DAYS;
  const m = t.match(/\d+/);
  if (!m) return null;
  const days = parseInt(m[0], 10);
  return days >= MIN_TERM_DAYS && days <= MAX_TERM_DAYS ? days : null;
}

// invoiceDate is "YYYY-MM-DD"; UTC math avoids timezone/DST drift.
export function dueDateFor(invoiceDate: string, terms: string | null | undefined): string | null {
  const days = termsToDays(terms);
  if (days === null || !/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) return null;
  const [y, m, d] = invoiceDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().split("T")[0];
}
