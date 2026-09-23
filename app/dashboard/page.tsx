"use client";

import { useSession } from "next-auth/react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Plus, ShoppingCart, AlertTriangle, Truck, Wrench, RotateCw, ArrowUpRight, AlertCircle } from "lucide-react";

interface FollowUpRow {
  id: string;
  number: string;
  customer: string;
  companyId: string;
  status: string;
  dueDate: string | null;
  value?: number;
  daysLate?: number;
  href: string;
}

interface DashboardData {
  scope: { companies: { id: string; name: string }[]; selectedCompanyId: string | null; period: string; availableYears: number[] };
  summary: {
    activeOrders: { count: number; value: number };
    overdueReceivables: { count: number; value: number };
    pendingDeliveries: { count: number };
    activeWork: { count: number };
  };
  finance: { receivablesOutstanding: number; payablesOutstanding: number };
  hr: { pendingLeaves: number; pendingReimbursements: number };
  followUp: { sales: FollowUpRow[]; deliveries: FollowUpRow[]; payments: FollowUpRow[] };
  multiCompany: boolean;
}

const rupiah = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
const tanggal = (value: string | null) => (value ? new Date(value).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "-");

const PERIOD_PRESETS = [
  { value: "all", label: "Semua periode" },
  { value: "month", label: "Bulan ini" },
  { value: "30d", label: "30 hari terakhir" },
  { value: "7d", label: "7 hari terakhir" },
];
const YEAR_RE = /^\d{4}$/;

const TABS = [
  { key: "sales" as const, label: "Penjualan" },
  { key: "deliveries" as const, label: "Pengiriman" },
  { key: "payments" as const, label: "Pembayaran" },
];

export default function DashboardPage() {
  return (
    <DashboardLayout>
      <Suspense fallback={<div className="erp-session-loading" role="status">Memuat ruang kerja…</div>}>
        <DashboardOverview />
      </Suspense>
    </DashboardLayout>
  );
}

function DashboardOverview() {
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const companyParam = searchParams.get("company") ?? "all";
  const rawPeriodParam = searchParams.get("period") ?? "all";
  const periodParam = PERIOD_PRESETS.some((p) => p.value === rawPeriodParam) || YEAR_RE.test(rawPeriodParam) ? rawPeriodParam : "all";

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [tab, setTab] = useState<"sales" | "deliveries" | "payments">("sales");

  const setParam = useCallback(
    (key: "company" | "period", value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === "all") params.delete(key);
      else params.set(key, value);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [searchParams, pathname, router]
  );

  const loadSummary = useCallback(
    (signal?: AbortSignal) => {
      const params = new URLSearchParams();
      if (companyParam !== "all") params.set("companyId", companyParam);
      if (periodParam !== "all") params.set("period", periodParam);
      return fetch(`/api/reports/dashboard?${params.toString()}`, { signal })
        .then((response) => {
          if (!response.ok) throw new Error("Summary unavailable");
          return response.json() as Promise<DashboardData>;
        })
        .then((summary) => {
          if (!summary.summary || !summary.followUp) throw new Error("Invalid summary");
          setData(summary);
          setError(false);
          setUpdatedAt(new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }));
        })
        .catch((cause: unknown) => {
          if (cause instanceof Error && cause.name === "AbortError") return;
          setError(true);
          setData(null);
        })
        .finally(() => {
          if (!signal?.aborted) setLoading(false);
        });
    },
    [companyParam, periodParam]
  );

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/auth/login");
    if (status !== "authenticated") return;
    const controller = new AbortController();
    setLoading(true);
    void loadSummary(controller.signal);
    return () => controller.abort();
  }, [status, router, loadSummary]);

  const count = (value: number | undefined) => (value === undefined ? "" : value.toLocaleString("id-ID"));
  const amount = (value: number | undefined) => (loading || value === undefined ? "Belum tersedia" : rupiah(value));

  const showCompanyColumn = !!data?.multiCompany && companyParam === "all";
  const rows = data?.followUp[tab] ?? [];

  const periodLabel = useMemo(() => {
    const preset = PERIOD_PRESETS.find((p) => p.value === periodParam);
    if (preset) return preset.label;
    if (YEAR_RE.test(periodParam)) return `Tahun ${periodParam}`;
    return "Semua periode";
  }, [periodParam]);

  if (status !== "authenticated") return <div className="erp-session-loading" role="status">Memuat ruang kerja…</div>;

  return (
    <div className="overview">
      <div className="overview-heading">
        <div>
          <p className="overview-eyebrow">Pengadaan & fabrikasi container</p>
          <h1>Ringkasan bisnis<span>.</span></h1>
          <p>Pesanan, pengiriman, dan piutang yang perlu ditindaklanjuti hari ini.</p>
        </div>
        <Link href="/sales/quotations/new" className="erp-primary-action"><Plus size={18} />Buat penawaran</Link>
      </div>

      <div className="overview-filters">
        <span className="overview-filter-label">Perusahaan</span>
        {data && data.scope.companies.length > 1 ? (
          <select className="erp-select" value={companyParam} onChange={(e) => setParam("company", e.target.value)} aria-label="Pilih perusahaan">
            <option value="all">Semua perusahaan</option>
            {data.scope.companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        ) : (
          <span className="overview-company-static">{data?.scope.companies[0]?.name ?? "Memuat…"}</span>
        )}
        <span className="overview-filter-label" style={{ marginLeft: 10 }}>Periode</span>
        <select className="erp-select" value={periodParam} onChange={(e) => setParam("period", e.target.value)} aria-label="Pilih periode">
          <option value="all">Semua periode</option>
          {!!data?.scope.availableYears.length && (
            <optgroup label="Per tahun">
              {data.scope.availableYears.map((y) => (
                <option key={y} value={String(y)}>Tahun {y}</option>
              ))}
            </optgroup>
          )}
          <optgroup label="Rentang singkat">
            {PERIOD_PRESETS.filter((p) => p.value !== "all").map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </optgroup>
        </select>
      </div>

      <div className="overview-toolbar">
        <button onClick={() => { setLoading(true); setError(false); void loadSummary(); }} disabled={loading} aria-label="Perbarui ringkasan">
          <RotateCw size={14} className={loading ? "erp-spinning" : ""} />{loading ? "Memuat data…" : "Perbarui"}
        </button>
      </div>

      {error && (
        <div className="overview-error" role="alert">
          <AlertCircle size={18} />
          <div><strong>Ringkasan belum dapat dimuat.</strong><p>Coba perbarui data. Modul tetap dapat dibuka melalui menu.</p></div>
        </div>
      )}

      <section className="overview-metrics" aria-label="Ringkasan yang perlu ditindaklanjuti" aria-busy={loading}>
        {[
          { icon: ShoppingCart, label: "Pesanan aktif", value: data?.summary.activeOrders.count, detail: !loading && data ? amount(data.summary.activeOrders.value) : "Belum diproses", href: "/sales/orders" },
          { icon: AlertTriangle, label: "Piutang jatuh tempo", value: data?.summary.overdueReceivables.count, detail: !loading && data ? amount(data.summary.overdueReceivables.value) : "Belum diproses", href: "/finance/invoices" },
          { icon: Truck, label: "Pengiriman tertunda", value: data?.summary.pendingDeliveries.count, detail: "Lewat jadwal, belum selesai", href: "/sales/delivery" },
          { icon: Wrench, label: "Pekerjaan berjalan", value: data?.summary.activeWork.count, detail: "Proyek sedang berlangsung", href: "/operational/projects" },
        ].map((metric) => (
          <Link href={metric.href} className="overview-metric" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{error ? "N/A" : loading ? <Skeleton className="h-8 w-14 inline-block align-middle" /> : count(metric.value)}</strong>
            <small>{error ? "Data belum tersedia" : metric.detail}</small>
          </Link>
        ))}
      </section>

      <div className="overview-body">
        <section className="overview-documents">
          <div className="overview-section-heading">
            <div><h2>Perlu ditindaklanjuti</h2><p>Diurutkan dari yang paling mendesak.</p></div>
            <Link href="/reports" className="erp-text-link">Lihat laporan <ArrowUpRight size={15} /></Link>
          </div>

          <div className="followup-tabs" role="tablist" aria-label="Jenis dokumen">
            {TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                className="followup-tab"
                onClick={() => setTab(t.key)}
              >
                {t.label}
                <span className="followup-tab-count">{loading || !data ? "…" : data.followUp[t.key].length}</span>
              </button>
            ))}
          </div>
          <p className="followup-caption">
            {tab === "sales" ? `Pesanan aktif dalam ${periodLabel.toLowerCase()}.` : "Piutang dan pengiriman selalu menampilkan seluruh data yang belum selesai, tidak dibatasi periode."}
          </p>

          {loading ? (
            <div className="py-2"><Skeleton className="h-10 w-full mb-2" /><Skeleton className="h-10 w-full mb-2" /><Skeleton className="h-10 w-full mb-2" /></div>
          ) : rows.length === 0 ? (
            <p className="followup-empty">
              {tab === "sales" && "Tidak ada pesanan aktif yang menunggu pengiriman atau penagihan."}
              {tab === "deliveries" && "Tidak ada pengiriman yang tertunda dari jadwal."}
              {tab === "payments" && "Tidak ada piutang yang sudah jatuh tempo."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: "#E4E7EC" }}>
                    <th className="text-left font-medium py-2 pr-3" style={{ color: "#667085", fontSize: 12 }}>No. Dokumen</th>
                    <th className="text-left font-medium py-2 pr-3" style={{ color: "#667085", fontSize: 12 }}>Customer</th>
                    {showCompanyColumn && <th className="text-left font-medium py-2 pr-3" style={{ color: "#667085", fontSize: 12 }}>Perusahaan</th>}
                    <th className="text-left font-medium py-2 pr-3" style={{ color: "#667085", fontSize: 12 }}>Status</th>
                    <th className="text-left font-medium py-2 pr-3" style={{ color: "#667085", fontSize: 12 }}>Tenggat</th>
                    {tab !== "deliveries" && <th className="text-right font-medium py-2 pr-3" style={{ color: "#667085", fontSize: 12 }}>Nilai</th>}
                    <th className="text-right font-medium py-2" style={{ color: "#667085", fontSize: 12 }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b last:border-0" style={{ borderColor: "#F1F1ED" }}>
                      <td className="py-3 pr-3 font-mono" style={{ fontSize: 12.5 }}>{row.number}</td>
                      <td className="py-3 pr-3">{row.customer}</td>
                      {showCompanyColumn && <td className="py-3 pr-3">{data?.scope.companies.find((c) => c.id === row.companyId)?.name ?? "-"}</td>}
                      <td className="py-3 pr-3"><StatusBadge status={row.status} /></td>
                      <td className="py-3 pr-3">
                        <div>{tanggal(row.dueDate)}</div>
                        {!!row.daysLate && row.daysLate > 0 && <small style={{ color: "#c52630", fontSize: 11 }}>Terlambat {row.daysLate} hari</small>}
                      </td>
                      {tab !== "deliveries" && <td className="py-3 pr-3 text-right font-medium" style={{ fontVariantNumeric: "tabular-nums" }}>{row.value !== undefined ? rupiah(row.value) : "-"}</td>}
                      <td className="py-3 text-right"><Link href={row.href} className="erp-text-link" style={{ minHeight: "auto", justifyContent: "flex-end" }}>Lihat</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data && data.followUp[tab].length >= 8 && (
                <div className="pt-3">
                  <Link href={tab === "sales" ? "/sales/orders" : tab === "deliveries" ? "/sales/delivery" : "/finance/invoices"} className="erp-text-link">Lihat semua <ArrowUpRight size={15} /></Link>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="overview-finance">
          <div><p className="finance-eyebrow">Posisi keuangan</p><h2>Yang perlu diselesaikan</h2></div>
          <Link href="/finance/invoices" className="finance-amount finance-amount--attention">
            <span>Piutang pelanggan</span>
            <strong>{amount(data?.finance.receivablesOutstanding)}</strong>
            <small>Seluruh invoice yang belum lunas</small>
          </Link>
          <Link href="/supply-chain/bills" className="finance-amount">
            <span>Utang supplier</span>
            <strong>{amount(data?.finance.payablesOutstanding)}</strong>
            <small>Seluruh tagihan vendor yang belum lunas</small>
          </Link>
          <Link href="/finance" className="finance-link">Buka Finance <ArrowUpRight size={16} /></Link>
        </section>
      </div>

      <div className="overview-bottom">
        <p>{updatedAt && !error ? `Terakhir diperbarui pukul ${updatedAt}` : "Ringkasan dari dokumen ERP"}</p>
        <Link href="/hr">Pengajuan HR{data && !loading && !error ? ` · ${data.hr.pendingLeaves + data.hr.pendingReimbursements} menunggu` : ""}</Link>
      </div>
    </div>
  );
}
