"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface Stage {
  key: string;
  label: string;
  next: string;
  action: "send" | "confirm" | "dp_bill" | "request_approval" | null;
  tone: "slate" | "amber" | "blue" | "indigo" | "green" | "red";
  dpBill?: { id: string; billNumber: string; grandTotal: number; paidAmount: number } | null;
}

const TONE: Record<Stage["tone"], string> = {
  slate: "border-slate-300 bg-slate-50 text-slate-800",
  amber: "border-amber-300 bg-amber-50 text-amber-900",
  blue: "border-blue-300 bg-blue-50 text-blue-900",
  indigo: "border-indigo-300 bg-indigo-50 text-indigo-900",
  green: "border-emerald-300 bg-emerald-50 text-emerald-900",
  red: "border-red-300 bg-red-50 text-red-900",
};

const ACTION_LABEL: Record<string, string> = {
  send: "Kirim PO ke vendor",
  confirm: "Catat konfirmasi vendor",
  dp_bill: "Siapkan tagihan DP",
};

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

export function PoNextSteps({ poId, refreshKey }: { poId: string; refreshKey?: unknown }) {
  const [stage, setStage] = useState<Stage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/purchase-orders/${poId}/advance`);
    if (res.ok) setStage(await res.json());
  }, [poId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const run = async (action: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/purchase-orders/${poId}/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Gagal memproses");
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memproses");
    } finally {
      setBusy(false);
    }
  };

  if (!stage) return null;

  return (
    <div className={`mb-4 border-l-4 p-4 text-sm ${TONE[stage.tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] opacity-70">Tahap PO</p>
      <p className="mt-0.5 text-base font-semibold">{stage.label}</p>
      <p className="mt-1">
        <span className="font-medium">Langkah berikutnya:</span> {stage.next}
      </p>
      {stage.dpBill && (
        <p className="mt-1 text-xs">
          Tagihan DP{" "}
          <Link href={`/supply-chain/bills/${stage.dpBill.id}`} className="font-mono underline">{stage.dpBill.billNumber}</Link>
          {" "}· {idr(stage.dpBill.grandTotal)} · dibayar {idr(stage.dpBill.paidAmount)}
        </p>
      )}
      {stage.action === "request_approval" && <p className="mt-1 text-xs">Ajukan lewat panel Persetujuan di bawah.</p>}
      {stage.action && stage.action !== "request_approval" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => run(stage.action!)}
          className="mt-3 bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Memproses…" : ACTION_LABEL[stage.action]}
        </button>
      )}
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
