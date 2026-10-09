"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PoVendorBills } from "@/components/po-vendor-bills";

interface Row {
  id: string;
  poNumber: string;
  deliveryDate: string | null;
  status: string;
  supplierName: string;
  total: number;
  salesOrders: { id: string; soNumber: string; customerPoNumber: string; customerName: string }[];
  owner: "scm" | "director" | "finance" | "vendor";
  stage: {
    key: string;
    label: string;
    next: string;
    action: "send" | "confirm" | "dp_bill" | "request_approval" | null;
    tone: "slate" | "amber" | "blue" | "indigo" | "green" | "red";
    approval?: "not_required" | "none" | "pending" | "approved" | "rejected";
    dpPercent?: number;
    dpBill?: { id: string; billNumber: string; status: string; grandTotal: number; paidAmount: number } | null;
  };
}

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const CHIP: Record<Row["stage"]["tone"], string> = {
  slate: "bg-slate-100 text-slate-700",
  amber: "bg-amber-100 text-amber-800",
  blue: "bg-blue-100 text-blue-800",
  indigo: "bg-indigo-100 text-indigo-800",
  green: "bg-emerald-100 text-emerald-800",
  red: "bg-red-100 text-red-800",
};

const ACTION_LABEL: Record<string, string> = {
  send: "Kirim PO ke vendor",
  confirm: "Catat konfirmasi vendor",
  dp_bill: "Siapkan tagihan DP",
};

const OWNER_LABEL: Record<Row["owner"], string> = {
  scm: "Menunggu SCM",
  director: "Menunggu direktur",
  finance: "Menunggu Finance",
  vendor: "Menunggu vendor",
};

function approvalText(r: Row) {
  if (r.status !== "draft") return "PO sudah disetujui dan dikirim";
  switch (r.stage.approval) {
    case "approved": return "Disetujui direktur";
    case "pending": return "Persetujuan direktur: menunggu";
    case "rejected": return "Persetujuan direktur: ditolak";
    case "none": return "Belum diajukan ke direktur";
    default: return "Tidak perlu persetujuan";
  }
}

function dpText(r: Row) {
  const dp = r.stage.dpBill;
  const pct = r.stage.dpPercent ?? 0;
  if (!pct && !dp) return "Tanpa DP";
  const label = pct ? `DP ${pct}%` : "DP";
  if (!dp) return `${label}: tagihan belum disiapkan`;
  if (dp.status === "draft") return `${label}: menunggu tagihan dari vendor (${dp.billNumber})`;
  if (dp.paidAmount + 0.5 >= dp.grandTotal) return `${label}: sudah dibayar ${idr(dp.paidAmount)}`;
  return `${label}: tagihan masuk ${idr(dp.grandTotal)}, menunggu pembayaran Finance${dp.paidAmount > 0 ? ` (terbayar ${idr(dp.paidAmount)})` : ""}`;
}

export function PoQueue({ embedded = false }: { embedded?: boolean } = {}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [billsOpen, setBillsOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/purchase-orders/queue");
    setRows(res.ok ? await res.json() : []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (r: Row, action: string) => {
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
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memproses");
    } finally {
      setBusyId(null);
    }
  };

  if (!rows || rows.length === 0) return null;

  const mine = rows.filter((r) => r.owner === "scm");
  const others = rows.filter((r) => r.owner !== "scm");

  const renderRow = (r: Row) => {
    const canBills = ["sent", "confirmed", "partial_received", "received"].includes(r.status);
    return (
      <li key={r.id} className="px-5 py-3 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-slate-900">
              <Link href={`/supply-chain/purchase-orders/${r.id}`} className="hover:underline">{r.poNumber}</Link>
              <span className="font-normal text-slate-500"> · {r.supplierName} · {idr(r.total)}</span>
            </p>
            <p className="text-xs text-slate-500">
              {r.salesOrders.length === 0 ? (
                "Tanpa SO (pembelian stok/manual)"
              ) : (
                <>
                  Untuk SO{" "}
                  {r.salesOrders.map((so, i) => (
                    <span key={so.id}>
                      {i > 0 ? ", " : ""}
                      <Link href={`/supply-chain/sales-orders/${so.id}`} className="hover:underline">{so.soNumber}</Link>
                      {` (PO customer ${so.customerPoNumber}, ${so.customerName})`}
                    </span>
                  ))}
                </>
              )}
              {r.deliveryDate ? ` · kirim ${new Date(r.deliveryDate).toLocaleDateString("id-ID")}` : ""}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className={`px-2 py-0.5 text-[11px] font-medium ${CHIP[r.stage.tone]}`}>{r.stage.label}</span>
              <span className="text-xs text-slate-500">{OWNER_LABEL[r.owner]}</span>
            </div>
            <p className="mt-1 text-xs text-slate-700"><span className="font-medium">Langkah berikutnya:</span> {r.stage.next}</p>
            <p className="mt-0.5 text-xs text-slate-500">{approvalText(r)} · {dpText(r)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
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
            {canBills && (
              <button
                type="button"
                onClick={() => setBillsOpen(billsOpen === r.id ? null : r.id)}
                className="border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {billsOpen === r.id ? "Tutup tagihan vendor" : "Tagihan vendor"}
              </button>
            )}
            <Link
              href={`/supply-chain/purchase-orders/${r.id}`}
              className="border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Buka PO
            </Link>
          </div>
        </div>
        {billsOpen === r.id && <PoVendorBills poId={r.id} />}
      </li>
    );
  };

  return (
    <section className={embedded ? "" : "border border-slate-200 border-l-2 border-l-indigo-400 bg-white"}>
      <div className={embedded ? "px-5" : "border-b border-slate-200 px-5 py-3"}>
        {!embedded && (<>
<h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          Status Purchase Order ({rows.length})
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Posisi tiap PO yang masih berjalan: sudah disetujui atau belum, DP, tagihan vendor, dan siapa yang harus bergerak berikutnya.
        </p>

</>)}        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </div>

      {mine.length > 0 && (
        <>
          <p className="border-b border-slate-100 bg-slate-50 px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Perlu tindakan SCM ({mine.length})
          </p>
          <ul className="divide-y divide-slate-100">{mine.map(renderRow)}</ul>
        </>
      )}
      {others.length > 0 && (
        <>
          <p className="border-y border-slate-100 bg-slate-50 px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Menunggu pihak lain ({others.length})
          </p>
          <ul className="divide-y divide-slate-100">{others.map(renderRow)}</ul>
        </>
      )}
    </section>
  );
}
