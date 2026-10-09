"use client";

import { useState } from "react";
import Link from "next/link";

export interface QueueRow {
  id: string;
  poNumber: string;
  deliveryDate: string | null;
  status: string;
  supplierName: string;
  total: number;
  items: { description: string; quantity: number; unit: string | null; received: number; invoiced: number }[];
  salesOrders: { id: string; soNumber: string; customerPoNumber: string; customerName: string }[];
  owner: "scm" | "director" | "finance" | "vendor";
  stage: {
    key: string;
    label: string;
    next: string;
    action: "send" | "confirm" | "dp_bill" | "request_approval" | null;
    tone: "slate" | "amber" | "blue" | "indigo" | "green" | "red";
    approval?: string;
    dpPercent?: number;
    dpBill?: { id: string; billNumber: string; status: string; grandTotal: number; paidAmount: number } | null;
    payment?: { poTotal: number; billed: number; paid: number; unpaid: number };
  };
}

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const CHIP: Record<QueueRow["stage"]["tone"], string> = {
  slate: "bg-slate-100 text-slate-700",
  amber: "bg-amber-100 text-amber-800",
  blue: "bg-blue-100 text-blue-800",
  indigo: "bg-indigo-100 text-indigo-800",
  green: "bg-emerald-100 text-emerald-800",
  red: "bg-red-100 text-red-800",
};

const OWNER: Record<QueueRow["owner"], string> = { scm: "SCM", director: "Direktur", finance: "Finance", vendor: "Vendor" };
const ACTION_LABEL: Record<string, string> = { send: "Kirim PO ke vendor", confirm: "Catat konfirmasi vendor", dp_bill: "Siapkan tagihan DP" };

function paymentText(r: QueueRow) {
  const dp = r.stage.dpBill;
  const pay = r.stage.payment;
  const parts: string[] = [];
  if (dp) {
    parts.push(
      dp.status === "draft"
        ? `DP ${idr(dp.grandTotal)}: menunggu tagihan vendor`
        : dp.paidAmount + 0.5 >= dp.grandTotal
          ? `DP ${idr(dp.grandTotal)}: dibayar`
          : `DP ${idr(dp.grandTotal)}: belum dibayar`
    );
  } else if ((r.stage.dpPercent ?? 0) > 0) {
    parts.push(`DP ${r.stage.dpPercent}%: belum ditagih vendor`);
  }
  if (pay && pay.billed > 0) {
    const rest = Math.max(pay.poTotal - pay.paid, 0);
    parts.push(`Dibayar ${idr(pay.paid)} dari ${idr(pay.poTotal)}${rest > 0.5 ? ` · sisa ${idr(rest)}` : ""}`);
  }
  return parts.join(" · ");
}

// PO needing attention: its items, the payment position (DP and remaining), and the one
// thing that has to happen next.
export function ScmPoActions({ rows, onChanged }: { rows: QueueRow[]; onChanged: () => void }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (r: QueueRow, action: string) => {
    setBusyId(r.id);
    setError(null);
    try {
      const res = await fetch(`/api/purchase-orders/${r.id}/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Gagal memproses");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memproses");
    } finally {
      setBusyId(null);
    }
  };

  const mine = rows.filter((r) => r.owner === "scm");
  const others = rows.filter((r) => r.owner !== "scm");

  const renderRow = (r: QueueRow) => {
    const pay = paymentText(r);
    return (
      <li key={r.id} className="px-5 py-3 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-slate-900">
              <Link href={`/supply-chain/purchase-orders/${r.id}`} className="hover:underline">{r.poNumber}</Link>
              <span className="font-normal text-slate-500"> · {r.supplierName} · {idr(r.total)}</span>
              {r.salesOrders.length > 0 && (
                <span className="font-normal text-slate-500"> · SO {r.salesOrders.map((s) => s.soNumber).join(", ")}</span>
              )}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className={`px-2 py-0.5 text-[11px] font-medium ${CHIP[r.stage.tone]}`}>{r.stage.label}</span>
              <span className="text-xs text-slate-500">Menunggu {OWNER[r.owner]}</span>
            </div>
            <p className="mt-1 text-xs text-slate-800"><span className="font-medium">Tindakan:</span> {r.stage.next}</p>
            {pay && <p className="text-xs text-slate-500">{pay}</p>}
            <ul className="mt-1.5 space-y-0.5 text-xs text-slate-600">
              {r.items.map((i, idx) => (
                <li key={idx} className="flex justify-between gap-3 border-t border-slate-100 pt-0.5">
                  <span className="min-w-0 truncate">{i.description}</span>
                  <span className="shrink-0 tabular-nums text-slate-500">
                    {i.quantity} {i.unit || ""} · diterima {i.received} · ditagih {i.invoiced}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex gap-2">
            {r.stage.action && r.stage.action !== "request_approval" && (
              <button
                type="button"
                disabled={busyId === r.id}
                onClick={() => run(r, r.stage.action!)}
                className="bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {busyId === r.id ? "Memproses…" : ACTION_LABEL[r.stage.action]}
              </button>
            )}
            <Link href={`/supply-chain/purchase-orders/${r.id}`} className="border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Buka PO
            </Link>
          </div>
        </div>
      </li>
    );
  };

  return (
    <div>
      {error && <p className="border-b border-red-200 bg-red-50 px-5 py-2 text-sm text-red-800">{error}</p>}
      {mine.length > 0 && (
        <>
          <p className="border-b border-slate-100 bg-slate-50 px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tindakan SCM ({mine.length})</p>
          <ul className="divide-y divide-slate-100">{mine.map(renderRow)}</ul>
        </>
      )}
      {others.length > 0 && (
        <>
          <p className="border-y border-slate-100 bg-slate-50 px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Menunggu pihak lain ({others.length})</p>
          <ul className="divide-y divide-slate-100">{others.map(renderRow)}</ul>
        </>
      )}
      {rows.length === 0 && <p className="px-5 py-4 text-sm text-slate-400">Tidak ada PO yang menunggu tindakan.</p>}
    </div>
  );
}
