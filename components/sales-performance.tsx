"use client";

import { useEffect, useState } from "react";

interface Bucket {
  key: number;
  revenue: number;
  invoiceCount: number;
  orders: number;
  orderCount: number;
  previousRevenue: number | null;
}

interface Data {
  view: "monthly" | "yearly";
  year: number;
  years: number[];
  buckets: Bucket[];
  totals: {
    revenue: number;
    invoiceCount: number;
    orders: number;
    orderCount: number;
    averageInvoice: number;
    growthVsPrevious: number | null;
    previousYear: number | null;
    comparedMonths: number | null;
  };
  topCustomers: { name: string; revenue: number; share: number }[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

const rupiah = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
const compact = (n: number) => {
  if (n >= 1e9) return `${(n / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 2 })} M`;
  if (n >= 1e6) return `${(n / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  if (n >= 1e3) return `${Math.round(n / 1e3).toLocaleString("id-ID")} rb`;
  return String(Math.round(n));
};

// Owner view of sales performance: invoiced sales (before PPN) and orders received, by month
// within a year or by year, with growth against the same months of the previous year.
export function SalesPerformance({ companyId }: { companyId?: string }) {
  const [view, setView] = useState<"monthly" | "yearly">("monthly");
  const [year, setYear] = useState<number | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ view });
    if (year) params.set("year", String(year));
    if (companyId) params.set("companyId", companyId);
    fetch(`/api/reports/sales-performance?${params}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Data) => {
        setData(d);
        setFailed(false);
        if (view === "monthly" && year === null) setYear(d.year);
      })
      .catch((e) => { if (e?.name !== "AbortError") setFailed(true); });
    return () => controller.abort();
  }, [view, year, companyId]);

  if (failed) return null;

  const max = data ? Math.max(1, ...data.buckets.map((b) => Math.max(b.revenue, b.orders))) : 1;
  const label = (key: number) => (data?.view === "monthly" ? MONTHS[key] : String(key));
  const heading = data?.view === "monthly" ? `Tahun ${data.year}` : "Semua tahun";

  const stat = "min-w-0";
  return (
    <section className="overview-documents mb-6" aria-label="Kinerja penjualan">
      <div className="overview-section-heading">
        <div>
          <h2>Kinerja penjualan</h2>
          <p>Omzet = invoice terbit sebelum PPN (tanpa draft dan batal). Pesanan masuk = nilai PO customer yang diterima.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Tampilan" className="inline-flex border border-slate-300">
            {(["monthly", "yearly"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={`px-3 py-1.5 text-sm ${view === v ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
              >
                {v === "monthly" ? "Bulanan" : "Tahunan"}
              </button>
            ))}
          </div>
          {view === "monthly" && data && (
            <select
              value={data.year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="erp-select"
              aria-label="Pilih tahun"
            >
              {data.years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
        </div>
      </div>

      {!data ? (
        <p className="py-6 text-sm text-slate-500">Memuat…</p>
      ) : (
        <>
          <div className="grid gap-x-8 gap-y-3 py-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className={stat}>
              <p className="text-xs text-slate-500">Omzet {heading}</p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900">{rupiah(data.totals.revenue)}</p>
              {data.totals.growthVsPrevious !== null && (
                <p className={`text-xs ${data.totals.growthVsPrevious >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                  {data.totals.growthVsPrevious >= 0 ? "▲" : "▼"} {Math.abs(data.totals.growthVsPrevious).toLocaleString("id-ID")}% dibanding {data.totals.comparedMonths} bulan pertama {data.totals.previousYear}
                </p>
              )}
              {data.totals.growthVsPrevious === null && data.view === "monthly" && (
                <p className="text-xs text-slate-400">Belum ada data {data.totals.previousYear} untuk dibandingkan</p>
              )}
            </div>
            <div className={stat}>
              <p className="text-xs text-slate-500">Pesanan masuk</p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900">{rupiah(data.totals.orders)}</p>
              <p className="text-xs text-slate-500">{data.totals.orderCount} PO customer</p>
            </div>
            <div className={stat}>
              <p className="text-xs text-slate-500">Invoice terbit</p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900">{data.totals.invoiceCount}</p>
              <p className="text-xs text-slate-500">rata-rata {rupiah(data.totals.averageInvoice)}</p>
            </div>
            <div className={stat}>
              <p className="text-xs text-slate-500">Customer terbesar</p>
              {data.topCustomers[0] ? (
                <>
                  <p className="truncate text-lg font-semibold text-slate-900">{data.topCustomers[0].name}</p>
                  <p className="text-xs text-slate-500">{data.topCustomers[0].share.toLocaleString("id-ID")}% dari omzet</p>
                </>
              ) : (
                <p className="text-sm text-slate-400">-</p>
              )}
            </div>
          </div>

          <div className="mt-2">
            <div className="mb-2 flex items-center gap-4 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 bg-slate-800" />Omzet</span>
              <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 bg-teal-500" />Pesanan masuk</span>
            </div>
            <div className="overflow-x-auto">
              <ul className="flex min-w-[560px] items-end gap-2" style={{ height: 180 }} aria-label={`Omzet dan pesanan masuk ${heading}`}>
                {data.buckets.map((b) => (
                  <li
                    key={b.key}
                    className="flex h-full min-w-0 flex-1 flex-col justify-end"
                    title={`${label(b.key)}: omzet ${rupiah(b.revenue)}, pesanan masuk ${rupiah(b.orders)}, ${b.invoiceCount} invoice`}
                  >
                    <div className="flex flex-1 items-end justify-center gap-1">
                      <div className="flex h-full w-1/2 max-w-5 flex-col justify-end">
                        {b.revenue > 0 && <span className="mb-0.5 text-center text-[10px] tabular-nums text-slate-600">{compact(b.revenue)}</span>}
                        <div className="w-full bg-slate-800" style={{ height: `${Math.max((b.revenue / max) * 82, b.revenue > 0 ? 2 : 0)}%` }} />
                      </div>
                      <div className="flex h-full w-1/2 max-w-5 flex-col justify-end">
                        <div className="w-full bg-teal-500" style={{ height: `${Math.max((b.orders / max) * 82, b.orders > 0 ? 2 : 0)}%` }} />
                      </div>
                    </div>
                    <span className="mt-1 text-center text-[11px] text-slate-500">{label(b.key)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {data.topCustomers.length > 0 && (
            <div className="mt-4 border-t border-slate-200 pt-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Omzet per customer ({heading})</p>
              <ul className="space-y-1.5">
                {data.topCustomers.map((c) => (
                  <li key={c.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate text-slate-800">{c.name}</p>
                      <div className="mt-0.5 h-1.5 bg-slate-100"><div className="h-1.5 bg-slate-700" style={{ width: `${Math.min(c.share, 100)}%` }} /></div>
                    </div>
                    <span className="tabular-nums text-slate-700">{rupiah(c.revenue)} <span className="text-xs text-slate-400">({c.share.toLocaleString("id-ID")}%)</span></span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
