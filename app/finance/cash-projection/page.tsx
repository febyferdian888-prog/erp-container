"use client";

import { useSession } from "next-auth/react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle } from "lucide-react";

interface Week {
  weekStart: string;
  weekEnd: string;
  receiptsBase: number;
  receiptsDelayed: number;
  payments: number;
  endingBalanceBase: number;
  endingBalanceDelayed: number;
  isShortfallBase: boolean;
  isShortfallDelayed: boolean;
}

interface ProjectionData {
  company: { id: string; name: string };
  companies: { id: string; name: string }[];
  asOf: string;
  openingBalance: { total: number; source: string };
  weeks: Week[];
  unscheduled: { poCommitmentNotBilled: number; poCount: number; poDraftNotCommitted?: number; poDraftCount?: number; note: string };
  notCovered: string[];
  unconfirmedOverdue?: { value: number; count: number; note: string };
  assumptions: { delayDays: number; receiptFallback: string; overdueHandling: string; pphHandling?: string };
}

const rupiah = (v: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v);
const tanggal = (v: string) => new Date(v).toLocaleDateString("id-ID", { day: "numeric", month: "short" });

export default function CashProjectionPage() {
  return (
    <DashboardLayout>
      <Suspense fallback={<div className="erp-session-loading" role="status">Memuat ruang kerja…</div>}>
        <CashProjectionContent />
      </Suspense>
    </DashboardLayout>
  );
}

function CashProjectionContent() {
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const companyParam = searchParams.get("company") ?? "";
  const [scenario, setScenario] = useState<"base" | "delayed">("base");

  const [data, setData] = useState<ProjectionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const setCompany = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set("company", value); else params.delete("company");
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [searchParams, pathname, router]
  );

  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (companyParam) p.set("companyId", companyParam);
    setLoading(true);
    return fetch(`/api/finance/cash-projection?${p.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: ProjectionData) => { setData(d); setError(false); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [companyParam]);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/auth/login");
    if (status === "authenticated") void load();
  }, [status, router, load]);

  if (status !== "authenticated") return <div className="erp-session-loading" role="status">Memuat ruang kerja…</div>;

  const shortfallWeek = data?.weeks.find((w) => (scenario === "base" ? w.isShortfallBase : w.isShortfallDelayed));

  return (
    <div className="overview">
      <div className="overview-heading">
        <div>
          <p className="overview-eyebrow">Keuangan</p>
          <h1>Proyeksi kas 13 minggu<span>.</span></h1>
          <p>Perkiraan saldo kas & bank ke depan, berdasarkan piutang dan utang yang sudah tercatat.</p>
        </div>
      </div>

      <div className="overview-filters">
        {data && data.companies.length > 1 && (
          <>
            <span className="overview-filter-label">Perusahaan</span>
            <select className="erp-select" value={companyParam || data.company.id} onChange={(e) => setCompany(e.target.value)}>
              {data.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </>
        )}
        <span className="overview-filter-label">Skenario</span>
        <select className="erp-select" value={scenario} onChange={(e) => setScenario(e.target.value as "base" | "delayed")}>
          <option value="base">Dasar (bayar tepat jatuh tempo)</option>
          <option value="delayed">Keterlambatan penerimaan ({data?.assumptions.delayDays ?? 14} hari)</option>
        </select>
      </div>

      {error && <div className="overview-error" role="alert"><div><strong>Data belum tersedia.</strong><p>Coba muat ulang halaman.</p></div></div>}

      {loading ? (
        <Skeleton className="h-40 w-full mb-6" />
      ) : data ? (
        <>
          <section className="overview-metrics" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
            <div className="overview-metric">
              <span>Saldo kas & bank saat ini</span>
              <strong>{rupiah(data.openingBalance.total)}</strong>
              <small>{data.openingBalance.source}</small>
            </div>
            <div className="overview-metric">
              <span>Saldo akhir minggu ke-13 ({scenario === "base" ? "dasar" : "keterlambatan"})</span>
              <strong style={{ color: (scenario === "base" ? data.weeks.at(-1)?.endingBalanceBase : data.weeks.at(-1)?.endingBalanceDelayed)! < 0 ? "#c52630" : undefined }}>
                {rupiah((scenario === "base" ? data.weeks.at(-1)?.endingBalanceBase : data.weeks.at(-1)?.endingBalanceDelayed) ?? 0)}
              </strong>
              <small>Kumulatif penerimaan dikurangi pembayaran</small>
            </div>
            <div className="overview-metric">
              <span>Minggu berpotensi kekurangan kas</span>
              <strong style={{ color: shortfallWeek ? "#c52630" : undefined }}>{shortfallWeek ? tanggal(shortfallWeek.weekStart) : "Tidak ada"}</strong>
              <small>{shortfallWeek ? "Saldo diperkirakan negatif" : "Dalam 13 minggu ke depan"}</small>
            </div>
          </section>

          {shortfallWeek && (
            <div className="overview-error" role="alert">
              <AlertTriangle size={18} />
              <div><strong>Peringatan kekurangan kas.</strong><p>Minggu {tanggal(shortfallWeek.weekStart)} diperkirakan saldo kas negatif pada skenario {scenario === "base" ? "dasar" : "keterlambatan penerimaan"}.</p></div>
            </div>
          )}

          {!!data.unconfirmedOverdue?.count && (
            <div className="overview-error" role="alert" style={{ background: "var(--status-warning-bg)", color: "var(--status-warning-fg)" }}>
              <AlertTriangle size={18} />
              <div>
                <strong>{data.unconfirmedOverdue.count} piutang lewat jatuh tempo belum ada janji bayar.</strong>
                <p>Senilai {rupiah(data.unconfirmedOverdue.value)} sudah dihitung masuk minggu berjalan di tabel di bawah, tapi ini asumsi paling lemah — belum ada kepastian kapan (atau apakah) benar-benar cair.</p>
              </div>
            </div>
          )}

          <section className="overview-documents">
            <div className="overview-section-heading">
              <div><h2>Rincian per minggu</h2><p>Per {new Date(data.asOf).toLocaleDateString("id-ID")}, untuk {data.company.name}.</p></div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: "#E4E7EC" }}>
                    <th className="text-left font-medium py-2 pr-3" style={{ color: "#667085", fontSize: 12 }}>Minggu</th>
                    <th className="text-right font-medium py-2 pr-3" style={{ color: "#667085", fontSize: 12 }}>Penerimaan</th>
                    <th className="text-right font-medium py-2 pr-3" style={{ color: "#667085", fontSize: 12 }}>Pembayaran</th>
                    <th className="text-right font-medium py-2" style={{ color: "#667085", fontSize: 12 }}>Saldo akhir</th>
                  </tr>
                </thead>
                <tbody>
                  {data.weeks.map((w, i) => {
                    const receipts = scenario === "base" ? w.receiptsBase : w.receiptsDelayed;
                    const ending = scenario === "base" ? w.endingBalanceBase : w.endingBalanceDelayed;
                    const shortfall = scenario === "base" ? w.isShortfallBase : w.isShortfallDelayed;
                    return (
                      <tr key={i} className="border-b last:border-0" style={{ borderColor: "#F1F1ED", background: shortfall ? "var(--status-danger-bg)" : undefined }}>
                        <td className="py-2.5 pr-3">{tanggal(w.weekStart)} – {tanggal(w.weekEnd)}</td>
                        <td className="py-2.5 pr-3 text-right" style={{ fontVariantNumeric: "tabular-nums", color: "var(--status-success-fg)" }}>+{rupiah(receipts)}</td>
                        <td className="py-2.5 pr-3 text-right" style={{ fontVariantNumeric: "tabular-nums", color: "var(--status-danger-fg)" }}>-{rupiah(w.payments)}</td>
                        <td className="py-2.5 text-right font-semibold" style={{ fontVariantNumeric: "tabular-nums", color: shortfall ? "var(--status-danger-fg)" : undefined }}>{rupiah(ending)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <div className="overview-documents mt-6">
            <div className="overview-section-heading"><div><h2>Cakupan & asumsi</h2></div></div>
            <ul className="text-xs text-[var(--neutral-600)] space-y-1.5 list-disc pl-4">
              <li>{data.assumptions.receiptFallback}</li>
              <li>{data.assumptions.overdueHandling}</li>
              {data.assumptions.pphHandling && <li>{data.assumptions.pphHandling}</li>}
              <li>Komitmen PO belum ditagih vendor (sudah dikirim/dikonfirmasi vendor): {rupiah(data.unscheduled.poCommitmentNotBilled)} dari {data.unscheduled.poCount} PO — {data.unscheduled.note}</li>
              {!!data.unscheduled.poDraftCount && (
                <li style={{ color: "var(--status-warning-fg)" }}>
                  Tidak termasuk {data.unscheduled.poDraftCount} PO masih Draft senilai {rupiah(data.unscheduled.poDraftNotCommitted || 0)} — belum jadi komitmen nyata ke vendor, tidak dihitung sebagai kewajiban.
                </li>
              )}
              {data.notCovered.map((n, i) => <li key={i} style={{ color: "var(--status-warning-fg)" }}>{n}</li>)}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}
