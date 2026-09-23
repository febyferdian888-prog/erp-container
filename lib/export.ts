import * as XLSX from "xlsx";
import { prisma } from "./db";
import type { Area } from "./rbac-shared";

type Cell = string | number | boolean | Date | null;
export interface Sheet {
  name: string;
  rows: Record<string, Cell>[];
}
interface Ctx {
  companyIds: string[];
  from?: Date;
  to?: Date; // exclusive upper bound
}
export interface Dataset {
  key: string;
  label: string;
  group: string;
  area: Area;
  dated: boolean;
  description?: string;
  load: (ctx: Ctx) => Promise<Sheet[]>;
}

// ---------------------------------------------------------------- helpers
const WORDS: Record<string, string> = {
  po: "PO", so: "SO", pr: "PR", gr: "GR", ppn: "PPN", pph: "PPh", sku: "SKU", npwp: "NPWP", rfq: "RFQ", qty: "Qty",
  bom: "BOM", id: "ID", uom: "UoM", pic: "PIC",
};
function humanize(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(" ")
    .map((w) => WORDS[w.toLowerCase()] ?? w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const SKIP = new Set(["id", "password", "deletedAt", "updatedAt", "data", "filePath"]);

function normalize(v: unknown): Cell | undefined {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "object" && "toFixed" in (v as object)) return Number(v as { toString(): string }); // Prisma Decimal
  return undefined; // relations, buffers
}

// Extra readable columns first, then every plain column of the row (foreign-key ids left out).
function flat(row: Record<string, unknown>, extras: Record<string, Cell> = {}, omit: string[] = []): Record<string, Cell> {
  const out: Record<string, Cell> = { ...extras };
  for (const [k, v] of Object.entries(row)) {
    if (SKIP.has(k) || (k.endsWith("Id") && k !== "vendorInvoiceNumber") || omit.includes(k)) continue;
    const n = normalize(v);
    if (n !== undefined) out[humanize(k)] = n;
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Delegate = { findMany: (args: any) => Promise<any[]> };

// Not every model has a deletedAt column, so try with it and fall back.
async function fetchAll(model: Delegate, args: Record<string, unknown>): Promise<Record<string, any>[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    return await model.findMany({ ...args, where: { ...(args.where as object), deletedAt: null } });
  } catch {
    return await model.findMany(args);
  }
}

function range(field: string, ctx: Ctx) {
  if (!ctx.from && !ctx.to) return {};
  return { [field]: { ...(ctx.from ? { gte: ctx.from } : {}), ...(ctx.to ? { lt: ctx.to } : {}) } };
}

const co = (ctx: Ctx) => ({ companyId: { in: ctx.companyIds } });
const name = (r?: { name?: string | null } | null) => r?.name ?? null;

async function attachmentScope(ctx: Ctx) {
  const [rfqs, quotations, salesOrders, deliveries, invoices, payments, purchaseRequests, purchaseOrders, goodsReceipts, priceInquiries, bills, projects, workOrders] = await Promise.all([
    prisma.rFQ.findMany({ where: co(ctx), select: { id: true } }),
    prisma.quotation.findMany({ where: co(ctx), select: { id: true } }),
    prisma.salesOrder.findMany({ where: co(ctx), select: { id: true } }),
    prisma.delivery.findMany({ where: co(ctx), select: { id: true } }),
    prisma.invoice.findMany({ where: co(ctx), select: { id: true } }),
    prisma.payment.findMany({ where: co(ctx), select: { id: true } }),
    prisma.purchaseRequest.findMany({ where: co(ctx), select: { id: true } }),
    prisma.purchaseOrder.findMany({ where: co(ctx), select: { id: true } }),
    prisma.goodsReceipt.findMany({ where: co(ctx), select: { id: true } }),
    prisma.priceInquiry.findMany({ where: co(ctx), select: { id: true } }),
    prisma.bill.findMany({ where: co(ctx), select: { id: true } }),
    prisma.project.findMany({ where: co(ctx), select: { id: true } }),
    prisma.workOrder.findMany({ where: co(ctx), select: { id: true } }),
  ]);
  const refs = [
    ["RFQ", rfqs], ["Quotation", quotations], ["SalesOrder", salesOrders], ["Delivery", deliveries],
    ["Invoice", invoices], ["Payment", payments], ["PurchaseRequest", purchaseRequests], ["PurchaseOrder", purchaseOrders],
    ["GoodsReceipt", goodsReceipts], ["PriceInquiry", priceInquiries], ["Bill", bills], ["Project", projects], ["WorkOrder", workOrders],
  ] as const;
  return {
    deletedAt: null,
    OR: refs.map(([referenceType, rows]) => ({ referenceType, referenceId: { in: rows.map((row) => row.id) } })),
  };
}

// Header + items sheets for a document that has line items.
async function withItems(
  ctx: Ctx,
  cfg: {
    model: Delegate;
    include: Record<string, unknown>;
    dateField: string;
    sheet: string;
    itemSheet: string;
    numberKey: string;
    itemsKey?: string;
    headExtras: (r: Record<string, any>) => Record<string, Cell>; // eslint-disable-line @typescript-eslint/no-explicit-any
    itemExtras?: (i: Record<string, any>, parent: Record<string, any>) => Record<string, Cell>; // eslint-disable-line @typescript-eslint/no-explicit-any
    orderBy?: Record<string, string>;
  }
): Promise<Sheet[]> {
  const rows = await fetchAll(cfg.model, {
    where: { ...co(ctx), ...range(cfg.dateField, ctx) },
    include: cfg.include,
    orderBy: cfg.orderBy ?? { [cfg.dateField]: "asc" },
  });
  const itemsKey = cfg.itemsKey ?? "items";
  const head: Sheet = { name: cfg.sheet, rows: [] };
  const items: Sheet = { name: cfg.itemSheet, rows: [] };
  for (const r of rows) {
    head.rows.push(flat(r, cfg.headExtras(r)));
    for (const it of (r[itemsKey] as Record<string, any>[]) ?? []) { // eslint-disable-line @typescript-eslint/no-explicit-any
      items.rows.push(flat(it, { [humanize(cfg.numberKey)]: r[cfg.numberKey] ?? null, ...(cfg.itemExtras?.(it, r) ?? {}) }));
    }
  }
  return [head, items];
}

// ---------------------------------------------------------------- datasets
export const DATASETS: Dataset[] = [
  // ---- penjualan
  {
    key: "customers", label: "Customer", group: "Penjualan", area: "sales", dated: false,
    load: async (ctx) => [{ name: "Customer", rows: (await fetchAll(prisma.customer, { where: co(ctx), orderBy: { code: "asc" } })).map((r) => flat(r)) }],
  },
  {
    key: "rfqs", label: "RFQ", group: "Penjualan", area: "sales", dated: true,
    load: (ctx) => withItems(ctx, {
      model: prisma.rFQ, include: { customer: true, items: { orderBy: { lineNumber: "asc" } } }, dateField: "requestDate",
      sheet: "RFQ", itemSheet: "RFQ Item", numberKey: "number", headExtras: (r) => ({ Customer: name(r.customer) }),
    }),
  },
  {
    key: "quotations", label: "Quotation", group: "Penjualan", area: "sales", dated: true,
    load: (ctx) => withItems(ctx, {
      model: prisma.quotation, include: { customer: true, rfq: true, items: { orderBy: { lineNumber: "asc" } } }, dateField: "quotationDate",
      sheet: "Quotation", itemSheet: "Quotation Item", numberKey: "number",
      headExtras: (r) => ({ Customer: name(r.customer), "RFQ Number": r.rfq?.number ?? null }),
    }),
  },
  {
    key: "sales-orders", label: "Sales Order", group: "Penjualan", area: "sales", dated: true,
    load: (ctx) => withItems(ctx, {
      model: prisma.salesOrder, include: { customer: true, quotation: true, items: { orderBy: { lineNumber: "asc" } } }, dateField: "poDate",
      sheet: "Sales Order", itemSheet: "SO Item", numberKey: "soNumber",
      headExtras: (r) => ({ Customer: name(r.customer), "Quotation Number": r.quotation?.number ?? null }),
      itemExtras: (_i, p) => ({ "Customer PO Number": p.poNumber }),
    }),
  },
  {
    key: "deliveries", label: "Surat Jalan", group: "Penjualan", area: "sales", dated: true,
    load: (ctx) => withItems(ctx, {
      model: prisma.delivery, include: { customer: true, salesOrder: true, warehouse: true, items: { orderBy: { lineNumber: "asc" } } }, dateField: "deliveryDate",
      sheet: "Surat Jalan", itemSheet: "SJ Item", numberKey: "deliveryNumber",
      headExtras: (r) => ({ Customer: name(r.customer), "SO Number": r.salesOrder?.soNumber ?? null, Warehouse: name(r.warehouse) }),
    }),
  },
  // ---- pengadaan & stok
  {
    key: "suppliers", label: "Vendor", group: "Pengadaan & stok", area: "purchasing", dated: false,
    load: async (ctx) => [{ name: "Vendor", rows: (await fetchAll(prisma.supplier, { where: co(ctx), orderBy: { code: "asc" } })).map((r) => flat(r)) }],
  },
  {
    key: "products", label: "Master sparepart dan stok", group: "Pengadaan & stok", area: "purchasing", dated: false,
    load: async (ctx) => {
      const products = await fetchAll(prisma.product, { where: co(ctx), include: { unit: true, category: true }, orderBy: { sku: "asc" } });
      const stock = await prisma.stock.findMany({ where: { warehouse: co(ctx) }, include: { warehouse: true, product: true, location: true }, orderBy: { updatedAt: "desc" } });
      return [
        { name: "Sparepart", rows: products.map((p) => flat(p, { Unit: p.unit?.code ?? null, Category: name(p.category) })) },
        { name: "Stok", rows: stock.map((s) => ({ Warehouse: s.warehouse.name, SKU: s.product.sku, Product: s.product.name, Location: s.location?.name ?? null, Quantity: Number(s.quantity) })) },
      ];
    },
  },
  {
    key: "purchase-requests", label: "Purchase Request", group: "Pengadaan & stok", area: "purchasing", dated: true,
    load: (ctx) => withItems(ctx, {
      model: prisma.purchaseRequest, include: { project: true, items: { orderBy: { lineNumber: "asc" } } }, dateField: "requestDate",
      sheet: "Purchase Request", itemSheet: "PR Item", numberKey: "requestNumber", headExtras: (r) => ({ Project: r.project?.projectName ?? null }),
    }),
  },
  {
    key: "price-inquiries", label: "Perbandingan harga vendor", group: "Pengadaan & stok", area: "purchasing", dated: true,
    load: async (ctx) => {
      const rows = await fetchAll(prisma.priceInquiry, {
        where: { ...co(ctx), ...range("inquiryDate", ctx) },
        include: { salesOrder: true, vendors: { include: { supplier: true } }, items: { orderBy: { lineNumber: "asc" }, include: { quotes: { include: { supplier: true } }, purchaseOrder: true } } },
        orderBy: { inquiryDate: "asc" },
      });
      const head: Record<string, Cell>[] = [];
      const quotes: Record<string, Cell>[] = [];
      for (const r of rows) {
        head.push(flat(r, { "SO Number": r.salesOrder?.soNumber ?? null, Vendors: r.vendors.map((v: { supplier: { name: string } }) => v.supplier.name).join(", ") }));
        for (const i of r.items) {
          for (const q of i.quotes) {
            quotes.push({
              "Inquiry Number": r.number, "Part Number": i.partNumber, Description: i.description, Quantity: Number(i.quantity), Unit: i.unit,
              Vendor: q.supplier.name, "Unit Price": Number(q.unitPrice), "Lead Time Days": q.leadTimeDays,
              Awarded: i.awardedSupplierId === q.supplierId ? "Ya" : "", "PO Number": i.purchaseOrder?.poNumber ?? null,
            });
          }
        }
      }
      return [{ name: "Permintaan Harga", rows: head }, { name: "Penawaran Vendor", rows: quotes }];
    },
  },
  {
    key: "purchase-orders", label: "Purchase Order", group: "Pengadaan & stok", area: "purchasing", dated: true,
    load: (ctx) => withItems(ctx, {
      model: prisma.purchaseOrder, include: { supplier: true, salesOrder: true, purchaseRequest: true, items: { orderBy: { lineNumber: "asc" } } }, dateField: "poDate",
      sheet: "Purchase Order", itemSheet: "PO Item", numberKey: "poNumber",
      headExtras: (r) => ({ Vendor: name(r.supplier), "SO Number": r.salesOrder?.soNumber ?? null, "PR Number": r.purchaseRequest?.requestNumber ?? null }),
    }),
  },
  {
    key: "goods-receipts", label: "Penerimaan barang", group: "Pengadaan & stok", area: "purchasing", dated: true,
    load: (ctx) => withItems(ctx, {
      model: prisma.goodsReceipt, include: { purchaseOrder: true, warehouse: true, items: true }, dateField: "receiptDate",
      sheet: "Goods Receipt", itemSheet: "GR Item", numberKey: "receiptNumber",
      headExtras: (r) => ({ "PO Number": r.purchaseOrder?.poNumber ?? null, Warehouse: name(r.warehouse) }),
    }),
  },
  {
    key: "stock-movements", label: "Pergerakan stok", group: "Pengadaan & stok", area: "purchasing", dated: true,
    load: async (ctx) => {
      const rows = await prisma.stockMovement.findMany({
        where: { warehouse: co(ctx), ...range("createdAt", ctx) },
        include: { warehouse: true, product: true, unit: true },
        orderBy: { createdAt: "asc" },
      });
      return [{ name: "Pergerakan Stok", rows: rows.map((m) => flat(m as unknown as Record<string, unknown>, { Warehouse: m.warehouse.name, SKU: m.product.sku, Product: m.product.name, Unit: m.unit.code })) }];
    },
  },
  // ---- keuangan
  {
    key: "invoices", label: "Invoice", group: "Keuangan", area: "finance", dated: true,
    load: (ctx) => withItems(ctx, {
      model: prisma.invoice, include: { customer: true, salesOrder: true, items: { orderBy: { lineNumber: "asc" } } }, dateField: "invoiceDate",
      sheet: "Invoice", itemSheet: "Invoice Item", numberKey: "invoiceNumber",
      headExtras: (r) => ({ Customer: name(r.customer), "SO Number": r.salesOrder?.soNumber ?? null }),
    }),
  },
  {
    key: "payments", label: "Kwitansi dan pembayaran vendor", group: "Keuangan", area: "finance", dated: true,
    load: async (ctx) => {
      const rows = await prisma.payment.findMany({ where: { ...co(ctx), ...range("paymentDate", ctx) }, include: { customer: true, supplier: true }, orderBy: { paymentDate: "asc" } });
      return [{ name: "Pembayaran", rows: rows.map((p) => flat(p as unknown as Record<string, unknown>, { Type: p.supplierId ? "Bayar ke vendor" : "Terima dari customer", Party: p.supplier?.name ?? p.customer?.name ?? null })) }];
    },
  },
  {
    key: "bills", label: "Bill vendor", group: "Keuangan", area: "finance", dated: true,
    load: (ctx) => withItems(ctx, {
      model: prisma.bill, include: { supplier: true, purchaseOrder: true, salesOrder: true, items: { orderBy: { lineNumber: "asc" }, include: { salesOrder: true } } }, dateField: "billDate",
      sheet: "Bill Vendor", itemSheet: "Bill Item", numberKey: "billNumber",
      headExtras: (r) => ({ Vendor: name(r.supplier), "PO Number": r.purchaseOrder?.poNumber ?? null, "SO Number": r.salesOrder?.soNumber ?? null }),
      itemExtras: (i) => ({ "Item SO Number": i.salesOrder?.soNumber ?? null }),
    }),
  },
  {
    key: "journal-entries", label: "Jurnal dan chart of accounts", group: "Keuangan", area: "finance", dated: true,
    load: async (ctx) => {
      const [coa, entries] = await Promise.all([
        fetchAll(prisma.chartOfAccount, { where: co(ctx), orderBy: { accountCode: "asc" } }),
        prisma.journalEntry.findMany({ where: { ...co(ctx), ...range("entryDate", ctx) }, include: { lines: true }, orderBy: [{ entryDate: "asc" }, { entryNumber: "asc" }] }),
      ]);
      const acct = new Map(coa.map((a) => [a.accountCode as string, a.accountName as string]));
      const lines: Record<string, Cell>[] = [];
      for (const e of entries) {
        for (const l of e.lines) {
          lines.push({
            "Entry Number": e.entryNumber, "Entry Date": e.entryDate, Status: e.status, Description: l.description ?? e.description,
            "Account Code": l.accountCode, "Account Name": acct.get(l.accountCode) ?? null, Debit: Number(l.debitAmount), Credit: Number(l.creditAmount), Source: e.sourceType,
          });
        }
      }
      return [
        { name: "Jurnal", rows: lines },
        { name: "Chart of Accounts", rows: coa.map((a) => flat(a)) },
      ];
    },
  },
  // ---- operasional
  {
    key: "projects", label: "Proyek", group: "Operasional", area: "operational", dated: false,
    load: async (ctx) => [{ name: "Proyek", rows: (await fetchAll(prisma.project, { where: co(ctx), include: { customer: true }, orderBy: { projectNumber: "asc" } })).map((r) => flat(r, { Customer: name(r.customer) })) }],
  },
  {
    key: "boms", label: "BOM", group: "Operasional", area: "operational", dated: false,
    load: async () => {
      const boms = await prisma.bOM.findMany({ include: { project: true, items: { include: { product: true, unit: true } } } });
      const head: Record<string, Cell>[] = [];
      const items: Record<string, Cell>[] = [];
      for (const b of boms) {
        head.push(flat(b as unknown as Record<string, unknown>, { Project: b.project.projectName }));
        for (const i of b.items) items.push(flat(i as unknown as Record<string, unknown>, { Project: b.project.projectName, SKU: i.product.sku, Product: i.product.name, Unit: i.unit.code }));
      }
      return [{ name: "BOM", rows: head }, { name: "BOM Item", rows: items }];
    },
  },
  {
    key: "work-orders", label: "SPK", group: "Operasional", area: "operational", dated: false,
    load: async (ctx) => [{ name: "SPK", rows: (await fetchAll(prisma.workOrder, { where: co(ctx), include: { project: true } })).map((r) => flat(r, { Project: r.project?.projectName ?? null })) }],
  },
  // ---- HR
  {
    key: "employees", label: "Karyawan", group: "HR", area: "hr", dated: false,
    load: async (ctx) => [{ name: "Karyawan", rows: (await fetchAll(prisma.employee, { where: co(ctx) })).map((r) => flat(r)) }],
  },
  {
    key: "leaves", label: "Cuti", group: "HR", area: "hr", dated: false,
    load: async (ctx) => [{ name: "Cuti", rows: (await prisma.leave.findMany({ where: { employee: co(ctx) }, include: { employee: true } })).map((r) => flat(r as unknown as Record<string, unknown>, { Employee: (r.employee as { name?: string; fullName?: string }).name ?? (r.employee as { fullName?: string }).fullName ?? null })) }],
  },
  {
    key: "reimbursements", label: "Reimbursement", group: "HR", area: "hr", dated: false,
    load: async (ctx) => [{ name: "Reimbursement", rows: (await prisma.reimbursement.findMany({ where: { employee: co(ctx) }, include: { employee: true, project: true } })).map((r) => flat(r as unknown as Record<string, unknown>, { Employee: (r.employee as { name?: string; fullName?: string }).name ?? (r.employee as { fullName?: string }).fullName ?? null, Project: r.project?.projectName ?? null })) }],
  },
  // ---- pengaturan
  {
    key: "audit-log", label: "Audit log", group: "Pengaturan", area: "admin", dated: true,
    load: async (ctx) => {
      const rows = await prisma.auditLog.findMany({ where: range("createdAt", ctx), include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" }, take: 50000 });
      return [{ name: "Audit Log", rows: rows.map((r) => ({ Time: r.createdAt, User: r.user ? r.user.name || r.user.email : "Sistem", Action: r.action, Type: r.entityType, Description: r.description, "Old Value": r.oldValue, "New Value": r.newValue })) }];
    },
  },
  {
    key: "team", label: "Tim dan peran", group: "Pengaturan", area: "admin", dated: false,
    load: async (ctx) => {
      const rows = await prisma.userMembership.findMany({ where: co(ctx), include: { user: { select: { name: true, email: true, isActive: true, lastLogin: true } }, role: true } });
      return [{ name: "Tim", rows: rows.map((m) => ({ Name: m.user.name, Email: m.user.email, Role: m.role.name, "Membership Active": m.isActive, "User Active": m.user.isActive, "Last Login": m.user.lastLogin })) }];
    },
  },
  {
    key: "attachments", label: "Daftar lampiran (tanpa isi file)", group: "Pengaturan", area: "admin", dated: false,
    load: async (ctx) => {
      const rows = await prisma.attachment.findMany({ where: await attachmentScope(ctx), select: { referenceType: true, fileName: true, fileSize: true, fileType: true, uploadedAt: true }, orderBy: { uploadedAt: "asc" } });
      return [{ name: "Lampiran", rows: rows.map((r) => ({ "Document Type": r.referenceType, "File Name": r.fileName, "Size (KB)": Math.round(r.fileSize / 1024), Type: r.fileType, Uploaded: r.uploadedAt })) }];
    },
  },
];

export function datasetByKey(key: string) {
  return DATASETS.find((d) => d.key === key);
}

// ---------------------------------------------------------------- workbook
function safeSheetName(n: string, used: Set<string>) {
  const base = n.replace(/[\\/?*[\]:]/g, " ").slice(0, 31).trim() || "Sheet";
  let out = base;
  let i = 2;
  while (used.has(out.toLowerCase())) out = `${base.slice(0, 28)} ${i++}`;
  used.add(out.toLowerCase());
  return out;
}

export function buildWorkbook(sheets: Sheet[], meta: { title: string; by: string; note?: string }) {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>(["ringkasan"]);

  const summary = [
    ["Ekspor data ERP PT. MDA Amanah Sejahtera"],
    [meta.title],
    ["Dibuat", new Date()],
    ["Oleh", meta.by],
    ...(meta.note ? [["Catatan", meta.note]] : []),
    [],
    ["Lembar", "Jumlah baris"],
    ...sheets.map((s) => [s.name, s.rows.length]),
  ];
  const sum = XLSX.utils.aoa_to_sheet(summary, { cellDates: true });
  sum["!cols"] = [{ wch: 28 }, { wch: 34 }];
  XLSX.utils.book_append_sheet(wb, sum, "Ringkasan");

  for (const s of sheets) {
    const rows = s.rows.length ? s.rows : [{ Info: "Tidak ada data" }];
    const ws = XLSX.utils.json_to_sheet(rows, { cellDates: true });
    const headers = Object.keys(rows[0]);
    ws["!cols"] = headers.map((h) => {
      const longest = rows.slice(0, 200).reduce((m, r) => Math.max(m, String(r[h] instanceof Date ? "2026-01-01" : r[h] ?? "").length), h.length);
      return { wch: Math.min(Math.max(longest + 2, 8), 46) };
    });
    if (ws["!ref"]) ws["!autofilter"] = { ref: ws["!ref"] };
    // dates as yyyy-mm-dd
    for (const addr of Object.keys(ws)) {
      if (addr.startsWith("!")) continue;
      const cell = ws[addr] as XLSX.CellObject;
      if (cell.t === "d") cell.z = "yyyy-mm-dd";
    }
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(s.name, used));
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellDates: true }) as Buffer;
}
