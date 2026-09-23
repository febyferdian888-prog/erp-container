// Client-safe definitions for the master-data importers (sparepart, customer, opening stock).
import { parseNumber } from "./excel-parse";

export type ImportType = "products" | "customers" | "stock";

export interface FieldDef {
  key: string;
  label: string;
  required?: boolean;
  number?: boolean;
  hint?: string;
  synonyms: string[];
}

export const TYPE_INFO: Record<ImportType, { label: string; noun: string; description: string; areas: ("sales" | "purchasing" | "operational")[]; templateName: string }> = {
  products: {
    label: "Sparepart",
    noun: "sparepart",
    description: "Tambah sparepart baru, atau perbarui nama, satuan, kategori, dan harga jual yang sudah ada. Boleh sekaligus mengisi stok awal.",
    areas: ["purchasing", "operational"],
    templateName: "template-sparepart.xlsx",
  },
  customers: {
    label: "Customer",
    noun: "customer",
    description: "Tambah customer baru, atau lengkapi alamat, NPWP, telepon, dan email customer yang sudah ada.",
    areas: ["sales"],
    templateName: "template-customer.xlsx",
  },
  stock: {
    label: "Stok awal",
    noun: "baris stok",
    description: "Set jumlah stok tiap sparepart di gudang. Perubahannya tercatat sebagai pergerakan stok.",
    areas: ["purchasing"],
    templateName: "template-stok-awal.xlsx",
  },
};

export const FIELD_DEFS: Record<ImportType, FieldDef[]> = {
  products: [
    { key: "sku", label: "Nomor part (SKU)", required: true, synonyms: ["nomor part", "part number", "part no", "no part", "sku", "kode barang", "kode"] },
    { key: "name", label: "Nama barang", required: true, synonyms: ["nama barang", "nama sparepart", "nama item", "deskripsi", "description", "nama", "barang", "item"] },
    { key: "unit", label: "Satuan", synonyms: ["satuan", "uom", "unit"] },
    { key: "category", label: "Kategori", synonyms: ["kategori", "category", "jenis", "grup"] },
    { key: "price", label: "Harga jual standar", number: true, hint: "Harga jual, bukan harga beli", synonyms: ["harga jual standar", "harga jual", "harga standar", "harga", "price"] },
    { key: "description", label: "Keterangan", synonyms: ["keterangan", "catatan", "notes", "remark"] },
    { key: "qty", label: "Stok awal", number: true, hint: "Opsional. Diisi bersama gudang di bawah", synonyms: ["stok awal", "stok", "stock", "qty", "jumlah", "quantity"] },
    { key: "warehouse", label: "Gudang", hint: "Kode atau nama gudang. Kosong = gudang utama", synonyms: ["gudang", "warehouse", "lokasi"] },
  ],
  customers: [
    { key: "name", label: "Nama customer", required: true, synonyms: ["nama customer", "nama pelanggan", "customer", "pelanggan", "nama perusahaan", "nama"] },
    { key: "code", label: "Kode", hint: "Kosong = dibuat otomatis (CUST0xx)", synonyms: ["kode customer", "kode", "code"] },
    { key: "address", label: "Alamat", synonyms: ["alamat", "address"] },
    { key: "city", label: "Kota", synonyms: ["kota", "city", "kabupaten"] },
    { key: "province", label: "Provinsi", synonyms: ["provinsi", "province"] },
    { key: "postalCode", label: "Kode pos", synonyms: ["kode pos", "postal code", "zip"] },
    { key: "country", label: "Negara", synonyms: ["negara", "country"] },
    { key: "phone", label: "Telepon", synonyms: ["telepon", "telp", "phone", "no hp", "hp"] },
    { key: "email", label: "Email", synonyms: ["email", "e-mail"] },
    { key: "npwp", label: "NPWP", synonyms: ["npwp", "tax id"] },
    { key: "description", label: "Keterangan", synonyms: ["keterangan", "catatan", "notes", "remark"] },
    { key: "contactName", label: "Nama kontak (PIC)", synonyms: ["nama kontak", "kontak", "pic", "contact"] },
    { key: "contactPhone", label: "Telepon kontak", synonyms: ["telepon kontak", "hp kontak", "telp pic", "contact phone"] },
    { key: "contactEmail", label: "Email kontak", synonyms: ["email kontak", "email pic", "contact email"] },
    { key: "contactPosition", label: "Jabatan kontak", synonyms: ["jabatan", "posisi", "position"] },
  ],
  stock: [
    { key: "sku", label: "Nomor part (SKU)", required: true, synonyms: ["nomor part", "part number", "part no", "no part", "sku", "kode barang", "kode"] },
    { key: "qty", label: "Jumlah stok", required: true, number: true, synonyms: ["jumlah stok", "stok awal", "stok", "stock", "qty", "jumlah", "quantity"] },
    { key: "warehouse", label: "Gudang", hint: "Kode atau nama gudang. Kosong = gudang utama", synonyms: ["gudang", "warehouse", "lokasi"] },
    { key: "name", label: "Nama barang (info)", hint: "Hanya untuk memudahkan membaca hasil periksa", synonyms: ["nama barang", "nama sparepart", "deskripsi", "nama"] },
  ],
};

export const TEMPLATE_ROWS: Record<ImportType, (string | number)[][]> = {
  products: [
    ["Nomor Part", "Nama Barang", "Satuan", "Kategori", "Harga Jual", "Keterangan", "Stok Awal", "Gudang"],
    ["6745-71-5120", "TUBE", "pcs", "Komatsu", 1300000, "", 4, "WH-01"],
  ],
  customers: [
    ["Nama Customer", "Kode", "Alamat", "Kota", "Provinsi", "Kode Pos", "Telepon", "Email", "NPWP", "Nama Kontak", "Telepon Kontak", "Email Kontak", "Jabatan"],
    ["PT. Contoh Sejahtera", "", "Jl. Industri No. 5", "Balikpapan", "Kalimantan Timur", "76112", "0542-123456", "purchasing@contoh.co.id", "01.234.567.8-901.000", "Budi", "0812-3456-7890", "budi@contoh.co.id", "Purchasing"],
  ],
  stock: [
    ["Nomor Part", "Jumlah Stok", "Gudang", "Nama Barang"],
    ["6745-71-5120", 4, "WH-01", "TUBE"],
  ],
};

export type ImportMapping = Record<string, number | undefined>;

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

export function detectMappingFor(type: ImportType, headers: unknown[]): ImportMapping {
  const heads = headers.map(norm);
  const mapping: ImportMapping = {};
  const used = new Set<number>();
  for (const pass of ["exact", "contains"] as const) {
    for (const f of FIELD_DEFS[type]) {
      if (mapping[f.key] !== undefined) continue;
      for (const syn of f.synonyms) {
        const idx = heads.findIndex((h, i) => !used.has(i) && h !== "" && (pass === "exact" ? h === syn : h.includes(syn)));
        if (idx >= 0) {
          mapping[f.key] = idx;
          used.add(idx);
          break;
        }
      }
    }
  }
  return mapping;
}

export interface MasterRow {
  row: number;
  values: Record<string, string | number | null>;
}

const text = (v: unknown) => (v === null || v === undefined || v instanceof Date ? "" : String(v).trim());

export function buildMasterRows(type: ImportType, data: unknown[][], headerRow: number, mapping: ImportMapping): MasterRow[] {
  const defs = FIELD_DEFS[type];
  const out: MasterRow[] = [];
  for (let i = headerRow + 1; i < data.length; i++) {
    const r = data[i];
    if (!r || r.every((c) => String(c ?? "").trim() === "")) continue;
    const values: MasterRow["values"] = {};
    for (const f of defs) {
      const idx = mapping[f.key];
      const raw = idx === undefined ? undefined : r[idx];
      if (f.number) {
        const n = parseNumber(raw);
        values[f.key] = n;
        if (n === null && text(raw) !== "") values[`${f.key}Raw`] = text(raw);
      } else {
        values[f.key] = text(raw);
      }
    }
    out.push({ row: i + 1, values });
  }
  return out;
}

export interface ImportOptions {
  updateExisting: boolean; // products and customers
  stockMode: "set" | "add"; // stock quantities
}

export type RowAction = "create" | "update" | "skip" | "error";

export interface PreviewRow {
  row: number;
  key: string; // sku or customer name
  label: string; // name shown next to the key
  action: RowAction;
  changes: string[];
  messages: string[];
}

export interface MasterPreview {
  rows: PreviewRow[];
  summary: { total: number; create: number; update: number; skip: number; error: number; newUnits: string[]; newCategories: string[] };
}
