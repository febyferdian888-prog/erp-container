// Nomor faktur pajak is 16 digits (the older 010.000-24.12345678 layout is the same 16 digits).
export const digitsOnly = (s: unknown) => String(s ?? "").replace(/\D/g, "");

export function parseTaxInvoiceNumber(input: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const d = digitsOnly(input);
  if (d.length !== 16) return { ok: false, error: "Nomor faktur pajak harus 16 digit" };
  return { ok: true, value: d };
}

export const formatTaxInvoiceNumber = (n: string | null | undefined) =>
  n && n.length === 16 ? `${n.slice(0, 3)}.${n.slice(3, 6)}-${n.slice(6, 8)}.${n.slice(8)}` : n ?? "";
