"use client";

import { useSession } from "next-auth/react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/lib/toast";
import { ExternalLink } from "lucide-react";

interface Row {
  kind: "rfq" | "quotation";
  id: string;
  number: string;
  stage: string;
  companyId: string;
  customerName: string;
  value: number | null;
  probability: number | null;
  weightedValue: number | null;
  salesPic: string | null;
  targetCloseDate: string | null;
  nextFollowUpAt: string | null;
  href: string;
  actionHref: string;
  actionLabel: string;
}

interface PipelineData {
  rows: Row[];
  summary: { totalValue: number; totalWeightedValue: number; openCount: number };
  filters: { pics: string[]; companies: { id: string; name: string }[] };
  recentClosed: { id: string; number: string; status: string; updatedAt: string; winLossReason: string | null; customerName: string; value: number; href: string }[];
}

const rupiah = (v: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v);
const tanggal = (v: string | null) => (v ? new Date(v).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "-");
const CLOSED_LABEL: Record<string, string> = { accepted: "Menang", rejected: "Kalah", expired: "Kedaluwarsa", cancelled: "Dibatalkan" };

export default function PipelinePage() {
  return (
    <DashboardLayout>
      <Suspense fallback={<div className="erp-session-loading" role="status">Memuat ruang kerja…</div>}>
        <PipelineContent />
      </Suspense>
    </DashboardLayout>
  );
}

function PipelineContent() {
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const companyParam = searchParams.get("company") ?? "all";
  const picParam = searchParams.get("pic") ?? "all";

  const [data, setData] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [probDraft, setProbDraft] = useState("");
  const [targetDraft, setTargetDraft] = useState("");
  const [followUpDraft, setFollowUpDraft] = useState("");
  const [picDraft, setPicDraft] = useState("");

  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === "all") params.delete(key); else params.set(key, value);
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [searchParams, pathname, router]
  );

  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (companyParam !== "all") p.set("companyId", companyParam);
    if (picParam !== "all") p.set("pic", picParam);
    setLoading(true);
    return fetch(`/api/sales/pipeline?${p.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: PipelineData) => { setData(d); setError(false); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [companyParam, picParam]);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/auth/login");
    if (status === "authenticated") void load();
  }, [status, router, load]);

  if (status !== "authenticated") return <div className="erp-session-loading" role="status">Memuat ruang kerja…</div>;

  const startEdit = (row: Row) => {
    setEditing(row.id);
    setProbDraft(row.probability !== null ? String(row.probability) : "");
    setTargetDraft(row.targetCloseDate ? row.targetCloseDate.slice(0, 10) : "");
    setFollowUpDraft(row.nextFollowUpAt ? row.nextFollowUpAt.slice(0, 10) : "");
    setPicDraft(row.salesPic ?? "");
  };

  const saveEdit = async (row: Row) => {
    try {
      const res = await fetch(`/api/sales/pipeline/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          probability: probDraft === "" ? null : Number(probDraft),
          targetCloseDate: targetDraft || null,
          nextFollowUpAt: followUpDraft || null,
          salesPic: picDraft || null,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Pipeline diperbarui.");
      setEditing(null);
      void load();
    } catch {
      toast.error("Gagal menyimpan");
    }
  };

  return (
    <div className="overview">
      <div className="overview-heading">
        <div>
          <p className="overview-eyebrow">Penjualan</p>
          <h1>Pipeline penjualan<span>.</span></h1>
          <p>Peluang yang masih terbuka — belum menang, belum kalah. Sudah jadi sales order tidak lagi dihitung di sini.</p>
        </div>
      </div>

      <div className="overview-filters">
        {data && data.filters.companies.length > 1 && (
          <>
            <span className="overview-filter-label">Perusahaan</span>
            <select className="erp-select" value={companyParam} onChange={(e) => setParam("company", e.target.value)}>
              <option value="all">Semua perusahaan</option>
              {data.filters.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </>
        )}
        {!!data?.filters.pics.length && (
          <>
            <span className="overview-filter-label">PIC sales</span>
            <select className="erp-select" value={picParam} onChange={(e) => setParam("pic", e.target.value)}>
              <option value="all">Semua PIC</option>
              {data.filters.pics.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </>
        )}
      </div>

      {error && <div className="overview-error" role="alert"><div><strong>Data belum tersedia.</strong><p>Coba muat ulang halaman.</p></div></div>}

      <section className="overview-metrics" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }} aria-busy={loading}>
        <div className="overview-metric"><span>Peluang terbuka</span><strong>{loading ? <Skeleton className="h-7 w-10 inline-block" /> : data?.summary.openCount ?? 0}</strong><small>RFQ + penawaran belum diputuskan</small></div>
        <div className="overview-metric"><span>Nilai total pipeline</span><strong>{loading ? <Skeleton className="h-7 w-24 inline-block" /> : rupiah(data?.summary.totalValue ?? 0)}</strong><small>Belum tertimbang probabilitas</small></div>
        <div className="overview-metric"><span>Nilai tertimbang</span><strong>{loading ? <Skeleton className="h-7 w-24 inline-block" /> : rupiah(data?.summary.totalWeightedValue ?? 0)}</strong><small>Nilai × probabilitas — perkiraan realistis</small></div>
      </section>

      <section className="overview-documents">
        <div className="overview-section-heading"><div><h2>Peluang terbuka</h2><p>Diurutkan dari target closing terdekat.</p></div></div>
        {loading ? (
          <div className="py-2"><Skeleton className="h-10 w-full mb-2" /><Skeleton className="h-10 w-full mb-2" /></div>
        ) : !data || data.rows.length === 0 ? (
          <p className="followup-empty">Tidak ada peluang terbuka saat ini.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: "#E4E7EC" }}>
                  <th className="text-left font-medium py-2 pr-3" style={{ color: "#667085", fontSize: 12 }}>No.</th>
                  <th className="text-left font-medium py-2 pr-3" style={{ color: "#667085", fontSize: 12 }}>Customer</th>
                  <th className="text-left font-medium py-2 pr-3" style={{ color: "#667085", fontSize: 12 }}>Tahap</th>
                  <th className="text-right font-medium py-2 pr-3" style={{ color: "#667085", fontSize: 12 }}>Nilai</th>
                  <th className="text-right font-medium py-2 pr-3" style={{ color: "#667085", fontSize: 12 }}>Probabilitas</th>
                  <th className="text-left font-medium py-2 pr-3" style={{ color: "#667085", fontSize: 12 }}>PIC</th>
                  <th className="text-left font-medium py-2 pr-3" style={{ color: "#667085", fontSize: 12 }}>Target closing</th>
                  <th className="text-right font-medium py-2" style={{ color: "#667085", fontSize: 12 }}></th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id} className="border-b last:border-0" style={{ borderColor: "#F1F1ED" }}>
                    <td className="py-2.5 pr-3 font-mono" style={{ fontSize: 12.5 }}><Link href={row.href} className="erp-text-link">{row.number}</Link></td>
                    <td className="py-2.5 pr-3">{row.customerName}</td>
                    <td className="py-2.5 pr-3">{row.stage}</td>
                    <td className="py-2.5 pr-3 text-right">{row.value !== null ? rupiah(row.value) : <span className="text-[var(--neutral-400)]">-</span>}</td>
                    <td className="py-2.5 pr-3 text-right">
                      {row.kind === "rfq" ? <span className="text-[var(--neutral-400)]">-</span> : editing === row.id ? (
                        <input type="number" min={0} max={100} className="erp-select" style={{ width: 70 }} value={probDraft} onChange={(e) => setProbDraft(e.target.value)} />
                      ) : `${row.probability ?? 0}%`}
                    </td>
                    <td className="py-2.5 pr-3">
                      {row.kind === "rfq" ? (row.salesPic || "-") : editing === row.id ? (
                        <input className="erp-select" style={{ width: 120 }} value={picDraft} onChange={(e) => setPicDraft(e.target.value)} placeholder="PIC" />
                      ) : (row.salesPic || <span className="text-[var(--neutral-400)]">Belum ditugaskan</span>)}
                    </td>
                    <td className="py-2.5 pr-3">
                      {row.kind === "rfq" ? tanggal(row.targetCloseDate) : editing === row.id ? (
                        <input type="date" className="erp-select" value={targetDraft} onChange={(e) => setTargetDraft(e.target.value)} />
                      ) : tanggal(row.targetCloseDate)}
                    </td>
                    <td className="py-2.5 text-right whitespace-nowrap">
                      {row.kind === "quotation" && (editing === row.id ? (
                        <>
                          <button className="erp-text-link" style={{ minHeight: "auto" }} onClick={() => saveEdit(row)}>Simpan</button>{" "}
                          <button className="erp-text-link" style={{ minHeight: "auto" }} onClick={() => setEditing(null)}>Batal</button>
                        </>
                      ) : (
                        <button className="erp-text-link" style={{ minHeight: "auto" }} onClick={() => startEdit(row)}>Edit</button>
                      ))}{" "}
                      <Link href={row.actionHref} className="erp-text-link" style={{ minHeight: "auto" }}>{row.actionLabel} <ExternalLink size={12} /></Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {!!data?.recentClosed.length && (
        <section className="overview-documents mt-6">
          <div className="overview-section-heading"><div><h2>Menang/kalah 90 hari terakhir</h2><p>Konteks saja — tidak dihitung ke total pipeline di atas.</p></div></div>
          <div className="space-y-1.5">
            {data.recentClosed.map((q) => (
              <div key={q.id} className="flex items-center justify-between text-sm border-b py-1.5 last:border-0" style={{ borderColor: "#F1F1ED" }}>
                <Link href={q.href} className="erp-text-link">{q.number}</Link>
                <span>{q.customerName}</span>
                <span style={{ color: q.status === "accepted" ? "var(--status-success-fg)" : "var(--status-danger-fg)" }}>{CLOSED_LABEL[q.status] ?? q.status}</span>
                <span>{rupiah(q.value)}</span>
                <span className="text-[var(--neutral-500)]">{q.winLossReason || "-"}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
