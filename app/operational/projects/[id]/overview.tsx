"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Attachments } from "@/components/attachments";
import { toast } from "@/lib/toast";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { AlertTriangle, ExternalLink } from "lucide-react";

const rupiah = (v: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v);
const tanggal = (v: string | null) => (v ? new Date(v).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "-");

const EXECUTION_LABEL: Record<string, string> = { supplier: "Fabrikasi oleh supplier", internal_workshop: "Fabrikasi workshop sendiri", combination: "Campuran (supplier + workshop)" };

interface Overview {
  id: string; projectNumber: string; projectName: string; executionMethod: string; status: string;
  startDate: string; targetEndDate: string; actualEndDate: string | null;
  company: { name: string }; customer: { id: string; name: string } | null;
  responsible: { name: string | null; email: string | null } | null;
  estimatedCostToComplete: number | null; estimatedCostNote: string | null; estimatedCostUpdatedAt: string | null; estimatedCostUpdatedBy: string | null;
  financials: {
    contractValue: number | null; baseContractValue: number | null; budget: number; baseBudget: number;
    changeOrderValueTotal: number; changeOrderBudgetTotal: number; actualCost: number; committedCost: number;
    estimatedCostToComplete: number | null; estimatedFinalCost: number | null; estimatedMargin: number | null; estimatedMarginPercent: number | null;
    budgetDeviation: number; hasCostData: boolean; isFinal: boolean; invoicedRevenue: number; cashIn: number; cashOut: number; netCashFlow: number;
  };
  salesOrder: { id: string; soNumber: string; poNumber: string; status: string; deliveries: { id: string; deliveryNumber: string; status: string; deliveryDate: string }[]; invoices: { id: string; invoiceNumber: string; status: string; dueDate: string | null; grandTotal: number; paidAmount: number; pphAmount: number }[] } | null;
  quotation: { id: string; number: string } | null;
  stages: { id: string; stageNumber: number; stageName: string; status: string; progressWeight: number }[];
  workOrders: { id: string; orderNumber: string; title: string | null; status: string; targetEndDate: string | null }[];
  boms: { id: string; bomNumber: string; version: number; title: string; status: string; items: { id: string; quantity: string; unitPrice: string; product: { name: string; sku: string }; unit: { name: string } }[] }[];
  purchaseRequests: { id: string; requestNumber: string; status: string; requestDate: string }[];
  purchaseOrders: { id: string; poNumber: string; status: string; poDate: string; supplierName: string; subtotal: number; bills: { id: string; billNumber: string; status: string; balanceDue: number; paymentState: string }[] }[];
  timesheets: { totalHours: number; recent: { hoursWorked: string; workDate: string; employee: { name: string } }[] };
  reimbursements: { id: string; amount: number; status: string; category: string | null; submissionDate: string; employee: { name: string } }[];
  changeOrders: { id: string; changeNumber: string; title: string; description: string | null; valueImpact: number; budgetImpact: number; status: string; requestedBy: string | null }[];
  qualityChecks: { id: string; checkNumber: string; title: string; result: string; inspectedBy: string | null; inspectedAt: string | null; notes: string | null; stageId: string | null }[];
  handoverDocuments: { id: string; documentNumber: string; handoverDate: string; scope: string | null; customerSignee: string | null; companySignee: string | null; status: string }[];
  attachmentCount: number;
}

const QC_RESULT_LABEL: Record<string, string> = { pending: "Menunggu", passed: "Lulus", failed: "Gagal", rework: "Perlu perbaikan" };
const CO_STATUS_LABEL: Record<string, string> = { pending: "Menunggu persetujuan", approved: "Disetujui", rejected: "Ditolak" };

export function ProjectOverview({ projectId }: { projectId: string }) {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [etcDraft, setEtcDraft] = useState("");
  const [etcNote, setEtcNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [coForm, setCoForm] = useState({ title: "", valueImpact: "", budgetImpact: "" });
  const [qcForm, setQcForm] = useState({ title: "" });
  const [bastForm, setBastForm] = useState({ handoverDate: "", scope: "", customerSignee: "" });
  const [showCoForm, setShowCoForm] = useState(false);
  const [showQcForm, setShowQcForm] = useState(false);
  const [showBastForm, setShowBastForm] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    return fetch(`/api/projects/${projectId}/overview`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Overview) => {
        setData(d);
        setError(false);
        setEtcDraft(d.estimatedCostToComplete !== null ? String(d.estimatedCostToComplete) : "");
        setEtcNote(d.estimatedCostNote ?? "");
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const saveEtc = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/overview`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estimatedCostToComplete: etcDraft === "" ? null : Number(etcDraft), note: etcNote }),
      });
      if (!res.ok) throw new Error();
      toast.success("Estimasi biaya tersimpan.");
      void load();
    } catch {
      toast.error("Gagal menyimpan estimasi");
    } finally {
      setSaving(false);
    }
  };

  const submitChangeOrder = async () => {
    if (!coForm.title.trim()) { toast.error("Judul perubahan wajib diisi"); return; }
    try {
      const res = await fetch(`/api/projects/${projectId}/change-orders`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: coForm.title, valueImpact: Number(coForm.valueImpact) || 0, budgetImpact: Number(coForm.budgetImpact) || 0 }),
      });
      if (!res.ok) throw new Error();
      toast.success("Perubahan pekerjaan dicatat, menunggu persetujuan.");
      setCoForm({ title: "", valueImpact: "", budgetImpact: "" });
      setShowCoForm(false);
      void load();
    } catch { toast.error("Gagal menyimpan"); }
  };

  const decideChangeOrder = async (coId: string, status: "approved" | "rejected") => {
    try {
      const res = await fetch(`/api/projects/${projectId}/change-orders/${coId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      toast.success(status === "approved" ? "Perubahan disetujui." : "Perubahan ditolak.");
      void load();
    } catch { toast.error("Gagal menyimpan"); }
  };

  const submitQualityCheck = async () => {
    if (!qcForm.title.trim()) { toast.error("Judul pemeriksaan wajib diisi"); return; }
    try {
      const res = await fetch(`/api/projects/${projectId}/quality-checks`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: qcForm.title }),
      });
      if (!res.ok) throw new Error();
      toast.success("Pemeriksaan QC ditambahkan.");
      setQcForm({ title: "" });
      setShowQcForm(false);
      void load();
    } catch { toast.error("Gagal menyimpan"); }
  };

  const decideQualityCheck = async (qcId: string, result: "passed" | "failed" | "rework") => {
    try {
      const res = await fetch(`/api/projects/${projectId}/quality-checks/${qcId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ result }),
      });
      if (!res.ok) throw new Error();
      toast.success("Hasil QC tersimpan.");
      void load();
    } catch { toast.error("Gagal menyimpan"); }
  };

  const submitHandover = async () => {
    if (!bastForm.handoverDate) { toast.error("Tanggal serah terima wajib diisi"); return; }
    try {
      const res = await fetch(`/api/projects/${projectId}/handovers`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bastForm),
      });
      if (!res.ok) throw new Error();
      toast.success("BAST dibuat.");
      setBastForm({ handoverDate: "", scope: "", customerSignee: "" });
      setShowBastForm(false);
      void load();
    } catch { toast.error("Gagal menyimpan"); }
  };

  const signHandover = async (handoverId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/handovers/${handoverId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "signed" }),
      });
      if (!res.ok) throw new Error();
      toast.success("BAST ditandai sudah ditandatangani.");
      void load();
    } catch { toast.error("Gagal menyimpan"); }
  };

  if (loading) return <div className="space-y-3 py-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-40 w-full" /></div>;
  if (error || !data) return <p className="py-8 text-center text-sm text-[var(--neutral-500)]">Data proyek belum tersedia. Coba muat ulang.</p>;

  const f = data.financials;
  const showSupplier = data.executionMethod === "supplier" || data.executionMethod === "combination";
  const showWorkshop = data.executionMethod === "internal_workshop" || data.executionMethod === "combination";

  return (
    <div className="space-y-6 py-2">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-sm">{data.projectNumber}</span>
            <StatusBadge status={data.status} />
            <span className="text-[11px] px-2 py-0.5 rounded bg-[var(--neutral-100)] text-[var(--neutral-600)]">{EXECUTION_LABEL[data.executionMethod] ?? data.executionMethod}</span>
          </div>
          <h2 className="text-lg font-semibold">{data.projectName}</h2>
          <p className="text-sm text-[var(--neutral-600)] mt-1">
            {data.customer ? <span>Customer: <strong>{data.customer.name}</strong> · </span> : null}
            Perusahaan: {data.company.name} · PIC: {data.responsible?.name || data.responsible?.email || "Belum ditugaskan"}
          </p>
          <p className="text-xs text-[var(--neutral-500)] mt-1">Mulai {tanggal(data.startDate)} · Target selesai {tanggal(data.targetEndDate)}{data.actualEndDate ? ` · Selesai aktual ${tanggal(data.actualEndDate)}` : ""}</p>
        </div>
        <div className="flex gap-2 text-sm">
          {data.quotation && <Link href={`/sales/quotations/${data.quotation.id}`} className="erp-text-link">Penawaran {data.quotation.number} <ExternalLink size={13} /></Link>}
          {data.salesOrder && <Link href={`/sales/orders/${data.salesOrder.id}`} className="erp-text-link">SO {data.salesOrder.soNumber} <ExternalLink size={13} /></Link>}
        </div>
      </div>

      {!f.isFinal && (
        <div className="overview-error" role="status">
          <AlertTriangle size={18} />
          <div><strong>Margin belum final.</strong><p>Estimasi biaya sampai selesai belum diisi — angka margin di bawah ini adalah pandangan berjalan (biaya aktual + komitmen saja), bukan proyeksi akhir.</p></div>
        </div>
      )}
      {!f.hasCostData && (
        <div className="overview-error" role="status">
          <AlertTriangle size={18} />
          <div><strong>Belum ada data biaya.</strong><p>Belum ada PO atau reimbursement yang tercatat untuk proyek ini. Margin di bawah hanya membandingkan nilai kontrak dengan anggaran.</p></div>
        </div>
      )}

      <div className="grid md:grid-cols-4 gap-3">
        <FinCard
          label="Nilai kontrak"
          value={f.contractValue !== null ? rupiah(f.contractValue) : "Tidak ada SO tertaut"}
          hint={`Subtotal sales order${f.changeOrderValueTotal !== 0 ? ` ${rupiah(f.baseContractValue ?? 0)} + perubahan disetujui ${rupiah(f.changeOrderValueTotal)}` : " (sebelum PPN)"}`}
        />
        <FinCard
          label="Anggaran"
          value={rupiah(f.budget)}
          hint={f.changeOrderBudgetTotal !== 0 ? `Anggaran awal ${rupiah(f.baseBudget)} + perubahan disetujui ${rupiah(f.changeOrderBudgetTotal)}` : "Project.budget"}
        />
        <FinCard label="Biaya aktual" value={rupiah(f.actualCost)} hint="Bill vendor yang sudah diterima + reimbursement disetujui" />
        <FinCard label="Komitmen belum ditagih" value={rupiah(f.committedCost)} hint="Sisa nilai PO yang belum ada bill-nya" />
      </div>

      <div className="border rounded-lg p-4" style={{ borderColor: "#E4E7EC" }}>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--neutral-500)] mb-2">Estimasi biaya sampai selesai (diisi manual)</p>
        <div className="flex flex-wrap gap-2 items-center mb-2">
          <input type="number" className="erp-select" style={{ width: 180 }} placeholder="Nominal" value={etcDraft} onChange={(e) => setEtcDraft(e.target.value)} />
          <input type="text" className="erp-select flex-1" style={{ minWidth: 200 }} placeholder="Catatan dasar estimasi (opsional)" value={etcNote} onChange={(e) => setEtcNote(e.target.value)} />
          <button className="erp-primary-action" style={{ minHeight: 36, padding: "0 14px" }} disabled={saving} onClick={saveEtc}>Simpan</button>
        </div>
        {data.estimatedCostUpdatedAt && <p className="text-[11px] text-[var(--neutral-500)]">Terakhir diisi {tanggal(data.estimatedCostUpdatedAt)} oleh {data.estimatedCostUpdatedBy}</p>}
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <FinCard label="Estimasi total biaya" value={f.estimatedFinalCost !== null ? rupiah(f.estimatedFinalCost) : "Belum diisi"} hint="Aktual + komitmen + estimasi selesai" />
        <FinCard
          label={f.isFinal ? "Estimasi margin" : "Margin berjalan (belum final)"}
          value={f.estimatedMargin !== null ? `${rupiah(f.estimatedMargin)} (${f.estimatedMarginPercent}%)` : "Belum dapat dihitung"}
          hint="Nilai kontrak - estimasi total biaya"
          attention={f.estimatedMargin !== null && f.estimatedMargin < 0}
        />
        <FinCard label="Deviasi anggaran" value={rupiah(f.budgetDeviation)} hint="Estimasi biaya - anggaran" attention={f.budgetDeviation > 0} />
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <FinCard label="Pendapatan tertagih" value={rupiah(f.invoicedRevenue)} hint="Total invoice yang sudah dibuat" />
        <FinCard label="Kas masuk" value={rupiah(f.cashIn)} hint="Uang tunai yang sudah diterima" />
        <FinCard label="Kas keluar" value={rupiah(f.cashOut)} hint="Uang tunai yang sudah dibayar ke vendor" />
      </div>
      <p className="text-[11px] text-[var(--neutral-500)]">Kas masuk/keluar dipisah dari margin di atas — margin adalah laba proyek, bukan posisi kas.</p>

      {data.stages.length > 0 && (
        <Section title="Milestone">
          <div className="space-y-1.5">
            {data.stages.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm border-b py-1.5 last:border-0" style={{ borderColor: "#F1F1ED" }}>
                <span>{s.stageNumber}. {s.stageName}</span>
                <StatusBadge status={s.status} />
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title={`Perubahan pekerjaan (${data.changeOrders.length})`}>
        {data.changeOrders.length === 0 ? <Empty text="Belum ada perubahan pekerjaan tercatat." /> : (
          <div className="space-y-2 mb-3">
            {data.changeOrders.map((c) => (
              <div key={c.id} className="border rounded p-2 text-sm" style={{ borderColor: "#F1F1ED" }}>
                <div className="flex items-center justify-between">
                  <span className="font-medium">{c.changeNumber} — {c.title}</span>
                  <StatusBadge status={c.status} label={CO_STATUS_LABEL[c.status]} />
                </div>
                <p className="text-xs text-[var(--neutral-500)] mt-1">
                  Dampak nilai kontrak {rupiah(c.valueImpact)} · Dampak anggaran {rupiah(c.budgetImpact)}{c.requestedBy ? ` · Diajukan oleh ${c.requestedBy}` : ""}
                </p>
                {c.status === "pending" && (
                  <div className="flex gap-2 mt-2">
                    <button className="erp-text-link" style={{ minHeight: "auto" }} onClick={() => decideChangeOrder(c.id, "approved")}>Setujui</button>
                    <button className="erp-text-link" style={{ minHeight: "auto", color: "var(--status-danger-fg)" }} onClick={() => decideChangeOrder(c.id, "rejected")}>Tolak</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {showCoForm ? (
          <div className="flex flex-wrap gap-2 items-center">
            <input className="erp-select flex-1" style={{ minWidth: 160 }} placeholder="Judul perubahan" value={coForm.title} onChange={(e) => setCoForm({ ...coForm, title: e.target.value })} />
            <input type="number" className="erp-select" style={{ width: 140 }} placeholder="Dampak nilai" value={coForm.valueImpact} onChange={(e) => setCoForm({ ...coForm, valueImpact: e.target.value })} />
            <input type="number" className="erp-select" style={{ width: 140 }} placeholder="Dampak anggaran" value={coForm.budgetImpact} onChange={(e) => setCoForm({ ...coForm, budgetImpact: e.target.value })} />
            <button className="erp-primary-action" style={{ minHeight: 36, padding: "0 14px" }} onClick={submitChangeOrder}>Simpan</button>
            <button className="erp-text-link" style={{ minHeight: "auto" }} onClick={() => setShowCoForm(false)}>Batal</button>
          </div>
        ) : (
          <button className="erp-text-link" style={{ minHeight: "auto" }} onClick={() => setShowCoForm(true)}>+ Ajukan perubahan pekerjaan</button>
        )}
      </Section>

      <Section title={`QC (${data.qualityChecks.length})`}>
        {data.qualityChecks.length === 0 ? <Empty text="Belum ada pemeriksaan QC." /> : (
          <div className="space-y-2 mb-3">
            {data.qualityChecks.map((q) => (
              <div key={q.id} className="border rounded p-2 text-sm" style={{ borderColor: "#F1F1ED" }}>
                <div className="flex items-center justify-between">
                  <span className="font-medium">{q.checkNumber} — {q.title}</span>
                  <StatusBadge status={q.result} label={QC_RESULT_LABEL[q.result]} />
                </div>
                {q.inspectedAt && <p className="text-xs text-[var(--neutral-500)] mt-1">Diperiksa {tanggal(q.inspectedAt)} oleh {q.inspectedBy}</p>}
                {q.result === "pending" && (
                  <div className="flex gap-2 mt-2">
                    <button className="erp-text-link" style={{ minHeight: "auto" }} onClick={() => decideQualityCheck(q.id, "passed")}>Lulus</button>
                    <button className="erp-text-link" style={{ minHeight: "auto", color: "var(--status-warning-fg)" }} onClick={() => decideQualityCheck(q.id, "rework")}>Perlu perbaikan</button>
                    <button className="erp-text-link" style={{ minHeight: "auto", color: "var(--status-danger-fg)" }} onClick={() => decideQualityCheck(q.id, "failed")}>Gagal</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {showQcForm ? (
          <div className="flex gap-2 items-center">
            <input className="erp-select flex-1" placeholder="Judul pemeriksaan (mis. Inspeksi rangka)" value={qcForm.title} onChange={(e) => setQcForm({ title: e.target.value })} />
            <button className="erp-primary-action" style={{ minHeight: 36, padding: "0 14px" }} onClick={submitQualityCheck}>Simpan</button>
            <button className="erp-text-link" style={{ minHeight: "auto" }} onClick={() => setShowQcForm(false)}>Batal</button>
          </div>
        ) : (
          <button className="erp-text-link" style={{ minHeight: "auto" }} onClick={() => setShowQcForm(true)}>+ Tambah pemeriksaan QC</button>
        )}
      </Section>

      <Section title={`BAST — Berita Acara Serah Terima (${data.handoverDocuments.length})`}>
        {data.handoverDocuments.length === 0 ? <Empty text="Belum ada BAST." /> : (
          <div className="space-y-2 mb-3">
            {data.handoverDocuments.map((h) => (
              <div key={h.id} className="border rounded p-2 text-sm" style={{ borderColor: "#F1F1ED" }}>
                <div className="flex items-center justify-between">
                  <span className="font-medium">{h.documentNumber} — {tanggal(h.handoverDate)}</span>
                  <StatusBadge status={h.status} />
                </div>
                {h.scope && <p className="text-xs text-[var(--neutral-500)] mt-1">{h.scope}</p>}
                {h.customerSignee && <p className="text-xs text-[var(--neutral-500)]">Penerima: {h.customerSignee}</p>}
                {h.status === "draft" && (
                  <button className="erp-text-link mt-2" style={{ minHeight: "auto" }} onClick={() => signHandover(h.id)}>Tandai sudah ditandatangani</button>
                )}
              </div>
            ))}
          </div>
        )}
        {showBastForm ? (
          <div className="flex flex-wrap gap-2 items-center">
            <input type="date" className="erp-select" value={bastForm.handoverDate} onChange={(e) => setBastForm({ ...bastForm, handoverDate: e.target.value })} />
            <input className="erp-select flex-1" style={{ minWidth: 160 }} placeholder="Cakupan (mis. Serah terima tahap 1)" value={bastForm.scope} onChange={(e) => setBastForm({ ...bastForm, scope: e.target.value })} />
            <input className="erp-select" style={{ width: 160 }} placeholder="Penerima dari customer" value={bastForm.customerSignee} onChange={(e) => setBastForm({ ...bastForm, customerSignee: e.target.value })} />
            <button className="erp-primary-action" style={{ minHeight: 36, padding: "0 14px" }} onClick={submitHandover}>Simpan</button>
            <button className="erp-text-link" style={{ minHeight: "auto" }} onClick={() => setShowBastForm(false)}>Batal</button>
          </div>
        ) : (
          <button className="erp-text-link" style={{ minHeight: "auto" }} onClick={() => setShowBastForm(true)}>+ Buat BAST</button>
        )}
      </Section>

      {showSupplier && (
        <Section title="Purchase order supplier">
          {data.purchaseOrders.length === 0 ? <Empty text="Belum ada PO untuk proyek ini." /> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] text-[var(--neutral-500)] uppercase"><th className="py-1">PO</th><th>Vendor</th><th>Status</th><th className="text-right">Nilai</th><th>Bill</th></tr></thead>
              <tbody>
                {data.purchaseOrders.map((po) => (
                  <tr key={po.id} className="border-t" style={{ borderColor: "#F1F1ED" }}>
                    <td className="py-1.5"><Link href={`/supply-chain/purchase-orders/${po.id}`} className="erp-text-link">{po.poNumber}</Link></td>
                    <td>{po.supplierName}</td>
                    <td><StatusBadge status={po.status} /></td>
                    <td className="text-right">{rupiah(po.subtotal)}</td>
                    <td>{po.bills.length === 0 ? <span className="text-[var(--neutral-400)]">Belum ada bill</span> : po.bills.map((b) => <StatusBadge key={b.id} status={b.paymentState} />)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      )}

      {showWorkshop && (
        <Section title="Workshop">
          <p className="text-sm mb-2">Total jam kerja tercatat: <strong>{data.timesheets.totalHours} jam</strong></p>
          {data.workOrders.length === 0 ? <Empty text="Belum ada SPK." /> : (
            <div className="space-y-1.5 mb-3">
              {data.workOrders.map((wo) => (
                <div key={wo.id} className="flex items-center justify-between text-sm border-b py-1.5 last:border-0" style={{ borderColor: "#F1F1ED" }}>
                  <span>{wo.orderNumber}{wo.title ? ` — ${wo.title}` : ""}</span>
                  <StatusBadge status={wo.status} />
                </div>
              ))}
            </div>
          )}
          {data.boms.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--neutral-500)] mb-1">BOM terbaru</p>
              {data.boms.slice(0, 1).map((bom) => (
                <ul key={bom.id} className="text-sm list-disc pl-4">
                  {bom.items.map((it) => <li key={it.id}>{it.product.name} ({it.product.sku}) — {it.quantity} {it.unit.name}</li>)}
                </ul>
              ))}
            </div>
          )}
        </Section>
      )}

      {data.salesOrder && (
        <Section title="Pengiriman & penagihan">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--neutral-500)] mb-1">Surat jalan</p>
          {data.salesOrder.deliveries.length === 0 ? <Empty text="Belum ada pengiriman." /> : (
            <div className="space-y-1 mb-3">
              {data.salesOrder.deliveries.map((d) => (
                <div key={d.id} className="flex items-center justify-between text-sm">
                  <Link href={`/sales/delivery/${d.id}`} className="erp-text-link">{d.deliveryNumber}</Link>
                  <span className="text-[var(--neutral-500)]">{tanggal(d.deliveryDate)}</span>
                  <StatusBadge status={d.status} />
                </div>
              ))}
            </div>
          )}
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--neutral-500)] mb-1">Invoice</p>
          {data.salesOrder.invoices.length === 0 ? <Empty text="Belum ada invoice." /> : (
            <div className="space-y-1">
              {data.salesOrder.invoices.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between text-sm">
                  <Link href={`/finance/invoices/${inv.id}`} className="erp-text-link">{inv.invoiceNumber}</Link>
                  <span>{rupiah(inv.grandTotal)}</span>
                  <StatusBadge status={inv.status} />
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {data.reimbursements.length > 0 && (
        <Section title="Reimbursement proyek">
          <div className="space-y-1">
            {data.reimbursements.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-sm">
                <span>{r.employee.name} — {r.category || "Lainnya"}</span>
                <span>{rupiah(r.amount)}</span>
                <StatusBadge status={r.status} />
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title={`Lampiran (${data.attachmentCount})`}>
        <Attachments referenceType="Project" referenceId={projectId} />
      </Section>
    </div>
  );
}

function FinCard({ label, value, hint, attention }: { label: string; value: string; hint: string; attention?: boolean }) {
  return (
    <div className="border rounded-lg p-3" style={{ borderColor: "#E4E7EC" }} title={hint}>
      <p className="text-[11px] text-[var(--neutral-500)]">{label}</p>
      <p className="text-base font-semibold mt-1" style={{ color: attention ? "var(--status-danger-fg)" : undefined }}>{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-lg p-4" style={{ borderColor: "#E4E7EC" }}>
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--neutral-500)] mb-3">{title}</p>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-[var(--neutral-500)]">{text}</p>;
}
