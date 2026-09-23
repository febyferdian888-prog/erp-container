"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { buildRows, detectMapping, FIELDS, guessHeaderRow, type FieldKey, type Mapping } from "@/lib/excel-parse";
import { normName } from "@/lib/name-utils";

interface PreviewItem {
  row: number; partNumber: string; description: string; qty: number; unit: string; unitPrice: number;
  subtotal: number; soRef: string; soId: string | null; soNumber: string | null; notes: string;
}
interface PreviewBill {
  key: string; vendorName: string; invoiceNo: string; date: string | null; dueDate: string | null; ppn: number;
  total: number; tax: number; grand: number; pph: number; paidDate: string | null; paidAmount: number; notes: string;
  items: PreviewItem[]; errors: string[]; warnings: string[]; status: "ok" | "error" | "duplicate";
}
interface VendorMatch { name: string; rows: number; supplierId: string | null; suggestions: { id: string; name: string }[] }
interface Preview {
  vendors: VendorMatch[];
  bills: PreviewBill[];
  summary: { rows: number; bills: number; ready: number; errors: number; duplicates: number; newVendors: number; grandTotal: number; linkedItems: number; totalItems: number };
}
interface Supplier { id: string; code: string; name: string }
interface Result { vendorName: string; invoiceNo: string; status: "created" | "skipped" | "failed"; billNumber?: string; reason?: string }

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
const dt = (d: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString("id-ID") : "-");
const th = "px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400";
const thr = th.replace("text-left", "text-right");
const td = "px-3 py-2 text-sm text-slate-700";
const tdr = `${td} text-right tabular-nums`;
const field = "h-9 border border-slate-300 bg-white px-2 text-sm";
const btn = "border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const btnPrimary = "bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50";

const STEPS = ["Unggah file", "Petakan kolom", "Periksa", "Selesai"];

export default function PurchaseImportPage() {
  const { status } = useSession();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<Record<string, unknown[][]>>({});
  const [sheet, setSheet] = useState("");
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<Mapping>({});
  const [fillDown, setFillDown] = useState(true);
  const [defaultPpn, setDefaultPpn] = useState(11);
  const [pricesIncludePpn, setPricesIncludePpn] = useState(false);
  const [defaultDueDays, setDefaultDueDays] = useState(30);

  const [preview, setPreview] = useState<Preview | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [vendorChoice, setVendorChoice] = useState<Record<string, string>>({}); // normName -> supplierId | ""
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "problem">("all");
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [suppliersCreated, setSuppliersCreated] = useState(0);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/login");
  }, [status, router]);

  const data = sheets[sheet] || [];
  const headers = data[headerRow] || [];

  const loadFile = async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const out: Record<string, unknown[][]> = {};
      for (const name of wb.SheetNames) {
        out[name] = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: "" });
      }
      const first = wb.SheetNames.find((n) => out[n].length > 1) || wb.SheetNames[0];
      if (!first) throw new Error("File tidak berisi lembar kerja");
      setFileName(file.name);
      setSheets(out);
      pickSheet(first, out);
      setStep(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "File tidak bisa dibaca");
    } finally {
      setBusy(false);
    }
  };

  const pickSheet = (name: string, all = sheets) => {
    const rows = all[name] || [];
    const h = guessHeaderRow(rows);
    setSheet(name);
    setHeaderRow(h);
    setMapping(detectMapping(rows[h] || []));
  };

  const changeHeaderRow = (h: number) => {
    setHeaderRow(h);
    setMapping(detectMapping(data[h] || []));
  };

  const downloadTemplate = async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([
      ["Tanggal", "Vendor", "No. Invoice Vendor", "Nomor Part", "Deskripsi", "Qty", "Satuan", "Harga Satuan", "PPN (%)", "Jatuh Tempo", "No. PO Customer", "Tanggal Bayar", "Jumlah Dibayar", "Catatan"],
      ["2026-03-05", "PT. Contoh Vendor", "INV-0001", "6745-71-5120", "TUBE", 2, "pcs", 1300000, 11, "2026-04-04", "PO0126020852", "", "", ""],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pembelian");
    XLSX.writeFile(wb, "template-rekap-pembelian.xlsx");
  };

  const rows = useMemo(() => (step >= 1 ? buildRows(data, headerRow, mapping, fillDown) : []), [step, data, headerRow, mapping, fillDown]);
  const missingRequired = FIELDS.filter((f) => f.required && mapping[f.key] === undefined);
  const priceMissing = mapping.unitPrice === undefined && mapping.amount === undefined;

  const runPreview = async () => {
    setError(null);
    setBusy(true);
    try {
      const [res, sup] = await Promise.all([
        fetch("/api/imports/purchases/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows, options: { defaultPpn, pricesIncludePpn, defaultDueDays } }),
        }),
        fetch("/api/suppliers"),
      ]);
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Gagal memeriksa data");
      const p: Preview = await res.json();
      setPreview(p);
      setSuppliers(sup.ok ? await sup.json() : []);
      setVendorChoice(Object.fromEntries(p.vendors.map((v) => [normName(v.name), v.supplierId || ""])));
      setSelected(new Set(p.bills.filter((b) => b.status === "ok").map((b) => b.key)));
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memeriksa data");
    } finally {
      setBusy(false);
    }
  };

  const chosenBills = preview ? preview.bills.filter((b) => selected.has(b.key) && b.status === "ok") : [];
  const chosenTotal = chosenBills.reduce((s, b) => s + b.grand, 0);

  const commit = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    setProgress(0);
    const all: Result[] = [];
    let created = 0;
    try {
      const payload = chosenBills.map((b) => ({
        vendorName: b.vendorName,
        supplierId: vendorChoice[normName(b.vendorName)] || null,
        invoiceNo: b.invoiceNo,
        date: b.date,
        dueDate: b.dueDate,
        ppn: b.ppn,
        pph: b.pph,
        notes: b.notes,
        paidDate: b.paidDate,
        paidAmount: b.paidAmount,
        items: b.items.map((i) => ({ partNumber: i.partNumber, description: i.description, qty: i.qty, unit: i.unit, unitPrice: i.unitPrice, soId: i.soId, notes: i.notes })),
      }));
      const CHUNK = 20;
      for (let i = 0; i < payload.length; i += CHUNK) {
        const res = await fetch("/api/imports/purchases/commit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bills: payload.slice(i, i + CHUNK) }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Penyimpanan berhenti di tengah jalan");
        const d = await res.json();
        all.push(...d.results);
        created += d.suppliersCreated;
        setProgress(Math.min(i + CHUNK, payload.length));
      }
    } catch (e) {
      setError((e instanceof Error ? e.message : "Gagal menyimpan") + ". Yang sudah tersimpan tidak akan terduplikasi jika Anda mengunggah ulang file yang sama.");
    } finally {
      setResults(all);
      setSuppliersCreated(created);
      setBusy(false);
      setStep(3);
    }
  };

  const shownBills = preview ? preview.bills.filter((b) => (filter === "all" ? true : b.status !== "ok" || b.warnings.length > 0)) : [];
  const toggle = (key: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <Link href="/supply-chain/bills" className="text-sm text-slate-500 hover:text-slate-900">← Vendor Bills</Link>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Impor rekap pembelian</h1>
          <p className="mt-1 text-slate-600">Unggah Excel atau CSV. Data diperiksa dulu, baru disimpan sebagai bill vendor.</p>
        </div>

        <ol className="flex flex-wrap gap-x-8 gap-y-2 border-b border-slate-200 pb-3 text-sm">
          {STEPS.map((s, i) => (
            <li key={s} className={i === step ? "font-semibold text-slate-900" : i < step ? "text-slate-500" : "text-slate-300"}>
              <span className="mr-1.5 tabular-nums">{i + 1}.</span>{s}
            </li>
          ))}
        </ol>

        {error && <div className="border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}

        {/* ---------- 1. upload ---------- */}
        {step === 0 && (
          <div className="space-y-4">
            <label className="block cursor-pointer border border-dashed border-slate-300 bg-white px-6 py-12 text-center hover:bg-slate-50">
              <span className="block text-sm font-medium text-slate-900">{busy ? "Membaca file…" : "Pilih file .xlsx, .xls, atau .csv"}</span>
              <span className="mt-1 block text-xs text-slate-400">File dibaca di browser Anda, belum ada yang disimpan.</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])}
              />
            </label>
            <div className="border border-slate-200 bg-white p-5 text-sm text-slate-600">
              <p className="font-medium text-slate-900">Kolom yang dikenali</p>
              <p className="mt-1">
                Wajib: tanggal, vendor, deskripsi barang, qty, dan harga satuan (atau total baris). Opsional: no. invoice vendor,
                nomor part, satuan, PPN, jatuh tempo, referensi penjualan (no. PO customer atau no. SO), tanggal dan jumlah bayar, catatan.
                Satu baris = satu item. Baris dengan vendor dan nomor invoice sama digabung jadi satu bill.
              </p>
              <button onClick={downloadTemplate} className="mt-3 text-sm font-medium text-slate-900 underline underline-offset-2">Unduh template Excel</button>
            </div>
          </div>
        )}

        {/* ---------- 2. mapping ---------- */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end gap-4">
              <div className="text-sm"><span className="text-slate-400">File</span><p className="font-medium text-slate-900">{fileName}</p></div>
              <label className="text-xs text-slate-500">Lembar
                <select className={`${field} ml-2`} value={sheet} onChange={(e) => pickSheet(e.target.value)}>
                  {Object.keys(sheets).map((n) => <option key={n}>{n}</option>)}
                </select>
              </label>
              <label className="text-xs text-slate-500">Baris judul kolom
                <input type="number" min={1} className={`${field} ml-2 w-20`} value={headerRow + 1} onChange={(e) => changeHeaderRow(Math.max(0, (parseInt(e.target.value) || 1) - 1))} />
              </label>
            </div>

            <div className="border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-5 py-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Pemetaan kolom</h3>
                <p className="mt-0.5 text-xs text-slate-400">Sudah ditebak dari judul kolom. Koreksi bila ada yang salah.</p>
              </div>
              <div className="grid gap-x-8 gap-y-3 p-5 sm:grid-cols-2">
                {FIELDS.map((f) => (
                  <label key={f.key} className="block text-sm">
                    <span className="text-slate-700">{f.label}{f.required && <span className="text-brand"> *</span>}</span>
                    <select
                      className={`${field} mt-1 w-full`}
                      value={mapping[f.key] ?? ""}
                      onChange={(e) => setMapping((m) => ({ ...m, [f.key as FieldKey]: e.target.value === "" ? undefined : parseInt(e.target.value) }))}
                    >
                      <option value="">— tidak ada —</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>{String(h || `(kolom ${i + 1})`).slice(0, 40)}</option>
                      ))}
                    </select>
                    {f.hint && <span className="text-xs text-slate-400">{f.hint}</span>}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid gap-4 border border-slate-200 bg-white p-5 sm:grid-cols-2">
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" className="mt-1" checked={fillDown} onChange={(e) => setFillDown(e.target.checked)} />
                <span>Isi sel kosong dari baris di atasnya<span className="block text-xs text-slate-400">Untuk file yang tanggal, vendor, dan no. invoice-nya hanya ditulis di baris pertama tiap bill.</span></span>
              </label>
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" className="mt-1" checked={pricesIncludePpn} onChange={(e) => setPricesIncludePpn(e.target.checked)} />
                <span>Harga di file sudah termasuk PPN<span className="block text-xs text-slate-400">Harga dibagi (1 + PPN) agar tersimpan sebelum PPN.</span></span>
              </label>
              <label className="text-sm text-slate-700">PPN bila tidak ada kolom PPN (%)
                <input type="number" min={0} step="0.01" className={`${field} ml-2 w-24`} value={defaultPpn} onChange={(e) => setDefaultPpn(parseFloat(e.target.value) || 0)} />
              </label>
              <label className="text-sm text-slate-700">Jatuh tempo bila kosong (hari setelah tanggal)
                <input type="number" min={0} className={`${field} ml-2 w-24`} value={defaultDueDays} onChange={(e) => setDefaultDueDays(parseInt(e.target.value) || 0)} />
              </label>
            </div>

            <div className="overflow-x-auto border border-slate-200 bg-white">
              <p className="border-b border-slate-200 px-5 py-2 text-xs text-slate-400">Contoh hasil baca (5 baris pertama dari {rows.length})</p>
              <table className="w-full">
                <thead><tr className="border-b border-slate-200"><th className={th}>Baris</th><th className={th}>Tanggal</th><th className={th}>Vendor</th><th className={th}>Invoice</th><th className={th}>Deskripsi</th><th className={thr}>Qty</th><th className={thr}>Harga</th><th className={th}>Ref. penjualan</th></tr></thead>
                <tbody>
                  {rows.slice(0, 5).map((r) => (
                    <tr key={r.row} className="border-b border-slate-100">
                      <td className={td}>{r.row}</td>
                      <td className={td}>{r.date ? dt(r.date) : <span className="text-brand">{r.dateRaw || "kosong"}</span>}</td>
                      <td className={td}>{r.vendor || "-"}</td>
                      <td className={td}>{r.invoiceNo || "-"}</td>
                      <td className={td}>{r.description || "-"}</td>
                      <td className={tdr}>{r.qty ?? "-"}</td>
                      <td className={tdr}>{r.unitPrice !== null ? idr(r.unitPrice) : r.amount !== null ? `${idr(r.amount)} (total)` : "-"}</td>
                      <td className={td}>{r.soRef || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {(missingRequired.length > 0 || priceMissing) && (
              <p className="text-sm text-brand">
                Belum dipetakan: {[...missingRequired.map((f) => f.label), ...(priceMissing ? ["Harga satuan atau Total baris"] : [])].join(", ")}.
              </p>
            )}
            <div className="flex gap-3">
              <button className={btn} onClick={() => setStep(0)}>Ganti file</button>
              <button className={btnPrimary} disabled={busy || missingRequired.length > 0 || priceMissing || rows.length === 0} onClick={runPreview}>
                {busy ? "Memeriksa…" : `Periksa ${rows.length} baris`}
              </button>
            </div>
          </div>
        )}

        {/* ---------- 3. preview ---------- */}
        {step === 2 && preview && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-4">
              {[
                ["Siap disimpan", `${preview.summary.ready} bill`, idr(preview.summary.grandTotal)],
                ["Bermasalah", `${preview.summary.errors} bill`, "dilewati, perbaiki di Excel"],
                ["Sudah ada", `${preview.summary.duplicates} bill`, "no. invoice vendor sama"],
                ["Terhubung ke penjualan", `${preview.summary.linkedItems} / ${preview.summary.totalItems} item`, "cocok dengan Sales Order"],
              ].map(([l, v, n]) => (
                <div key={l} className="border border-slate-200 bg-white p-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">{l}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{v}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{n}</p>
                </div>
              ))}
            </div>

            <section className="border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-5 py-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Vendor ({preview.vendors.length})</h3>
                <p className="mt-0.5 text-xs text-slate-400">{preview.summary.newVendors} vendor belum ada di sistem. Pilih vendor yang sudah ada bila namanya hanya beda penulisan, atau biarkan untuk membuat vendor baru.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr className="border-b border-slate-200"><th className={th}>Nama di file</th><th className={thr}>Baris</th><th className={th}>Masuk ke vendor</th></tr></thead>
                  <tbody>
                    {preview.vendors.map((v) => {
                      const key = normName(v.name);
                      return (
                        <tr key={key} className="border-b border-slate-100 align-top">
                          <td className={td}>{v.name}</td>
                          <td className={tdr}>{v.rows}</td>
                          <td className={td}>
                            <select className={`${field} w-72`} value={vendorChoice[key] ?? ""} onChange={(e) => setVendorChoice((c) => ({ ...c, [key]: e.target.value }))}>
                              <option value="">Buat vendor baru: {v.name}</option>
                              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
                            </select>
                            {!v.supplierId && v.suggestions.length > 0 && !vendorChoice[key] && (
                              <p className="mt-1 text-xs text-slate-500">
                                Mirip:{" "}
                                {v.suggestions.map((s) => (
                                  <button key={s.id} className="mr-2 underline underline-offset-2" onClick={() => setVendorChoice((c) => ({ ...c, [key]: s.id }))}>{s.name}</button>
                                ))}
                              </p>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Bill ({preview.bills.length})</h3>
                <div className="flex gap-4 text-xs">
                  <button className={filter === "all" ? "font-semibold text-slate-900" : "text-slate-500"} onClick={() => setFilter("all")}>Semua</button>
                  <button className={filter === "problem" ? "font-semibold text-slate-900" : "text-slate-500"} onClick={() => setFilter("problem")}>Perlu dicek</button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr className="border-b border-slate-200"><th className={th}></th><th className={th}>Tanggal</th><th className={th}>Vendor</th><th className={th}>Invoice vendor</th><th className={thr}>Item</th><th className={thr}>Total + PPN</th><th className={th}>Status</th></tr></thead>
                  <tbody>
                    {shownBills.map((b) => (
                      <Fragment key={b.key}>
                        <tr className="cursor-pointer border-b border-slate-100 hover:bg-slate-50" onClick={() => setOpen(open === b.key ? null : b.key)}>
                          <td className={td} onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" disabled={b.status !== "ok"} checked={selected.has(b.key) && b.status === "ok"} onChange={() => toggle(b.key)} />
                          </td>
                          <td className={td}>{dt(b.date)}</td>
                          <td className={td}>{b.vendorName || <span className="text-brand">kosong</span>}</td>
                          <td className={`${td} font-mono text-xs`}>{b.invoiceNo || "-"}</td>
                          <td className={tdr}>{b.items.length}</td>
                          <td className={tdr}>{idr(b.grand)}{b.paidAmount > 0 && <span className="block text-xs text-slate-400">dibayar {idr(b.paidAmount)}</span>}</td>
                          <td className={td}>
                            <span className={b.status === "ok" ? (b.warnings.length ? "text-amber-700" : "text-emerald-700") : b.status === "duplicate" ? "text-slate-500" : "text-brand"}>
                              {b.status === "ok" ? (b.warnings.length ? "Cek" : "Siap") : b.status === "duplicate" ? "Sudah ada" : "Error"}
                            </span>
                          </td>
                        </tr>
                        {open === b.key && (
                          <tr className="border-b border-slate-100 bg-slate-50/60">
                            <td colSpan={7} className="px-5 py-3">
                              {[...b.errors.map((m) => [m, "text-brand"]), ...b.warnings.map((m) => [m, "text-amber-700"])].map(([m, c], i) => (
                                <p key={i} className={`text-xs ${c}`}>{m}</p>
                              ))}
                              <table className="mt-2 w-full bg-white">
                                <thead><tr className="border-b border-slate-200"><th className={th}>Baris</th><th className={th}>Part</th><th className={th}>Deskripsi</th><th className={thr}>Qty</th><th className={thr}>Harga (sebelum PPN)</th><th className={thr}>Subtotal</th><th className={th}>Untuk SO</th></tr></thead>
                                <tbody>
                                  {b.items.map((i) => (
                                    <tr key={i.row} className="border-b border-slate-100">
                                      <td className={td}>{i.row}</td>
                                      <td className={`${td} font-mono text-xs`}>{i.partNumber || "-"}</td>
                                      <td className={td}>{i.description}</td>
                                      <td className={tdr}>{i.qty} {i.unit}</td>
                                      <td className={tdr}>{idr(i.unitPrice)}</td>
                                      <td className={tdr}>{idr(i.subtotal)}</td>
                                      <td className={td}>{i.soNumber ?? (i.soRef ? <span className="text-amber-700">{i.soRef} (tidak cocok)</span> : "-")}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              <p className="mt-2 text-xs text-slate-500">PPN {b.ppn}% = {idr(b.tax)}{b.pph > 0 ? ` · PPh 23 dipotong ${idr(b.pph)}` : ""} · jatuh tempo {dt(b.dueDate)}{b.notes ? ` · ${b.notes}` : ""}</p>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                    {shownBills.length === 0 && <tr><td colSpan={7} className="px-5 py-6 text-sm text-slate-400">Tidak ada.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>

            {busy && (
              <div>
                <div className="h-2 bg-slate-100"><div className="h-2 bg-slate-800" style={{ width: `${chosenBills.length ? (progress / chosenBills.length) * 100 : 0}%` }} /></div>
                <p className="mt-1 text-xs text-slate-500">Menyimpan {progress} dari {chosenBills.length} bill…</p>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <button className={btn} disabled={busy} onClick={() => setStep(1)}>Kembali</button>
              <button className={btnPrimary} disabled={busy || chosenBills.length === 0} onClick={commit}>
                Simpan {chosenBills.length} bill ({idr(chosenTotal)})
              </button>
              <span className="text-xs text-slate-400">Bill disimpan berstatus Received dan langsung masuk jurnal, utang, dan margin.</span>
            </div>
          </div>
        )}

        {/* ---------- 4. result ---------- */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-4">
              {[
                ["Tersimpan", results.filter((r) => r.status === "created").length],
                ["Dilewati (sudah ada)", results.filter((r) => r.status === "skipped").length],
                ["Gagal", results.filter((r) => r.status === "failed").length],
                ["Vendor baru dibuat", suppliersCreated],
              ].map(([l, v]) => (
                <div key={l as string} className="border border-slate-200 bg-white p-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">{l}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{v}</p>
                </div>
              ))}
            </div>
            {results.some((r) => r.status !== "created") && (
              <div className="border border-slate-200 bg-white">
                <p className="border-b border-slate-200 px-5 py-2 text-xs text-slate-500">Yang tidak tersimpan</p>
                <ul className="divide-y divide-slate-100">
                  {results.filter((r) => r.status !== "created").map((r, i) => (
                    <li key={i} className="px-5 py-2 text-sm text-slate-700">{r.vendorName} {r.invoiceNo && `· ${r.invoiceNo}`} <span className="text-slate-400">— {r.reason}</span></li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex gap-3">
              <Link href="/supply-chain/bills" className={btnPrimary}>Lihat vendor bills</Link>
              <Link href="/reports/sales" className={btn}>Laporan margin dan aging utang</Link>
              <button className={btn} onClick={() => { setStep(0); setPreview(null); setResults([]); setError(null); }}>Impor file lain</button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
