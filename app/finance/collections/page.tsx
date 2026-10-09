"use client";

import { useSession } from "next-auth/react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Fragment, Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/lib/toast";
import { AGING_BUCKET_LABEL, PAYMENT_STATE_LABEL, type AgingBucket, type PaymentState } from "@/lib/invoice-money";
import { ChevronDown, ChevronUp, Paperclip, ExternalLink } from "lucide-react";

interface Row {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  companyId: string;
  companyName: string;
  customerId: string;
  customerName: string;
  grandTotal: number;
  balanceDue: number;
  paymentState: PaymentState;
  isOverdue: boolean;
  daysOverdue: number;
  aging: AgingBucket;
  collectionsPic: string | null;
  lastFollowUpAt: string | null;
  lastFollowUpNote: string | null;
  nextFollowUpAt: string | null;
  promise: { date: string | null; amount: number | null; note: string } | null;
  followUpCount: number;
  attachmentCount: number;
  href: string;
}

interface CollectionsData {
  rows: Row[];
  summary: {
    totalOutstanding: number;
    totalCount: number;
    aging: { bucket: AgingBucket; count: number; value: number }[];
    draftPendingBilling?: { count: number; value: number; invoiceNumbers: string[] };
  };
  filters: { companies: { id: string; name: string }[]; customers: { id: string; name: string }[]; pics: string[] };
}

interface FollowUp {
  id: string;
  type: "follow_up" | "payment_promise" | "obstacle";
  note: string;
  promiseDate: string | null;
  promiseAmount: number | null;
  nextFollowUpAt: string | null;
  createdBy: string | null;
  createdAt: string;
}

const rupiah = (v: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v);
const tanggal = (v: string | null) => (v ? new Date(v).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "-");
const AGING_ORDER: AgingBucket[] = ["not_due", "1-30", "31-60", "61-90", "90+"];
const NOTE_TYPE_LABEL = { follow_up: "Follow-up", payment_promise: "Janji bayar", obstacle: "Kendala" };

export default function CollectionsPage() {
  return (
    <DashboardLayout>
      <Suspense fallback={<div className="erp-session-loading" role="status">Memuat ruang kerja…</div>}>
        <CollectionsContent />
      </Suspense>
    </DashboardLayout>
  );
}

function CollectionsContent() {
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const companyParam = searchParams.get("company") ?? "all";
  const customerParam = searchParams.get("customer") ?? "all";
  const stateParam = searchParams.get("state") ?? "all";
  const picParam = searchParams.get("pic") ?? "all";
  const agingParam = searchParams.get("aging") ?? "all";

  const [data, setData] = useState<CollectionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, { collectionsPic: string | null; followUps: FollowUp[] }>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [noteType, setNoteType] = useState<"follow_up" | "payment_promise" | "obstacle">("follow_up");
  const [noteText, setNoteText] = useState("");
  const [promiseDate, setPromiseDate] = useState("");
  const [promiseAmount, setPromiseAmount] = useState("");
  const [nextFollowUpAt, setNextFollowUpAt] = useState("");
  const [picDraft, setPicDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === "all") params.delete(key);
      else params.set(key, value);
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [searchParams, pathname, router]
  );

  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (companyParam !== "all") p.set("companyId", companyParam);
    if (customerParam !== "all") p.set("customerId", customerParam);
    if (stateParam !== "all") p.set("state", stateParam);
    if (picParam !== "all") p.set("pic", picParam);
    setLoading(true);
    return fetch(`/api/finance/collections?${p.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: CollectionsData) => { setData(d); setError(false); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [companyParam, customerParam, stateParam, picParam]);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/auth/login");
    if (status === "authenticated") void load();
  }, [status, router, load]);

  const loadDetail = (id: string) => {
    setDetailLoading(id);
    fetch(`/api/finance/collections/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setDetail((prev) => ({ ...prev, [id]: d })))
      .catch(() => toast.error("Gagal memuat riwayat tindak lanjut"))
      .finally(() => setDetailLoading(null));
  };

  const toggleExpand = (row: Row) => {
    if (expanded === row.id) { setExpanded(null); return; }
    setExpanded(row.id);
    setNoteType("follow_up");
    setNoteText("");
    setPromiseDate("");
    setPromiseAmount("");
    setNextFollowUpAt("");
    setPicDraft(row.collectionsPic ?? "");
    if (!detail[row.id]) loadDetail(row.id);
  };

  const savePic = async (id: string) => {
    try {
      const res = await fetch(`/api/finance/collections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionsPic: picDraft.trim() || null }),
      });
      if (!res.ok) throw new Error();
      toast.success("PIC penagihan disimpan.");
      loadDetail(id);
      void load();
    } catch {
      toast.error("Gagal menyimpan PIC");
    }
  };

  const submitNote = async (id: string) => {
    if (!noteText.trim()) { toast.error("Catatan tidak boleh kosong"); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/finance/collections/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: noteType,
          note: noteText.trim(),
          promiseDate: noteType === "payment_promise" && promiseDate ? promiseDate : undefined,
          promiseAmount: noteType === "payment_promise" && promiseAmount ? Number(promiseAmount) : undefined,
          nextFollowUpAt: nextFollowUpAt || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Catatan tersimpan.");
      setNoteText(""); setPromiseDate(""); setPromiseAmount(""); setNextFollowUpAt("");
      loadDetail(id);
      void load();
    } catch {
      toast.error("Gagal menyimpan catatan");
    } finally {
      setSubmitting(false);
    }
  };

  if (status !== "authenticated") return <div className="erp-session-loading" role="status">Memuat ruang kerja…</div>;

  const rows = (data?.rows ?? []).filter((r) => agingParam === "all" || r.aging === agingParam);

  return (
    <div className="overview">
      <div className="overview-heading">
        <div>
          <p className="overview-eyebrow">Keuangan</p>
          <h1>Meja kerja penagihan<span>.</span></h1>
          <p>Piutang yang belum lunas, diurutkan dari yang paling terlambat.</p>
        </div>
      </div>

      {!!data?.summary.draftPendingBilling?.count && (
        <p className="overview-note" style={{ color: "var(--status-warning-fg)" }}>
          {data.summary.draftPendingBilling.count} invoice masih Draft ({data.summary.draftPendingBilling.invoiceNumbers.join(", ")}) senilai{" "}
          {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(data.summary.draftPendingBilling.value)}{" "}
          belum dihitung di sini — belum resmi ditagihkan, jadi belum jadi piutang.
        </p>
      )}

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
        <span className="overview-filter-label">Customer</span>
        <select className="erp-select" value={customerParam} onChange={(e) => setParam("customer", e.target.value)}>
          <option value="all">Semua customer</option>
          {data?.filters.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span className="overview-filter-label">Status</span>
        <select className="erp-select" value={stateParam} onChange={(e) => setParam("state", e.target.value)}>
          <option value="all">Semua status</option>
          <option value="unpaid">Belum dibayar</option>
          <option value="partial">Dibayar sebagian</option>
          <option value="overdue">Lewat jatuh tempo</option>
        </select>
        {!!data?.filters.pics.length && (
          <>
            <span className="overview-filter-label">PIC</span>
            <select className="erp-select" value={picParam} onChange={(e) => setParam("pic", e.target.value)}>
              <option value="all">Semua PIC</option>
              {data.filters.pics.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </>
        )}
      </div>

      {error && <div className="overview-error" role="alert"><div><strong>Data belum tersedia.</strong><p>Coba muat ulang halaman.</p></div></div>}

      <section className="overview-metrics" style={{ gridTemplateColumns: "repeat(5, minmax(0,1fr))" }} aria-busy={loading}>
        {AGING_ORDER.map((bucket) => {
          const b = data?.summary.aging.find((a) => a.bucket === bucket);
          const active = agingParam === bucket;
          return (
            <button
              key={bucket}
              onClick={() => setParam("aging", active ? "all" : bucket)}
              className="overview-metric"
              style={{ textAlign: "left", background: active ? "var(--primary-tint)" : undefined, cursor: "pointer" }}
            >
              <span>{AGING_BUCKET_LABEL[bucket]}</span>
              <strong>{loading ? <Skeleton className="h-7 w-16 inline-block align-middle" /> : rupiah(b?.value ?? 0)}</strong>
              <small>{b?.count ?? 0} invoice</small>
            </button>
          );
        })}
      </section>

      <section className="overview-documents">
        <div className="overview-section-heading">
          <div><h2>{loading ? "Memuat…" : `${rows.length} invoice belum lunas`}</h2><p>Total tunggakan: {loading ? "…" : rupiah(rows.reduce((s, r) => s + r.balanceDue, 0))}</p></div>
        </div>

        {loading ? (
          <div className="py-2"><Skeleton className="h-10 w-full mb-2" /><Skeleton className="h-10 w-full mb-2" /><Skeleton className="h-10 w-full mb-2" /></div>
        ) : rows.length === 0 ? (
          <p className="followup-empty">Tidak ada piutang yang cocok dengan filter ini.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: "#E4E7EC" }}>
                  <th className="text-left font-medium py-2 pr-3" style={{ color: "#667085", fontSize: 12 }}>Invoice</th>
                  <th className="text-left font-medium py-2 pr-3" style={{ color: "#667085", fontSize: 12 }}>Customer</th>
                  <th className="text-left font-medium py-2 pr-3" style={{ color: "#667085", fontSize: 12 }}>Jatuh tempo</th>
                  <th className="text-left font-medium py-2 pr-3" style={{ color: "#667085", fontSize: 12 }}>Aging</th>
                  <th className="text-right font-medium py-2 pr-3" style={{ color: "#667085", fontSize: 12 }}>Sisa tagihan</th>
                  <th className="text-left font-medium py-2 pr-3" style={{ color: "#667085", fontSize: 12 }}>PIC</th>
                  <th className="text-left font-medium py-2 pr-3" style={{ color: "#667085", fontSize: 12 }}>Follow-up berikutnya</th>
                  <th className="text-right font-medium py-2" style={{ color: "#667085", fontSize: 12 }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <Fragment key={row.id}>
                    <tr className="border-b cursor-pointer hover:bg-[var(--neutral-50)]" style={{ borderColor: "#F1F1ED" }} onClick={() => toggleExpand(row)}>
                      <td className="py-3 pr-3 font-mono" style={{ fontSize: 12.5 }}>{row.invoiceNumber}{row.attachmentCount > 0 && <Paperclip size={11} className="inline ml-1 text-[var(--neutral-400)]" />}</td>
                      <td className="py-3 pr-3">{row.customerName}</td>
                      <td className="py-3 pr-3">{tanggal(row.dueDate)}</td>
                      <td className="py-3 pr-3">
                        <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-semibold uppercase" style={{ background: row.aging === "90+" || row.aging === "61-90" ? "var(--status-danger-bg)" : row.aging === "31-60" || row.aging === "1-30" ? "var(--status-warning-bg)" : "var(--status-neutral-bg)", color: row.aging === "90+" || row.aging === "61-90" ? "var(--status-danger-fg)" : row.aging === "31-60" || row.aging === "1-30" ? "var(--status-warning-fg)" : "var(--status-neutral-fg)" }}>
                          {AGING_BUCKET_LABEL[row.aging]}
                        </span>
                      </td>
                      <td className="py-3 pr-3 text-right font-medium" style={{ fontVariantNumeric: "tabular-nums" }}>{rupiah(row.balanceDue)}</td>
                      <td className="py-3 pr-3">{row.collectionsPic || <span className="text-[var(--neutral-400)]">Belum ditugaskan</span>}</td>
                      <td className="py-3 pr-3">{row.nextFollowUpAt ? tanggal(row.nextFollowUpAt) : <span className="text-[var(--neutral-400)]">-</span>}</td>
                      <td className="py-3 text-right">{expanded === row.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</td>
                    </tr>
                    {expanded === row.id && (
                      <tr>
                        <td colSpan={8} style={{ background: "var(--neutral-50)" }} className="p-4">
                          {detailLoading === row.id || !detail[row.id] ? (
                            <Skeleton className="h-20 w-full" />
                          ) : (
                            <div className="grid md:grid-cols-2 gap-6">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--neutral-500)] mb-2">PIC penagihan</p>
                                <div className="flex gap-2 mb-4">
                                  <input list="pic-options" className="erp-select flex-1" value={picDraft} onChange={(e) => setPicDraft(e.target.value)} placeholder="Nama atau email PIC" />
                                  <button className="erp-primary-action" style={{ minHeight: 36, padding: "0 14px" }} onClick={() => savePic(row.id)}>Simpan</button>
                                </div>
                                <datalist id="pic-options">
                                  {data?.filters.pics.map((p) => <option key={p} value={p} />)}
                                </datalist>

                                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--neutral-500)] mb-2">Tambah catatan</p>
                                <div className="flex gap-2 mb-2 text-xs">
                                  {(["follow_up", "payment_promise", "obstacle"] as const).map((t) => (
                                    <button key={t} onClick={() => setNoteType(t)} className="px-2 py-1 rounded" style={{ background: noteType === t ? "var(--primary)" : "var(--neutral-100)", color: noteType === t ? "#fff" : "var(--neutral-700)" }}>
                                      {NOTE_TYPE_LABEL[t]}
                                    </button>
                                  ))}
                                </div>
                                <textarea className="w-full border rounded p-2 text-sm mb-2" style={{ borderColor: "#E4E7EC" }} rows={2} placeholder="Catatan..." value={noteText} onChange={(e) => setNoteText(e.target.value)} />
                                {noteType === "payment_promise" && (
                                  <div className="flex gap-2 mb-2">
                                    <input type="date" className="erp-select flex-1" value={promiseDate} onChange={(e) => setPromiseDate(e.target.value)} />
                                    <input type="number" className="erp-select flex-1" placeholder="Nominal janji bayar" value={promiseAmount} onChange={(e) => setPromiseAmount(e.target.value)} />
                                  </div>
                                )}
                                <div className="flex items-center gap-2 mb-2">
                                  <label className="text-xs text-[var(--neutral-500)]">Follow-up berikutnya:</label>
                                  <input type="date" className="erp-select" value={nextFollowUpAt} onChange={(e) => setNextFollowUpAt(e.target.value)} />
                                </div>
                                <div className="flex gap-2 items-center">
                                  <button className="erp-primary-action" style={{ minHeight: 36, padding: "0 14px" }} disabled={submitting} onClick={() => submitNote(row.id)}>Simpan catatan</button>
                                  <Link href={row.href} className="erp-text-link">Buka invoice <ExternalLink size={13} /></Link>
                                </div>
                              </div>
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--neutral-500)] mb-2">Riwayat tindak lanjut</p>
                                {detail[row.id].followUps.length === 0 ? (
                                  <p className="text-sm text-[var(--neutral-500)]">Belum ada catatan.</p>
                                ) : (
                                  <div className="space-y-2 max-h-64 overflow-y-auto">
                                    {detail[row.id].followUps.map((f) => (
                                      <div key={f.id} className="border rounded p-2 text-xs" style={{ borderColor: "#E4E7EC" }}>
                                        <div className="flex justify-between text-[var(--neutral-500)]">
                                          <span className="font-semibold">{NOTE_TYPE_LABEL[f.type]}</span>
                                          <span>{tanggal(f.createdAt)} · {f.createdBy}</span>
                                        </div>
                                        <p className="mt-1">{f.note}</p>
                                        {f.type === "payment_promise" && (
                                          <p className="mt-1 text-[var(--primary)]">Janji: {f.promiseDate ? tanggal(f.promiseDate) : "-"}{f.promiseAmount ? ` · ${rupiah(f.promiseAmount)}` : ""}</p>
                                        )}
                                        {f.nextFollowUpAt && <p className="mt-1">Follow-up berikutnya: {tanggal(f.nextFollowUpAt)}</p>}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="text-[11px] text-[var(--neutral-500)] mt-4">
        Catatan cakupan: potongan PPh sudah diperhitungkan dalam sisa tagihan. Credit note dan retensi belum jadi konsep tersendiri di sistem ini — penyesuaian saat ini dilakukan lewat edit invoice. Pengingat di halaman ini bersifat internal saja; tidak ada WhatsApp/email otomatis ke customer.
      </p>
    </div>
  );
}
