import { prisma } from "@/lib/db";
import { normName } from "@/lib/name-utils";

export interface ImportRow {
  row: number;
  date: string | null;
  dateRaw: string;
  vendor: string;
  invoiceNo: string;
  partNumber: string;
  description: string;
  qty: number | null;
  unit: string;
  unitPrice: number | null;
  amount: number | null;
  ppn: number | null;
  pph: number | null;
  dueDate: string | null;
  soRef: string;
  paidDate: string | null;
  paidAmount: number | null;
  notes: string;
}

export interface ImportOptions {
  defaultPpn: number;
  pricesIncludePpn: boolean;
  defaultDueDays: number;
}

export interface PreviewItem {
  row: number;
  partNumber: string;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  subtotal: number;
  soRef: string;
  soId: string | null;
  soNumber: string | null;
  notes: string;
}

export interface PreviewBill {
  key: string;
  vendorName: string;
  invoiceNo: string;
  date: string | null;
  dueDate: string | null;
  ppn: number;
  total: number;
  tax: number;
  grand: number;
  pph: number;
  paidDate: string | null;
  paidAmount: number;
  notes: string;
  items: PreviewItem[];
  errors: string[];
  warnings: string[];
  status: "ok" | "error" | "duplicate";
}

export interface VendorMatch {
  name: string;
  rows: number;
  supplierId: string | null;
  suggestions: { id: string; name: string }[];
}

function similarity(a: string, b: string) {
  const ta = new Set(a.split(" ").filter(Boolean));
  const tb = new Set(b.split(" ").filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let common = 0;
  ta.forEach((t) => tb.has(t) && common++);
  return common / Math.max(ta.size, tb.size);
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export async function analyzePurchaseImport(companyId: string, rows: ImportRow[], opt: ImportOptions) {
  const [suppliers, salesOrders, existingBills] = await Promise.all([
    prisma.supplier.findMany({ where: { companyId, deletedAt: null }, select: { id: true, name: true } }),
    prisma.salesOrder.findMany({
      where: { companyId, deletedAt: null },
      select: { id: true, soNumber: true, poNumber: true },
    }),
    prisma.bill.findMany({
      where: { companyId, deletedAt: null },
      select: { supplierId: true, vendorInvoiceNumber: true, billNumber: true, billDate: true, totalAmount: true },
    }),
  ]);

  const supplierByNorm = new Map(suppliers.map((s) => [normName(s.name), s]));
  const soByRef = new Map<string, { id: string; soNumber: string }>();
  for (const so of salesOrders) {
    soByRef.set(so.poNumber.trim().toLowerCase(), so);
    soByRef.set(so.soNumber.trim().toLowerCase(), so);
  }

  // ---- vendors
  const vendorRows = new Map<string, { name: string; rows: number }>();
  for (const r of rows) {
    const name = r.vendor.trim();
    if (!name) continue;
    const key = normName(name);
    const v = vendorRows.get(key) ?? { name, rows: 0 };
    v.rows++;
    vendorRows.set(key, v);
  }
  const vendors: VendorMatch[] = [...vendorRows.entries()].map(([key, v]) => {
    const exact = supplierByNorm.get(key);
    const suggestions = exact
      ? []
      : suppliers
          .map((s) => ({ s, score: similarity(key, normName(s.name)) }))
          .filter((x) => x.score >= 0.5)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
          .map((x) => ({ id: x.s.id, name: x.s.name }));
    return { name: v.name, rows: v.rows, supplierId: exact?.id ?? null, suggestions };
  });

  // ---- group rows into bills
  const groups = new Map<string, ImportRow[]>();
  for (const r of rows) {
    const inv = r.invoiceNo.trim().toLowerCase();
    const key = `${normName(r.vendor)}|${inv || `noinv:${r.date ?? "?"}`}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const existingKey = new Set(
    existingBills
      .filter((b) => b.vendorInvoiceNumber)
      .map((b) => `${b.supplierId}|${b.vendorInvoiceNumber!.trim().toLowerCase()}`)
  );

  const bills: PreviewBill[] = [];
  for (const [key, grows] of groups) {
    const first = grows[0];
    const errors: string[] = [];
    const warnings: string[] = [];
    const vendorName = first.vendor.trim();
    if (!vendorName) errors.push("Vendor kosong");

    const date = grows.find((g) => g.date)?.date ?? null;
    if (!date) errors.push(first.dateRaw ? `Tanggal tidak terbaca: "${first.dateRaw}"` : "Tanggal kosong");

    const ppn = grows.find((g) => g.ppn !== null)?.ppn ?? opt.defaultPpn;
    const divisor = opt.pricesIncludePpn ? 1 + ppn / 100 : 1;

    const items: PreviewItem[] = [];
    for (const g of grows) {
      const rowErr: string[] = [];
      if (!g.description.trim() && !g.partNumber.trim()) rowErr.push("deskripsi/nomor part kosong");
      if (g.qty === null || g.qty <= 0) rowErr.push("qty tidak valid");
      let unitPrice = g.unitPrice;
      if (unitPrice === null && g.amount !== null && g.qty && g.qty > 0) unitPrice = g.amount / g.qty;
      if (unitPrice === null || unitPrice < 0) rowErr.push("harga kosong");
      if (rowErr.length) {
        errors.push(`Baris ${g.row}: ${rowErr.join(", ")}`);
        continue;
      }
      const price = r2(unitPrice! / divisor);
      const so = g.soRef.trim() ? soByRef.get(g.soRef.trim().toLowerCase()) : undefined;
      if (g.soRef.trim() && !so) warnings.push(`Baris ${g.row}: referensi "${g.soRef.trim()}" tidak cocok dengan Sales Order mana pun`);
      items.push({
        row: g.row,
        partNumber: g.partNumber.trim(),
        description: g.description.trim() || g.partNumber.trim(),
        qty: g.qty!,
        unit: g.unit.trim() || "pcs",
        unitPrice: price,
        subtotal: r2(g.qty! * price),
        soRef: g.soRef.trim(),
        soId: so?.id ?? null,
        soNumber: so?.soNumber ?? null,
        notes: g.notes.trim(),
      });
    }

    const invoiceNo = first.invoiceNo.trim();
    if (!invoiceNo) warnings.push("Tanpa nomor invoice vendor: dikelompokkan per vendor dan tanggal");

    const total = r2(items.reduce((s, i) => s + i.subtotal, 0));
    const tax = r2((total * ppn) / 100);
    const dueDate = grows.find((g) => g.dueDate)?.dueDate ?? (date ? addDays(date, opt.defaultDueDays) : null);
    const paidDate = grows.find((g) => g.paidDate)?.paidDate ?? null;
    const paidRaw = grows.reduce((s, g) => s + (g.paidAmount ?? 0), 0);
    const grand = r2(total + tax);
    const pph = Math.min(r2(grows.reduce((t, g) => t + (g.pph ?? 0), 0)), grand);
    const paidAmount = paidRaw > 0 ? Math.min(paidRaw, grand) : paidDate ? grand : 0;

    let status: PreviewBill["status"] = errors.length ? "error" : "ok";
    const supplier = supplierByNorm.get(normName(vendorName));
    if (status === "ok" && supplier && invoiceNo && existingKey.has(`${supplier.id}|${invoiceNo.toLowerCase()}`)) {
      status = "duplicate";
      warnings.push("Invoice vendor ini sudah pernah diinput, akan dilewati");
    }
    if (status === "ok" && supplier && !invoiceNo && date) {
      const same = existingBills.find(
        (b) => b.supplierId === supplier.id && b.billDate.toISOString().slice(0, 10) === date && Math.abs(Number(b.totalAmount) - total) < 1
      );
      if (same) warnings.push(`Mirip dengan ${same.billNumber} (vendor, tanggal, dan nilai sama). Cek supaya tidak ganda`);
    }

    bills.push({
      key, vendorName, invoiceNo, date, dueDate, ppn, total, tax, grand, pph, paidDate, paidAmount,
      notes: [...new Set(grows.map((g) => g.notes.trim()).filter(Boolean))].join("; "),
      items, errors, warnings, status,
    });
  }

  bills.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.vendorName.localeCompare(b.vendorName));

  const ok = bills.filter((b) => b.status === "ok");
  const linkedItems = bills.flatMap((b) => b.items).filter((i) => i.soId).length;
  return {
    vendors,
    bills,
    summary: {
      rows: rows.length,
      bills: bills.length,
      ready: ok.length,
      errors: bills.filter((b) => b.status === "error").length,
      duplicates: bills.filter((b) => b.status === "duplicate").length,
      newVendors: vendors.filter((v) => !v.supplierId).length,
      grandTotal: r2(ok.reduce((s, b) => s + b.grand, 0)),
      linkedItems,
      totalItems: bills.reduce((s, b) => s + b.items.length, 0),
    },
  };
}
