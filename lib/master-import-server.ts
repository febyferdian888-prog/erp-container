import { prisma } from "@/lib/db";
import { normName } from "@/lib/name-utils";
import type { ImportOptions, ImportType, MasterPreview, MasterRow, PreviewRow, RowAction } from "@/lib/master-import";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : v === null || v === undefined ? "" : String(v).trim());
const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : null);
const money = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
const r4 = (n: number) => Math.round(n * 10000) / 10000;

interface Ctx {
  companyId: string;
  email: string;
  batchId: string;
}

interface StockOp {
  warehouseId: string;
  productId: string | null; // null until a new product exists
  sku: string;
  unitId: string | null;
  unitCode: string;
  delta: number;
  current: number;
}

interface Analysis {
  preview: PreviewRow[];
  newUnits: Set<string>;
  newCategories: Set<string>;
  // work to do when applying
  createProducts: { sku: string; name: string; unitCode: string; category: string | null; price: number; description: string | null; stock?: StockOp }[];
  updateProducts: { id: string; data: Record<string, unknown>; unitCode?: string; category?: string | null; stock?: StockOp }[];
  stockOnly: StockOp[];
  createCustomers: { code: string; name: string; data: Record<string, string | null>; contact?: Contact }[];
  updateCustomers: { id: string; data: Record<string, string | null>; contact?: Contact }[];
}
interface Contact { name: string; phone: string | null; email: string | null; position: string | null }

function emptyAnalysis(): Analysis {
  return { preview: [], newUnits: new Set(), newCategories: new Set(), createProducts: [], updateProducts: [], stockOnly: [], createCustomers: [], updateCustomers: [] };
}

// ------------------------------------------------------------------ analysis
async function warehouseResolver(companyId: string) {
  const warehouses = await prisma.warehouse.findMany({ where: { companyId, deletedAt: null }, select: { id: true, code: true, name: true } });
  const def = warehouses.find((w) => w.code.toLowerCase() === "wh-01") ?? warehouses[0];
  return (text: string) => {
    if (!text) return def ? { wh: def, error: null } : { wh: null, error: "Belum ada gudang" };
    const k = text.toLowerCase();
    const wh = warehouses.find((w) => w.code.toLowerCase() === k || w.name.toLowerCase() === k);
    return wh ? { wh, error: null } : { wh: null, error: `Gudang "${text}" tidak ditemukan` };
  };
}

async function analyzeProducts(rows: MasterRow[], opt: ImportOptions, ctx: Ctx): Promise<Analysis> {
  const a = emptyAnalysis();
  const [products, units, categories, resolveWh] = await Promise.all([
    prisma.product.findMany({ where: { companyId: ctx.companyId, deletedAt: null }, include: { unit: true, category: true } }),
    prisma.unit.findMany(),
    prisma.productCategory.findMany({ where: { deletedAt: null } }),
    warehouseResolver(ctx.companyId),
  ]);
  const bySku = new Map(products.map((p) => [p.sku.trim().toLowerCase(), p]));
  const unitOf = (text: string) => units.find((u) => u.code.toLowerCase() === text.toLowerCase() || u.name.toLowerCase() === text.toLowerCase());
  const catOf = (text: string) => categories.find((c) => c.name.toLowerCase() === text.toLowerCase());

  const needsStock = rows.some((r) => num(r.values.qty) !== null);
  const stocks = needsStock
    ? await prisma.stock.findMany({ where: { warehouse: { companyId: ctx.companyId }, locationId: null }, select: { warehouseId: true, productId: true, quantity: true } })
    : [];
  const stockOf = (wh: string, pid: string) => Number(stocks.find((s) => s.warehouseId === wh && s.productId === pid)?.quantity ?? 0);

  const seen = new Map<string, number>();
  for (const r of rows) {
    const v = r.values;
    const sku = str(v.sku);
    const messages: string[] = [];
    const changes: string[] = [];
    const finish = (action: RowAction, label = str(v.name)) => a.preview.push({ row: r.row, key: sku, label, action, changes, messages });

    if (!sku) { messages.push("Nomor part kosong"); finish("error"); continue; }
    const k = sku.toLowerCase();
    if (seen.has(k)) { messages.push(`Nomor part sama dengan baris ${seen.get(k)}`); finish("error"); continue; }
    seen.set(k, r.row);

    const price = num(v.price);
    if (v.priceRaw) { messages.push(`Harga tidak terbaca: "${v.priceRaw}"`); finish("error"); continue; }
    if (price !== null && price < 0) { messages.push("Harga tidak boleh negatif"); finish("error"); continue; }
    const qty = num(v.qty);
    if (v.qtyRaw) { messages.push(`Stok tidak terbaca: "${v.qtyRaw}"`); finish("error"); continue; }
    if (qty !== null && qty < 0) { messages.push("Stok tidak boleh negatif"); finish("error"); continue; }

    const name = str(v.name);
    const unitText = str(v.unit);
    const catText = str(v.category);
    const desc = str(v.description);
    const ex = bySku.get(k);

    // stock part
    let stock: StockOp | undefined;
    if (qty !== null) {
      const { wh, error } = resolveWh(str(v.warehouse));
      if (error || !wh) { messages.push(error || "Gudang tidak ditemukan"); finish("error"); continue; }
      const current = ex ? stockOf(wh.id, ex.id) : 0;
      const target = opt.stockMode === "add" ? current + qty : qty;
      const delta = r4(target - current);
      if (delta !== 0) {
        stock = { warehouseId: wh.id, productId: ex?.id ?? null, sku, unitId: ex?.unitId ?? null, unitCode: ex?.unit.code ?? (unitText || "PCS").toUpperCase(), delta, current };
        changes.push(`Stok ${wh.code}: ${current} → ${target}`);
      }
    }

    if (ex) {
      const data: Record<string, unknown> = {};
      let unitCode: string | undefined;
      let category: string | null | undefined;
      if (opt.updateExisting) {
        if (name && name !== ex.name) { data.name = name; changes.push(`Nama: ${ex.name} → ${name}`); }
        if (price !== null && price !== Number(ex.standardPrice)) { data.standardPrice = price; changes.push(`Harga: ${money(Number(ex.standardPrice))} → ${money(price)}`); }
        if (desc && desc !== (ex.description ?? "")) { data.description = desc; changes.push("Keterangan diubah"); }
        if (unitText) {
          const u = unitOf(unitText);
          if (!u || u.id !== ex.unitId) {
            unitCode = u ? u.code : unitText.toUpperCase().slice(0, 20);
            if (!u) a.newUnits.add(unitCode);
            changes.push(`Satuan: ${ex.unit.code} → ${unitCode}`);
          }
        }
        if (catText) {
          const c = catOf(catText);
          if (!c || c.id !== ex.categoryId) {
            category = catText;
            if (!c) a.newCategories.add(catText);
            changes.push(`Kategori: ${ex.category?.name ?? "-"} → ${catText}`);
          }
        }
      }
      if (!changes.length) { messages.push(opt.updateExisting ? "Tidak ada perubahan" : "Sudah ada, dilewati"); finish("skip", ex.name); continue; }
      if (Object.keys(data).length || unitCode || category !== undefined) a.updateProducts.push({ id: ex.id, data, unitCode, category, stock });
      else if (stock) a.stockOnly.push(stock);
      finish("update", ex.name);
      continue;
    }

    if (!name) { messages.push("Nama barang kosong"); finish("error"); continue; }
    const u = unitText ? unitOf(unitText) : unitOf("PCS");
    const unitCode = u ? u.code : (unitText || "PCS").toUpperCase().slice(0, 20);
    if (!u) { a.newUnits.add(unitCode); messages.push(`Satuan baru: ${unitCode}`); }
    if (catText && !catOf(catText)) { a.newCategories.add(catText); messages.push(`Kategori baru: ${catText}`); }
    if (stock) stock.unitCode = unitCode;
    a.createProducts.push({ sku, name, unitCode, category: catText || null, price: price ?? 0, description: desc || null, stock });
    changes.push(`Harga: ${money(price ?? 0)}`);
    finish("create", name);
  }
  return a;
}

async function analyzeCustomers(rows: MasterRow[], opt: ImportOptions, ctx: Ctx): Promise<Analysis> {
  const a = emptyAnalysis();
  const customers = await prisma.customer.findMany({ where: { companyId: ctx.companyId }, include: { contacts: { where: { deletedAt: null }, select: { name: true } } } });
  const live = customers.filter((c) => !c.deletedAt);
  const byCode = new Map(live.map((c) => [c.code.toLowerCase(), c]));
  const byName = new Map(live.map((c) => [normName(c.name), c]));
  let nextNum = customers.reduce((m, c) => Math.max(m, /^CUST(\d+)$/i.exec(c.code)?.[1] ? parseInt(/^CUST(\d+)$/i.exec(c.code)![1], 10) : 0), 0);
  const usedCodes = new Set(customers.map((c) => c.code.toLowerCase()));
  const seen = new Map<string, number>();

  const FIELDS = ["address", "city", "province", "postalCode", "country", "phone", "email", "npwp", "description"] as const;
  const LABEL: Record<string, string> = { address: "Alamat", city: "Kota", province: "Provinsi", postalCode: "Kode pos", country: "Negara", phone: "Telepon", email: "Email", npwp: "NPWP", description: "Keterangan" };

  for (const r of rows) {
    const v = r.values;
    const name = str(v.name);
    const code = str(v.code);
    const messages: string[] = [];
    const changes: string[] = [];
    const key = name || code;
    const finish = (action: RowAction, label = name) => a.preview.push({ row: r.row, key, label, action, changes, messages });

    if (!name && !code) { messages.push("Nama customer kosong"); finish("error"); continue; }
    const dupKey = code ? `c:${code.toLowerCase()}` : `n:${normName(name)}`;
    if (seen.has(dupKey)) { messages.push(`Customer sama dengan baris ${seen.get(dupKey)}`); finish("error"); continue; }
    seen.set(dupKey, r.row);
    const email = str(v.email);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) messages.push("Format email tampak salah");

    const fields: Record<string, string | null> = {};
    for (const f of FIELDS) if (str(v[f])) fields[f] = str(v[f]);
    const contact: Contact | undefined = str(v.contactName)
      ? { name: str(v.contactName), phone: str(v.contactPhone) || null, email: str(v.contactEmail) || null, position: str(v.contactPosition) || null }
      : undefined;

    const ex = code ? byCode.get(code.toLowerCase()) : byName.get(normName(name));
    if (ex) {
      const data: Record<string, string | null> = {};
      if (opt.updateExisting) {
        if (name && code && name !== ex.name) { data.name = name; changes.push(`Nama: ${ex.name} → ${name}`); }
        for (const f of FIELDS) {
          const cur = (ex as unknown as Record<string, string | null>)[f] ?? "";
          if (fields[f] && fields[f] !== cur) { data[f] = fields[f]; changes.push(`${LABEL[f]}: ${cur || "-"} → ${fields[f]}`); }
        }
      }
      let newContact: Contact | undefined;
      if (contact && opt.updateExisting && !ex.contacts.some((c) => c.name.toLowerCase() === contact.name.toLowerCase())) {
        newContact = contact;
        changes.push(`Kontak baru: ${contact.name}`);
      }
      if (!changes.length) { messages.push(opt.updateExisting ? "Tidak ada perubahan" : "Sudah ada, dilewati"); finish("skip", ex.name); continue; }
      a.updateCustomers.push({ id: ex.id, data, contact: newContact });
      finish("update", ex.name);
      continue;
    }

    if (!name) { messages.push(`Kode ${code} belum ada dan nama kosong`); finish("error"); continue; }
    let newCode = code;
    if (newCode && usedCodes.has(newCode.toLowerCase())) { messages.push(`Kode ${newCode} dipakai customer yang sudah dihapus`); finish("error"); continue; }
    if (!newCode) {
      do { nextNum++; newCode = `CUST${String(nextNum).padStart(3, "0")}`; } while (usedCodes.has(newCode.toLowerCase()));
    }
    usedCodes.add(newCode.toLowerCase());
    a.createCustomers.push({ code: newCode, name, data: fields, contact });
    changes.push(`Kode ${newCode}`);
    if (contact) changes.push(`Kontak: ${contact.name}`);
    finish("create");
  }
  return a;
}

async function analyzeStock(rows: MasterRow[], opt: ImportOptions, ctx: Ctx): Promise<Analysis> {
  const a = emptyAnalysis();
  const [products, resolveWh, stocks] = await Promise.all([
    prisma.product.findMany({ where: { companyId: ctx.companyId, deletedAt: null }, include: { unit: true } }),
    warehouseResolver(ctx.companyId),
    prisma.stock.findMany({ where: { warehouse: { companyId: ctx.companyId }, locationId: null }, select: { warehouseId: true, productId: true, quantity: true } }),
  ]);
  const bySku = new Map(products.map((p) => [p.sku.trim().toLowerCase(), p]));
  const seen = new Map<string, number>();

  for (const r of rows) {
    const v = r.values;
    const sku = str(v.sku);
    const messages: string[] = [];
    const changes: string[] = [];
    const finish = (action: RowAction, label = str(v.name)) => a.preview.push({ row: r.row, key: sku, label, action, changes, messages });

    if (!sku) { messages.push("Nomor part kosong"); finish("error"); continue; }
    const p = bySku.get(sku.toLowerCase());
    if (!p) { messages.push("Nomor part tidak ada di master sparepart. Impor sparepart dulu"); finish("error"); continue; }
    if (v.qtyRaw) { messages.push(`Jumlah tidak terbaca: "${v.qtyRaw}"`); finish("error", p.name); continue; }
    const qty = num(v.qty);
    if (qty === null) { messages.push("Jumlah stok kosong"); finish("error", p.name); continue; }
    if (qty < 0) { messages.push("Jumlah tidak boleh negatif"); finish("error", p.name); continue; }
    const { wh, error } = resolveWh(str(v.warehouse));
    if (error || !wh) { messages.push(error || "Gudang tidak ditemukan"); finish("error", p.name); continue; }

    const dupKey = `${wh.id}|${p.id}`;
    if (seen.has(dupKey)) { messages.push(`Nomor part dan gudang sama dengan baris ${seen.get(dupKey)}`); finish("error", p.name); continue; }
    seen.set(dupKey, r.row);

    const current = Number(stocks.find((s) => s.warehouseId === wh.id && s.productId === p.id)?.quantity ?? 0);
    const target = opt.stockMode === "add" ? current + qty : qty;
    const delta = r4(target - current);
    if (delta === 0) { messages.push("Stok sudah sama"); finish("skip", p.name); continue; }
    a.stockOnly.push({ warehouseId: wh.id, productId: p.id, sku, unitId: p.unitId, unitCode: p.unit.code, delta, current });
    changes.push(`Stok ${wh.code}: ${current} → ${target}`);
    finish(current === 0 ? "create" : "update", p.name);
  }
  return a;
}

function summarize(a: Analysis): MasterPreview {
  const count = (x: RowAction) => a.preview.filter((p) => p.action === x).length;
  return {
    rows: a.preview,
    summary: { total: a.preview.length, create: count("create"), update: count("update"), skip: count("skip"), error: count("error"), newUnits: [...a.newUnits], newCategories: [...a.newCategories] },
  };
}

export async function previewMaster(type: ImportType, rows: MasterRow[], opt: ImportOptions, ctx: Ctx): Promise<MasterPreview> {
  const a = type === "products" ? await analyzeProducts(rows, opt, ctx) : type === "customers" ? await analyzeCustomers(rows, opt, ctx) : await analyzeStock(rows, opt, ctx);
  return summarize(a);
}

// ------------------------------------------------------------------ apply
async function chunked<T>(items: T[], size: number, fn: (part: T[]) => Promise<unknown>) {
  for (let i = 0; i < items.length; i += size) await fn(items.slice(i, i + size));
}

async function applyStock(ops: StockOp[], ctx: Ctx) {
  const list = ops.filter((o) => o.productId && o.unitId && o.delta !== 0);
  if (!list.length) return 0;
  const existing = await prisma.stock.findMany({
    where: { locationId: null, warehouseId: { in: [...new Set(list.map((o) => o.warehouseId))] }, productId: { in: list.map((o) => o.productId as string) } },
    select: { id: true, warehouseId: true, productId: true },
  });
  const tx = [];
  for (const o of list) {
    const row = existing.find((s) => s.warehouseId === o.warehouseId && s.productId === o.productId);
    tx.push(
      row
        ? prisma.stock.update({ where: { id: row.id }, data: { quantity: { increment: o.delta } } })
        : prisma.stock.create({ data: { warehouseId: o.warehouseId, productId: o.productId as string, quantity: o.delta } })
    );
  }
  tx.push(
    prisma.stockMovement.createMany({
      data: list.map((o) => ({
        warehouseId: o.warehouseId,
        productId: o.productId as string,
        unitId: o.unitId as string,
        referenceType: "Import",
        referenceId: ctx.batchId,
        quantity: Math.abs(o.delta),
        type: o.delta > 0 ? "IN" : "OUT",
        reason: o.current === 0 && o.delta > 0 ? "Stok awal (impor Excel)" : "Koreksi stok (impor Excel)",
        notes: `Impor ${ctx.batchId}`,
        createdBy: ctx.email,
      })),
    }) as never
  );
  await prisma.$transaction(tx as never, { timeout: 30000 } as never);
  return list.length;
}

export async function applyMaster(type: ImportType, rows: MasterRow[], opt: ImportOptions, ctx: Ctx) {
  const a = type === "products" ? await analyzeProducts(rows, opt, ctx) : type === "customers" ? await analyzeCustomers(rows, opt, ctx) : await analyzeStock(rows, opt, ctx);
  const done = { created: 0, updated: 0, stockRows: 0 };

  if (type === "products") {
    // units and categories first
    const unitCodes = new Set<string>();
    for (const c of a.createProducts) unitCodes.add(c.unitCode);
    for (const u of a.updateProducts) if (u.unitCode) unitCodes.add(u.unitCode);
    const units = await prisma.unit.findMany();
    const missingUnits = [...unitCodes].filter((c) => !units.some((u) => u.code.toLowerCase() === c.toLowerCase()));
    if (missingUnits.length) await prisma.unit.createMany({ data: missingUnits.map((c) => ({ code: c, name: c })), skipDuplicates: true });
    const allUnits = await prisma.unit.findMany();
    const unitId = (code: string) => allUnits.find((u) => u.code.toLowerCase() === code.toLowerCase())!.id;

    const catNames = new Set<string>();
    for (const c of a.createProducts) if (c.category) catNames.add(c.category);
    for (const u of a.updateProducts) if (u.category) catNames.add(u.category);
    const cats = await prisma.productCategory.findMany({ where: { deletedAt: null } });
    const missingCats = [...catNames].filter((n) => !cats.some((c) => c.name.toLowerCase() === n.toLowerCase()));
    if (missingCats.length) await prisma.productCategory.createMany({ data: missingCats.map((name) => ({ name })) });
    const allCats = await prisma.productCategory.findMany({ where: { deletedAt: null } });
    const catId = (name: string | null | undefined) => (name ? allCats.find((c) => c.name.toLowerCase() === name.toLowerCase())?.id ?? null : null);

    if (a.createProducts.length) {
      const res = await prisma.product.createMany({
        data: a.createProducts.map((c) => ({
          companyId: ctx.companyId, sku: c.sku, name: c.name, unitId: unitId(c.unitCode), categoryId: catId(c.category),
          standardPrice: c.price, description: c.description,
        })),
        skipDuplicates: true,
      });
      done.created = res.count;
    }
    await chunked(a.updateProducts, 40, async (part) => {
      await prisma.$transaction(
        part.map((u) =>
          prisma.product.update({
            where: { id: u.id },
            data: { ...u.data, ...(u.unitCode ? { unitId: unitId(u.unitCode) } : {}), ...(u.category !== undefined ? { categoryId: catId(u.category) } : {}) },
          })
        )
      );
      done.updated += part.length;
    });

    // stock for products (new ones need their ids)
    const stockOps: StockOp[] = [...a.stockOnly];
    const newStock = a.createProducts.filter((c) => c.stock);
    if (newStock.length) {
      const created = await prisma.product.findMany({ where: { companyId: ctx.companyId, sku: { in: newStock.map((c) => c.sku) } }, select: { id: true, sku: true, unitId: true } });
      for (const c of newStock) {
        const p = created.find((x) => x.sku === c.sku);
        if (p && c.stock) stockOps.push({ ...c.stock, productId: p.id, unitId: p.unitId });
      }
    }
    for (const u of a.updateProducts) if (u.stock) stockOps.push(u.stock);
    done.stockRows = await applyStock(stockOps, ctx);
  }

  if (type === "customers") {
    if (a.createCustomers.length) {
      const res = await prisma.customer.createMany({
        data: a.createCustomers.map((c) => ({ companyId: ctx.companyId, code: c.code, name: c.name, country: c.data.country ?? "Indonesia", ...pick(c.data) })),
        skipDuplicates: true,
      });
      done.created = res.count;
    }
    await chunked(a.updateCustomers, 40, async (part) => {
      await prisma.$transaction(part.map((u) => prisma.customer.update({ where: { id: u.id }, data: u.data })));
      done.updated += part.length;
    });
    const contacts: { customerId: string; name: string; phone: string | null; email: string | null; position: string | null; isDefault: boolean }[] = [];
    const withContact = a.createCustomers.filter((c) => c.contact);
    if (withContact.length) {
      const made = await prisma.customer.findMany({ where: { companyId: ctx.companyId, code: { in: withContact.map((c) => c.code) } }, select: { id: true, code: true } });
      for (const c of withContact) {
        const row = made.find((m) => m.code === c.code);
        if (row && c.contact) contacts.push({ customerId: row.id, ...c.contact, isDefault: true });
      }
    }
    for (const u of a.updateCustomers) if (u.contact) contacts.push({ customerId: u.id, ...u.contact, isDefault: false });
    if (contacts.length) await prisma.customerContact.createMany({ data: contacts });
  }

  if (type === "stock") done.stockRows = await applyStock(a.stockOnly, ctx);

  return { ...summarize(a).summary, applied: done };
}

function pick(d: Record<string, string | null>) {
  const { address, city, province, postalCode, phone, email, npwp, description } = d;
  return { address, city, province, postalCode, phone, email, npwp, description };
}
