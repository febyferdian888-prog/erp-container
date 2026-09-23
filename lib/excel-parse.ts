// Client-safe helpers for reading a purchase recap spreadsheet. No server imports here.

export type FieldKey =
  | "date" | "vendor" | "invoiceNo" | "partNumber" | "description" | "qty" | "unit" | "unitPrice"
  | "amount" | "ppn" | "pph" | "dueDate" | "soRef" | "paidDate" | "paidAmount" | "notes";

export const FIELDS: { key: FieldKey; label: string; required?: boolean; hint?: string; synonyms: string[] }[] = [
  { key: "date", label: "Tanggal", required: true, synonyms: ["tanggal invoice", "tgl invoice", "tanggal pembelian", "tanggal beli", "tanggal", "tgl", "date"] },
  { key: "vendor", label: "Vendor", required: true, synonyms: ["nama vendor", "nama supplier", "vendor", "supplier", "pemasok", "toko"] },
  { key: "invoiceNo", label: "No. invoice vendor", hint: "Nomor faktur/nota dari vendor", synonyms: ["no invoice vendor", "no. invoice", "nomor invoice", "no invoice", "no faktur", "nomor faktur", "no nota", "nomor nota", "invoice", "faktur", "nota"] },
  { key: "partNumber", label: "Nomor part", synonyms: ["part number", "part no", "no part", "nomor part", "kode barang", "sku", "kode", "part"] },
  { key: "description", label: "Deskripsi barang", required: true, synonyms: ["deskripsi", "description", "nama barang", "nama item", "barang", "item", "uraian"] },
  { key: "qty", label: "Qty", required: true, synonyms: ["qty", "quantity", "kuantitas", "jumlah barang", "jumlah", "kuantiti"] },
  { key: "unit", label: "Satuan", synonyms: ["satuan", "uom", "unit"] },
  { key: "unitPrice", label: "Harga satuan", synonyms: ["harga satuan", "harga beli", "unit price", "harga/unit", "harga"] },
  { key: "amount", label: "Total baris", hint: "Dipakai bila tidak ada harga satuan", synonyms: ["total harga", "jumlah harga", "subtotal", "sub total", "amount", "total"] },
  { key: "ppn", label: "PPN (%)", synonyms: ["ppn %", "ppn (%)", "ppn"] },
  { key: "pph", label: "PPh 23 dipotong (Rp)", hint: "Nominal yang kita potong dari vendor, per bill", synonyms: ["pph 23", "pph23", "pph", "potongan pph"] },
  { key: "dueDate", label: "Jatuh tempo", synonyms: ["jatuh tempo", "due date", "tempo"] },
  { key: "soRef", label: "Referensi penjualan", hint: "No. PO customer atau No. SO yang dipenuhi", synonyms: ["no po customer", "po customer", "nomor po customer", "customer po", "no so", "untuk so", "referensi", "po no", "no po", "so"] },
  { key: "paidDate", label: "Tanggal bayar", synonyms: ["tanggal bayar", "tgl bayar", "paid date", "tanggal pembayaran", "tgl transfer", "tanggal transfer"] },
  { key: "paidAmount", label: "Jumlah dibayar", synonyms: ["jumlah dibayar", "jumlah bayar", "dibayar", "paid amount", "nominal bayar"] },
  { key: "notes", label: "Catatan", synonyms: ["catatan", "notes", "remark", "keterangan"] },
];

export type Mapping = Partial<Record<FieldKey, number>>;

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

export function detectMapping(headers: unknown[]): Mapping {
  const heads = headers.map(norm);
  const mapping: Mapping = {};
  const used = new Set<number>();
  // exact matches first, then "contains", so "harga satuan" wins over "harga"
  for (const pass of ["exact", "contains"] as const) {
    for (const f of FIELDS) {
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

export function guessHeaderRow(rows: unknown[][]) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const filled = rows[i].filter((c) => String(c ?? "").trim() !== "").length;
    if (filled >= 3) return i;
  }
  return 0;
}

const MONTHS: Record<string, number> = {
  jan: 1, januari: 1, january: 1, feb: 2, februari: 2, february: 2, mar: 3, maret: 3, march: 3, apr: 4, april: 4,
  mei: 5, may: 5, jun: 6, juni: 6, june: 6, jul: 7, juli: 7, july: 7, agu: 8, agt: 8, agustus: 8, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, okt: 10, oktober: 10, oct: 10, october: 10, nov: 11, november: 11, des: 12, desember: 12, dec: 12, december: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 ? `${y}-${pad(m)}-${pad(d)}` : null;
};

export function parseDate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    const t = new Date(v.getTime() + 12 * 3600 * 1000); // absorb timezone drift from the spreadsheet reader
    return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }
  if (typeof v === "number") {
    if (v < 20000 || v > 80000) return null;
    const t = new Date(Math.round((v - 25569) * 86400) * 1000);
    return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }
  const s = String(v).trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(s);
  if (m) return iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]); // day first
  m = /^(\d{1,2})[\s-]+([A-Za-z]+)\.?[\s-]+(\d{2,4})/.exec(s);
  if (m && MONTHS[m[2].toLowerCase()]) return iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  return null;
}

export function parseNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  let s = String(v).trim().replace(/rp\.?/i, "").replace(/%/g, "").replace(/\s/g, "");
  if (!s || s === "-") return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  const dots = (s.match(/\./g) || []).length;
  const commas = (s.match(/,/g) || []).length;
  if (dots && commas) {
    // whichever comes last is the decimal separator
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (commas) {
    s = commas === 1 && /,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (dots > 1 || (dots === 1 && /^\d{1,3}\.\d{3}$/.test(s))) {
    s = s.replace(/\./g, ""); // 1.250.000 or 1.250
  }
  const n = Number(s);
  return isFinite(n) ? (neg ? -n : n) : null;
}

export interface ParsedRow {
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

const text = (v: unknown) => (v === null || v === undefined ? "" : v instanceof Date ? "" : String(v).trim());

export function buildRows(data: unknown[][], headerRow: number, mapping: Mapping, fillDown = false): ParsedRow[] {
  const get = (r: unknown[], k: FieldKey) => (mapping[k] === undefined ? undefined : r[mapping[k]!]);
  const out: ParsedRow[] = [];
  let last: { date: unknown; vendor: string; invoiceNo: string; dueDate: unknown } = { date: undefined, vendor: "", invoiceNo: "", dueDate: undefined };
  for (let i = headerRow + 1; i < data.length; i++) {
    const r = data[i];
    if (!r || r.every((c) => String(c ?? "").trim() === "")) continue;
    let ppn = parseNumber(get(r, "ppn"));
    if (ppn !== null && ppn > 0 && ppn <= 1) ppn = ppn * 100; // 0.11 -> 11
    let rawDate = get(r, "date");
    let vendor = text(get(r, "vendor"));
    let invoiceNo = text(get(r, "invoiceNo"));
    let dueRaw = get(r, "dueDate");
    if (fillDown) {
      const blank = (v: unknown) => v === null || v === undefined || String(v).trim() === "";
      if (blank(rawDate)) rawDate = last.date;
      if (blank(vendor)) vendor = last.vendor;
      if (blank(invoiceNo) && vendor === last.vendor) invoiceNo = last.invoiceNo;
      if (blank(dueRaw)) dueRaw = last.dueDate;
      last = { date: rawDate, vendor, invoiceNo, dueDate: dueRaw };
    }
    out.push({
      row: i + 1,
      date: parseDate(rawDate),
      dateRaw: parseDate(rawDate) ? "" : text(rawDate),
      vendor,
      invoiceNo,
      partNumber: text(get(r, "partNumber")),
      description: text(get(r, "description")),
      qty: parseNumber(get(r, "qty")),
      unit: text(get(r, "unit")),
      unitPrice: parseNumber(get(r, "unitPrice")),
      amount: parseNumber(get(r, "amount")),
      ppn,
      pph: parseNumber(get(r, "pph")),
      dueDate: parseDate(dueRaw),
      soRef: text(get(r, "soRef")),
      paidDate: parseDate(get(r, "paidDate")),
      paidAmount: parseNumber(get(r, "paidAmount")),
      notes: text(get(r, "notes")),
    });
  }
  return out;
}
