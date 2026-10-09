import type { Prisma, PrismaClient } from "@prisma/client";
import { matchPart, normPart } from "./part-match";

type Db = PrismaClient | Prisma.TransactionClient;

export interface UnregisteredPart {
  line: number;
  partNumber: string;
  suggestions: string[];
}

// Every sold item must carry a part number that exists in the sparepart master
// (SKU, ignoring dashes/spacing/case). Empty and unknown parts are reported with
// the closest registered numbers so the user can pick the right one.
export async function findUnregisteredParts(
  db: Db,
  companyId: string,
  items: { partNumber?: string | null }[]
): Promise<UnregisteredPart[]> {
  const products = await db.product.findMany({ where: { companyId, deletedAt: null }, select: { sku: true, name: true } });
  const registered = new Set(products.map((p) => normPart(p.sku)));
  const candidates = products.map((p) => ({ partNumber: p.sku, source: "master" as const, label: p.name }));

  const out: UnregisteredPart[] = [];
  items.forEach((item, idx) => {
    const part = (item.partNumber || "").trim();
    if (part && registered.has(normPart(part))) return;
    const m = part ? matchPart(part, candidates) : null;
    const suggestions = m ? (m.canonical ? [m.canonical] : m.suggestions.map((s) => s.partNumber)) : [];
    out.push({ line: idx + 1, partNumber: part, suggestions });
  });
  return out;
}

export function unregisteredMessage(list: UnregisteredPart[]) {
  const shown = list
    .slice(0, 6)
    .map((u) => {
      const label = u.partNumber ? `"${u.partNumber}"` : "(kosong)";
      return `baris ${u.line} ${label}${u.suggestions.length ? ` — mirip: ${u.suggestions.join(", ")}` : ""}`;
    })
    .join("; ");
  return `Part number wajib terdaftar di master sparepart. Belum terdaftar: ${shown}${list.length > 6 ? `; dan ${list.length - 6} lainnya` : ""}.`;
}

// Purchase order lines must point at a master sparepart (productId) so stock, price
// history, and goods receipts all key off the same record. Returns the 1-based line
// numbers whose productId is missing or not a live product of this company.
export async function findUnlinkedProductLines(
  db: Db,
  companyId: string,
  items: { productId?: string | null }[]
): Promise<number[]> {
  const ids = [...new Set(items.map((i) => i.productId).filter((v): v is string => !!v))];
  const found = ids.length
    ? await db.product.findMany({ where: { id: { in: ids }, companyId, deletedAt: null }, select: { id: true } })
    : [];
  const valid = new Set(found.map((p) => p.id));
  const bad: number[] = [];
  items.forEach((item, idx) => {
    if (!item.productId || !valid.has(item.productId)) bad.push(idx + 1);
  });
  return bad;
}

export function unlinkedProductMessage(lines: number[]) {
  return `Item baris ${lines.join(", ")} belum terhubung ke master sparepart. Cari di Master Sparepart, atau daftarkan dulu sebagai item baru.`;
}
