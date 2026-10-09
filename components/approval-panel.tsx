"use client";

import { useCallback, useEffect, useState } from "react";

interface TierInfo {
  role: string;
  status: "none" | "pending" | "approved" | "rejected";
  approval: { id: string; notes: string | null } | null;
}

interface StateResponse {
  state: "not_required" | "none" | "pending" | "approved" | "rejected";
  approval: { id: string; notes: string | null } | null;
  tiers: TierInfo[];
  threshold: number;
  amount: number;
  canDecide: boolean;
}

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const TIER_TONE: Record<TierInfo["status"], string> = {
  none: "bg-slate-100 text-slate-500",
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
};
const TIER_LABEL: Record<TierInfo["status"], string> = {
  none: "Belum diajukan",
  pending: "Menunggu",
  approved: "Disetujui",
  rejected: "Ditolak",
};

export function ApprovalPanel({
  referenceType,
  referenceId,
  refreshKey,
}: {
  referenceType: "PurchaseOrder" | "Quotation";
  referenceId: string;
  refreshKey?: unknown;
}) {
  const [data, setData] = useState<StateResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/approvals?referenceType=${referenceType}&referenceId=${referenceId}`);
    if (res.ok) setData(await res.json());
  }, [referenceType, referenceId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const call = async (url: string, method: string, body: unknown) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Gagal memproses");
      setNotes("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memproses");
    } finally {
      setBusy(false);
    }
  };

  if (!data || data.state === "not_required") return null;

  const tiers = data.tiers || [];
  const isMultiTier = tiers.length > 1;
  const tone = { none: "border-amber-400", pending: "border-amber-400", approved: "border-emerald-500", rejected: "border-red-500" }[
    data.state
  ];
  const pendingTier = tiers.find((t) => t.status === "pending");
  const text = {
    none: `Dokumen bernilai ${idr(data.amount)} (batas ${idr(data.threshold)}). Perlu persetujuan${isMultiTier ? ` bertahap (${tiers.map((t) => t.role).join(" → ")})` : ""} sebelum status bisa diubah dari Draft.`,
    pending: `Menunggu persetujuan role ${pendingTier?.role ?? "Owner"}/Admin.`,
    approved: "Sudah disetujui semua tahap. Status dokumen boleh diubah.",
    rejected: `Pengajuan ditolak${data.approval?.notes ? `: ${data.approval.notes}` : ""}. Ubah dokumen lalu ajukan lagi.`,
  }[data.state];

  return (
    <div className={`mb-6 border-l-2 ${tone} border-y border-r border-y-slate-200 border-r-slate-200 bg-white px-4 py-3`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Persetujuan</p>

      {isMultiTier && (
        <div className="mt-2 flex items-center gap-2">
          {tiers.map((t, i) => (
            <div key={t.role} className="flex items-center gap-2">
              <span className={`px-2 py-0.5 text-xs font-medium ${TIER_TONE[t.status]}`}>
                {t.role}: {TIER_LABEL[t.status]}
              </span>
              {i < tiers.length - 1 && <span className="text-slate-300">→</span>}
            </div>
          ))}
        </div>
      )}

      <p className="mt-2 text-sm text-slate-700">{text}</p>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      {(data.state === "none" || data.state === "rejected") && (
        <button
          type="button"
          disabled={busy}
          onClick={() => call("/api/approvals", "POST", { referenceType, referenceId })}
          className="mt-3 border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {data.state === "rejected" ? "Ajukan ulang" : "Ajukan persetujuan"}
        </button>
      )}

      {data.state === "pending" && data.canDecide && data.approval && (
        <div className="mt-3 space-y-2">
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Catatan (opsional)"
            className="w-full border border-slate-300 px-3 py-1.5 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => call(`/api/approvals/${data.approval!.id}`, "PUT", { decision: "approved", notes })}
              className="bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Setujui
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => call(`/api/approvals/${data.approval!.id}`, "PUT", { decision: "rejected", notes })}
              className="border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Tolak
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
