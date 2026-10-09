/** Formats a running sequence into a document number like "INV-2026-0007". */
export function formatDocumentNumber(prefix: string, year: number, sequence: number): string {
  return `${prefix}-${year}-${String(sequence).padStart(4, "0")}`;
}

export function currentYearRange(): { year: number; start: Date; end: Date } {
  const year = new Date().getFullYear();
  return { year, start: new Date(year, 0, 1), end: new Date(year + 1, 0, 1) };
}

// PT MDA's own numbering, used on paper long before this app existed — kept so
// invoices, quotations, and surat jalan generated here read exactly like the
// ones the company has always issued (Tahap 9 audit: system-generated numbers
// like "INV-2026-0048" didn't match the format staff and customers expect).
const ROMAN_MONTHS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

function romanMonth(date: Date): string {
  return ROMAN_MONTHS[date.getMonth()];
}

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

export function formatMdaInvoiceNumber(seq: number, date: Date): string {
  return `${pad3(seq)}/MDA-INV/${romanMonth(date)}/${date.getFullYear()}`;
}

export function formatMdaDeliveryNumber(seq: number, date: Date): string {
  return `${pad3(seq)}/SJ-MDA/${romanMonth(date)}/${date.getFullYear()}`;
}

export function formatMdaQuotationNumber(seq: number, date: Date): string {
  return `${pad3(seq)}/MDA/${romanMonth(date)}-${date.getFullYear()}`;
}

const MDA_INVOICE_RE = /^(\d+)\/MDA-INV\/[IVXLC]+\/(\d{4})$/i;
const INVOICE_SYSTEM_RE = /^INV-(\d{4})-(\d+)$/;
const MDA_DELIVERY_RE = /^(\d+)\/SJ-MDA\/[IVXLC]+\/(\d{4})$/i;
const DELIVERY_SYSTEM_RE = /^SJ-(\d{4})-(\d+)$/;
const MDA_QUOTATION_RE = /^(\d+)\/MDA\/[IVXLC]+-(\d{4})$/i;

/**
 * Highest sequence number already used for `year` in the MDA paper format,
 * plus (for Invoice/Delivery only) this app's old "PREFIX-YYYY-NNNN" format —
 * that old format really did count up one-per-document, so folding it in
 * avoids picking a lower number than documents already created this way. Not
 * applied to Quotation: its old "QT-YYYY-NNNN" suffix was a random
 * Date.now() tail, not a count, so treating it as a sequence would produce
 * absurd numbers (Tahap 9 audit — none of the existing numbers are
 * renumbered, this only affects what gets generated going forward).
 */
function maxSequenceForYear(numbers: string[], year: number, legacyRe: RegExp, systemRe: RegExp | null): number {
  let max = 0;
  for (const n of numbers) {
    const legacy = n.match(legacyRe);
    if (legacy && Number(legacy[2]) === year) {
      max = Math.max(max, parseInt(legacy[1], 10));
      continue;
    }
    const system = systemRe ? n.match(systemRe) : null;
    if (system && Number(system[1]) === year) {
      max = Math.max(max, parseInt(system[2], 10));
    }
  }
  return max;
}

export function nextInvoiceSequence(existingNumbers: string[], date: Date): number {
  return maxSequenceForYear(existingNumbers, date.getFullYear(), MDA_INVOICE_RE, INVOICE_SYSTEM_RE) + 1;
}

export function nextDeliverySequence(existingNumbers: string[], date: Date): number {
  return maxSequenceForYear(existingNumbers, date.getFullYear(), MDA_DELIVERY_RE, DELIVERY_SYSTEM_RE) + 1;
}

export function nextQuotationSequence(existingNumbers: string[], date: Date): number {
  return maxSequenceForYear(existingNumbers, date.getFullYear(), MDA_QUOTATION_RE, null) + 1;
}
