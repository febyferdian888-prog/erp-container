/** Formats a running sequence into a document number like "INV-2026-0007". */
export function formatDocumentNumber(prefix: string, year: number, sequence: number): string {
  return `${prefix}-${year}-${String(sequence).padStart(4, "0")}`;
}

export function currentYearRange(): { year: number; start: Date; end: Date } {
  const year = new Date().getFullYear();
  return { year, start: new Date(year, 0, 1), end: new Date(year + 1, 0, 1) };
}
