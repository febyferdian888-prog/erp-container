export interface CompanyPdfInfo {
  name: string;
  description?: string | null;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  phone?: string | null;
  email?: string | null;
  npwp?: string | null;
  bankName?: string | null;
  bankAccount?: string | null;
}

// Up to 3 lines: street address; city/province/postal; phone · email · NPWP.
export function companyDetailLines(c: CompanyPdfInfo): string[] {
  const lines: string[] = [];
  if (c.address) lines.push(c.address);
  const locality = [c.city, c.province].filter(Boolean).join(", ") + (c.postalCode ? ` ${c.postalCode}` : "");
  if (locality.trim()) lines.push(locality.trim());
  const contact = [c.phone, c.email, c.npwp ? `NPWP ${c.npwp}` : null].filter(Boolean).join("  ·  ");
  if (contact) lines.push(contact);
  return lines;
}
