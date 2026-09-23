"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { usePermissions } from "@/components/permissions";
import { can } from "@/lib/rbac-shared";
import { guessHeaderRow } from "@/lib/excel-parse";
import {
  buildMasterRows, detectMappingFor, FIELD_DEFS, TEMPLATE_ROWS, TYPE_INFO,
  type ImportMapping, type ImportType, type MasterPreview, type MasterRow, type PreviewRow, type RowAction,
} from "@/lib/master-import";

const TYPES = Object.keys(TYPE_INFO) as ImportType[];
const STEPS = ["Jenis data", "Unggah file", "Petakan kolom", "Periksa", "Selesai"];
const ACTION_LABEL: Record<RowAction, string> = { create: "Baru", update: "Diperbarui", skip: "Dilewati", error: "Error" };
const ACTION_TONE: Record<RowAction, string> = { create: "text-emerald-700", update: "text-sky-700", skip: "text-slate-400", error: "text-brand" };
const CHUNK: Record<ImportType, number> = { products: 60, customers: 60, stock: 100 };
const SHOW_LIMIT = 400;

const th = "px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400";
const td = "px-3 py-2 text-sm text-slate-700";
const field = "h-9 border border-slate-300 bg-white px-2 text-sm";
const btn = "border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const btnPrimary = "bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50";

export default function MasterImportPage() {
  const { status } = useSession();
  const router = useRouter();
  const { me } = usePermissions();

  const [step, setStep] = useState(0);
  const [type, setType] = useState<ImportType>("products");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<Record<string, unknown[][]>>({});
  const [sheet, setSheet] = useState("");
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<ImportMapping>({});
  const [updateExisting, setUpdateExisting] = useState(true);
  const [stockMode, setStockMode] = useState<"set" | "add">("set");

  const [preview, setPreview] = useState<MasterPreview | null>(null);
  const [filter, setFilter] = useState<"all" | RowAction>("all");
  const [showAll, setShowAll] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ created: number; updated: number; stockRows: number; failedChunks: number } | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/login");
  }, [status, router]);

  const allowed = TYPES.filter((t) => !me || can(me.perms, TYPE_INFO[t].areas, "edit"));
  const defs = FIELD_DEFS[type];
  const data = sheets[sheet] || [];
  const headers = data[headerRow] || [];

  const rows: MasterRow[] = useMemo(() => (step >= 2 ? buildMasterRows(type, data, headerRow, mapping) : []), [step, type, data, headerRow, mapping]);
  const missingRequired = defs.filter((f) => f.required && mapping[f.key] === undefined);
  const hasStockCol = type === "stock" || mapping.qty !== undefined;

  const pickSheet = (name: string, all = sheets, t = type) => {
    const r = all[name] || [];
    const h = guessHeaderRow(r);
    setSheet(name);
    setHeaderRow(h);
    setMapping(detectMappingFor(t, r[h] || []));
  };

  const loadFile = async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const out: Record<string, unknown[][]> = {};
      for (const n of wb.SheetNames) out[n] = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: true, defval: "" });
      const first = wb.SheetNames.find((n) => out[n].length > 1) || wb.SheetNames[0];
      if (!first) throw new Error("File tidak berisi lembar kerja");
      setFileName(file.name);
      setSheets(out);
      pickSheet(first, out);
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "File tidak bisa dibaca");
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet(TEMPLATE_ROWS[type]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, TYPE_INFO[type].label);
    XLSX.writeFile(wb, TYPE_INFO[type].templateName);
  };

  const runPreview = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/imports/master/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, rows, options: { updateExisting, stockMode } }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Gagal memeriksa data");
      setPreview(await res.json());
      setFilter("all");
      setShowAll(false);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memeriksa data");
    } finally {
      setBusy(false);
    }
  };

  const toSave = preview ? preview.rows.filter((r) => r.action === "create" || r.action === "update") : [];

  const commit = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    setProgress(0);
    const wanted = new Set(toSave.map((r) => r.row));
    const payload = rows.filter((r) => wanted.has(r.row));
    const batchId = `import-${Date.now()}`;
    const total = { created: 0, updated: 0, stockRows: 0, failedChunks: 0 };
    const size = CHUNK[type];
    try {
      for (let i = 0; i < payload.length; i += size) {
        const res = await fetch("/api/imports/master/commit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, rows: payload.slice(i, i + size), options: { updateExisting, stockMode }, batchId }),
        });
        if (!res.ok) {
          total.failedChunks++;
          setError((await res.json().catch(() => null))?.error || "Sebagian baris gagal disimpan");
        } else {
          const d = await res.json();
          total.created += d.applied.created;
          total.updated += d.applied.updated;
          total.stockRows += d.applied.stockRows;
        }
        setProgress(Math.min(i + size, payload.length));
      }
      await fetch("/api/imports/master/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type, fileName, options: { updateExisting, stockMode },
          summary: { ...total, skipped: preview.summary.skip, errors: preview.summary.error, fileName },
        }),
      }).catch(() => {});
    } finally {
      setResult(total);
      setBusy(false);
      setStep(4);
    }
  };

  const shown: PreviewRow[] = preview ? preview.rows.filter((r) => filter === "all" || r.action === filter) : [];
  const visible = showAll ? shown : shown.slice(0, SHOW_LIMIT);
  const listHref = type === "customers" ? "/sales/customers" : type === "products" ? "/operational/products" : "/supply-chain/stock";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <Link href="/settings" className="text-sm text-slate-500 hover:text-slate-900">← Pengaturan</Link>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Impor data master</h1>
          <p className="mt-1 text-slate-600">Sparepart, customer, dan stok awal dari Excel atau CSV. Data diperiksa dulu sebelum disimpan.</p>
        </div>

        <ol className="flex flex-wrap gap-x-8 gap-y-2 border-b border-slate-200 pb-3 text-sm">
          {STEPS.map((s, i) => (
            <li key={s} className={i === step ? "font-semibold text-slate-900" : i < step ? "text-slate-500" : "text-slate-300"}>
              <span className="mr-1.5 tabular-nums">{i + 1}.</span>{s}
            </li>
          ))}
        </ol>

        {error && <div className="border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}

        {/* 1. type */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              {allowed.map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`border p-5 text-left ${type === t ? "border-slate-900 bg-white" : "border-slate-200 bg-white hover:border-slate-400"}`}
                >
                  <span className="block text-base font-semibold text-slate-900">{TYPE_INFO[t].label}</span>
                  <span className="mt-1 block text-sm text-slate-500">{TYPE_INFO[t].description}</span>
                </button>
              ))}
              {allowed.length === 0 && <p className="text-sm text-slate-500">Peran Anda tidak boleh mengimpor data master.</p>}
            </div>
            <div className="border border-slate-200 bg-white p-4 text-sm text-slate-600">
              <p><b className="text-slate-900">Urutan yang disarankan:</b> sparepart dulu, lalu stok awal (atau isi stok langsung di file sparepart), dan customer kapan saja.</p>
            </div>
            <button className={btnPrimary} disabled={!allowed.includes(type)} onClick={() => setStep(1)}>Lanjut</button>
          </div>
        )}

        {/* 2. upload */}
        {step === 1 && (
          <div className="space-y-4">
            <label className="block cursor-pointer border border-dashed border-slate-300 bg-white px-6 py-12 text-center hover:bg-slate-50">
              <span className="block text-sm font-medium text-slate-900">{busy ? "Membaca file…" : `Pilih file ${TYPE_INFO[type].label.toLowerCase()} (.xlsx, .xls, .csv)`}</span>
              <span className="mt-1 block text-xs text-slate-400">File dibaca di browser Anda, belum ada yang disimpan.</span>
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])} />
            </label>
            <div className="border border-slate-200 bg-white p-5 text-sm text-slate-600">
              <p className="font-medium text-slate-900">Kolom {TYPE_INFO[type].label.toLowerCase()} yang dikenali</p>
              <ul className="mt-2 grid gap-x-8 gap-y-1 sm:grid-cols-2">
                {defs.map((f) => (
                  <li key={f.key}><span className="text-slate-900">{f.label}</span>{f.required && <span className="text-brand"> *</span>}{f.hint && <span className="text-slate-400"> · {f.hint}</span>}</li>
                ))}
              </ul>
              <button onClick={downloadTemplate} className="mt-3 text-sm font-medium text-slate-900 underline underline-offset-2">Unduh template Excel</button>
            </div>
            <button className={btn} onClick={() => setStep(0)}>Kembali</button>
          </div>
        )}

        {/* 3. mapping */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end gap-4">
              <div className="text-sm"><span className="text-slate-400">File</span><p className="font-medium text-slate-900">{fileName}</p></div>
              <label className="text-xs text-slate-500">Lembar
                <select className={`${field} ml-2`} value={sheet} onChange={(e) => pickSheet(e.target.value)}>
                  {Object.keys(sheets).map((n) => <option key={n}>{n}</option>)}
                </select>
              </label>
              <label className="text-xs text-slate-500">Baris judul kolom
                <input type="number" min={1} className={`${field} ml-2 w-20`} value={headerRow + 1}
                  onChange={(e) => { const h = Math.max(0, (parseInt(e.target.value) || 1) - 1); setHeaderRow(h); setMapping(detectMappingFor(type, data[h] || [])); }} />
              </label>
            </div>

            <div className="border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-5 py-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Pemetaan kolom: {TYPE_INFO[type].label}</h3>
                <p className="mt-0.5 text-xs text-slate-400">Sudah ditebak dari judul kolom. Koreksi bila ada yang salah.</p>
              </div>
              <div className="grid gap-x-8 gap-y-3 p-5 sm:grid-cols-2">
                {defs.map((f) => (
                  <label key={f.key} className="block text-sm">
                    <span className="text-slate-700">{f.label}{f.required && <span className="text-brand"> *</span>}</span>
                    <select className={`${field} mt-1 w-full`} value={mapping[f.key] ?? ""}
                      onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value === "" ? undefined : parseInt(e.target.value) }))}>
                      <option value="">— tidak ada —</option>
                      {headers.map((h, i) => <option key={i} value={i}>{String(h || `(kolom ${i + 1})`).slice(0, 40)}</option>)}
                    </select>
                    {f.hint && <span className="text-xs text-slate-400">{f.hint}</span>}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid gap-4 border border-slate-200 bg-white p-5 sm:grid-cols-2">
              {type !== "stock" && (
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input type="checkbox" className="mt-1" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} />
                  <span>Perbarui data yang sudah ada<span className="block text-xs text-slate-400">Hanya kolom yang terisi di file yang diubah. Sel kosong tidak menghapus data lama.</span></span>
                </label>
              )}
              {hasStockCol && (
                <fieldset className="text-sm text-slate-700">
                  <legend className="mb-1">Cara mengisi stok</legend>
                  <label className="mr-6 inline-flex items-center gap-2"><input type="radio" checked={stockMode === "set"} onChange={() => setStockMode("set")} />Jadikan jumlah ini</label>
                  <label className="inline-flex items-center gap-2"><input type="radio" checked={stockMode === "add"} onChange={() => setStockMode("add")} />Tambahkan ke stok</label>
                  <span className="mt-1 block text-xs text-slate-400">“Jadikan jumlah ini” cocok untuk stok awal dan hasil hitung fisik.</span>
                </fieldset>
              )}
            </div>

            <div className="overflow-x-auto border border-slate-200 bg-white">
              <p className="border-b border-slate-200 px-5 py-2 text-xs text-slate-400">Contoh hasil baca (5 dari {rows.length} baris)</p>
              <table className="w-full">
                <thead><tr className="border-b border-slate-200"><th className={th}>Baris</th>{defs.filter((f) => mapping[f.key] !== undefined).map((f) => <th key={f.key} className={th}>{f.label}</th>)}</tr></thead>
                <tbody>
                  {rows.slice(0, 5).map((r) => (
                    <tr key={r.row} className="border-b border-slate-100">
                      <td className={td}>{r.row}</td>
                      {defs.filter((f) => mapping[f.key] !== undefined).map((f) => (
                        <td key={f.key} className={td}>{r.values[f.key] === null || r.values[f.key] === "" ? <span className="text-slate-300">-</span> : String(r.values[f.key])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {missingRequired.length > 0 && <p className="text-sm text-brand">Belum dipetakan: {missingRequired.map((f) => f.label).join(", ")}.</p>}
            <div className="flex gap-3">
              <button className={btn} onClick={() => setStep(1)}>Ganti file</button>
              <button className={btnPrimary} disabled={busy || missingRequired.length > 0 || rows.length === 0} onClick={runPreview}>
                {busy ? "Memeriksa…" : `Periksa ${rows.length} baris`}
              </button>
            </div>
          </div>
        )}

        {/* 4. preview */}
        {step === 3 && preview && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-4">
              {([["Baru", preview.summary.create, "text-emerald-700"], ["Diperbarui", preview.summary.update, "text-sky-700"], ["Dilewati", preview.summary.skip, "text-slate-500"], ["Error", preview.summary.error, "text-brand"]] as const).map(([l, v, c]) => (
                <div key={l} className="border border-slate-200 bg-white p-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">{l}</p>
                  <p className={`mt-1 text-xl font-semibold tabular-nums ${c}`}>{v}</p>
                </div>
              ))}
            </div>
            {(preview.summary.newUnits.length > 0 || preview.summary.newCategories.length > 0) && (
              <div className="border-l-2 border-amber-500 bg-white px-4 py-3 text-sm text-slate-700">
                {preview.summary.newUnits.length > 0 && <p>Satuan baru akan dibuat: <b>{preview.summary.newUnits.join(", ")}</b></p>}
                {preview.summary.newCategories.length > 0 && <p>Kategori baru akan dibuat: <b>{preview.summary.newCategories.join(", ")}</b></p>}
              </div>
            )}

            <section className="border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center gap-4 border-b border-slate-200 px-5 py-3 text-xs">
                {(["all", "create", "update", "skip", "error"] as const).map((f) => (
                  <button key={f} onClick={() => setFilter(f)} className={filter === f ? "font-semibold text-slate-900" : "text-slate-500"}>
                    {f === "all" ? "Semua" : ACTION_LABEL[f]}
                  </button>
                ))}
              </div>
              <div className="max-h-[520px] overflow-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-white"><tr className="border-b border-slate-200"><th className={th}>Baris</th><th className={th}>{type === "customers" ? "Customer" : "Nomor part"}</th><th className={th}>Nama</th><th className={th}>Hasil</th><th className={th}>Perubahan dan catatan</th></tr></thead>
                  <tbody>
                    {visible.map((r) => (
                      <tr key={r.row} className="border-b border-slate-100 align-top">
                        <td className={`${td} tabular-nums`}>{r.row}</td>
                        <td className={`${td} font-mono text-xs`}>{type === "customers" ? "" : r.key}</td>
                        <td className={td}>{type === "customers" ? r.key || r.label : r.label}</td>
                        <td className={`${td} font-medium ${ACTION_TONE[r.action]}`}>{ACTION_LABEL[r.action]}</td>
                        <td className={`${td} text-xs`}>
                          {r.changes.map((c, i) => <span key={i} className="mr-3 inline-block text-slate-600">{c}</span>)}
                          {r.messages.map((m, i) => <span key={i} className={`mr-3 inline-block ${r.action === "error" ? "text-brand" : "text-slate-400"}`}>{m}</span>)}
                        </td>
                      </tr>
                    ))}
                    {shown.length === 0 && <tr><td colSpan={5} className="px-5 py-6 text-sm text-slate-400">Tidak ada.</td></tr>}
                  </tbody>
                </table>
              </div>
              {shown.length > visible.length && (
                <p className="border-t border-slate-100 px-5 py-2 text-xs text-slate-500">
                  Menampilkan {visible.length} dari {shown.length}. <button className="underline" onClick={() => setShowAll(true)}>Tampilkan semua</button>
                </p>
              )}
            </section>

            {busy && (
              <div>
                <div className="h-2 bg-slate-100"><div className="h-2 bg-slate-800" style={{ width: `${toSave.length ? (progress / toSave.length) * 100 : 0}%` }} /></div>
                <p className="mt-1 text-xs text-slate-500">Menyimpan {progress} dari {toSave.length} baris…</p>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <button className={btn} disabled={busy} onClick={() => setStep(2)}>Kembali</button>
              <button className={btnPrimary} disabled={busy || toSave.length === 0} onClick={commit}>
                Simpan {toSave.length} baris
              </button>
              <span className="text-xs text-slate-400">Baris Error dan Dilewati tidak disimpan. Perbaiki di Excel lalu unggah ulang, aman diulang.</span>
            </div>
          </div>
        )}

        {/* 5. done */}
        {step === 4 && result && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              {([["Baru", result.created], ["Diperbarui", result.updated], ["Baris stok dicatat", result.stockRows]] as const).map(([l, v]) => (
                <div key={l} className="border border-slate-200 bg-white p-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">{l}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{v}</p>
                </div>
              ))}
            </div>
            {result.failedChunks > 0 && (
              <div className="border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                {result.failedChunks} bagian gagal disimpan. Unggah ulang file yang sama. Baris yang sudah masuk tidak akan ganda.
              </div>
            )}
            <div className="flex flex-wrap gap-3">
              <Link href={listHref} className={btnPrimary}>Lihat daftar {TYPE_INFO[type].label.toLowerCase()}</Link>
              <button className={btn} onClick={() => { setStep(0); setPreview(null); setResult(null); setError(null); }}>Impor file lain</button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
