"use client";

import { useCallback, useEffect, useState } from "react";

interface StateResponse {
  state: "not_required" | "none" | "pending" | "approved" | "rejected";
  approval: { id: string; notes: string | null } | null;
  threshold: number;
  amount: number;
  canDecide: boolean;
}

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

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

  const tone = { none: "border-amber-400", pending: "border-amber-400", approved: "border-emerald-500", rejected: "border-red-500" }[
    data.state
  ];
  const text = {
    none: `Dokumen bernilai ${idr(data.amount)} (batas ${idr(data.threshold)}). Perlu persetujuan sebelum status bisa diubah dari Draft.`,
    pending: "Menunggu persetujuan Owner/Admin.",
    approved: "Sudah disetujui. Status dokumen boleh diubah.",
    rejected: `Pengajuan ditolak${data.approval?.notes ? `: ${data.approval.notes}` : ""}. Ubah dokumen lalu ajukan lagi.`,
  }[data.state];

  return (
    <div className={`mb-6 border-l-2 ${tone} border-y border-r border-y-slate-200 border-r-slate-200 bg-white px-4 py-3`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Persetujuan</p>
      <p className="mt-1 text-sm text-slate-700">{text}</p>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      {(data.state === "none" || data.state === "rejected") && (
        <button
          type="button"
          disabled={busy}
          onClick={() => call("/api/approvals", "POST", { referenceType, referenceId })}
          className="mt-3 border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Ajukan persetujuan
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
