"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatTaxInvoiceNumber } from "@/lib/tax-invoice";

interface Bill {
  id: string;
  billNumber: string;
  kind: string;
  vendorName: string;
  vendorInvoiceNumber: string | null;
  vendorTaxInvoiceNumber: string | null;
  dueDate: string | null;
  overdue: boolean;
  grandTotal: number;
  paidAmount: number;
  outstanding: number;
  poId: string | null;
  poNumber: string | null;
  soNumbers: string[];
  attachmentId: string | null;
  match: { status: string; note: string; variance: number | null; overridden: boolean; overrideBy: string | null; overrideNote: string | null; blocked: boolean } | null;
}

const MATCH_LABEL: Record<string, string> = { matched: "Cocok", variance: "Selisih", not_received: "Barang belum diterima", legacy: "Cek manual" };

interface Data {
  vendorBills: Bill[];
  vendorBillTotal: number;
  vendorBillOverdueCount: number;
  overdueInvoiceCount: number;
  overdueInvoiceTotal: number;
}

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

export function FinanceTasks() {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = () =>
    fetch("/api/finance/tasks")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null));

  useEffect(() => {
    load();
  }, []);

  async function override(b: Bill, action: "approve" | "revoke") {
    let note = "";
    if (action === "approve") {
      note = window.prompt(`Alasan membayar ${b.billNumber} walau belum cocok:\n${b.match?.note ?? ""}`) ?? "";
      if (!note.trim()) return;
    }
    setBusy(b.id);
    setError("");
    const res = await fetch(`/api/bills/${b.id}/match-override`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, note }) });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error || "Gagal menyimpan");
    setBusy(null);
    load();
  }

  if (!data) return null;

  const tile = "border border-slate-200 bg-white px-5 py-4";

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className={tile}>
          <p className="text-xs text-slate-500">Tagihan vendor perlu dibayar</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{data.vendorBills.length}</p>
          <p className="text-xs text-slate-500">{idr(data.vendorBillTotal)} belum dibayar</p>
        </div>
        <div className={tile}>
          <p className="text-xs text-slate-500">Tagihan vendor lewat jatuh tempo</p>
          <p className={`mt-1 text-2xl font-semibold tabular-nums ${data.vendorBillOverdueCount > 0 ? "text-red-700" : "text-slate-900"}`}>{data.vendorBillOverdueCount}</p>
          <p className="text-xs text-slate-500">dari tagihan yang sudah masuk</p>
        </div>
        <Link href="/finance/collections" className={`${tile} hover:border-slate-400`}>
          <p className="text-xs text-slate-500">Piutang customer lewat jatuh tempo</p>
          <p className={`mt-1 text-2xl font-semibold tabular-nums ${data.overdueInvoiceCount > 0 ? "text-red-700" : "text-slate-900"}`}>{data.overdueInvoiceCount}</p>
          <p className="text-xs text-slate-500">{idr(data.overdueInvoiceTotal)} · buka meja kerja penagihan</p>
        </Link>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {data.vendorBills.length > 0 && (
        <section className="border border-slate-200 border-l-2 border-l-red-400 bg-white">
          <div className="border-b border-slate-200 px-5 py-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Tagihan vendor menunggu pembayaran ({data.vendorBills.length})
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Tagihan DP dan invoice vendor yang sudah dicatat masuk oleh SCM. Klik Bayar untuk mencatat pembayaran vendor.
            </p>
          </div>
          <ul className="divide-y divide-slate-100">
            {data.vendorBills.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">
                    {b.vendorName}
                    <span className="ml-2 bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">
                      {b.kind === "down_payment" ? "DP" : "Invoice"}
                    </span>
                    {b.overdue && <span className="ml-2 bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-800">Lewat jatuh tempo</span>}
                    {b.match && (
                      <span
                        className={`ml-2 px-1.5 py-0.5 text-[11px] font-medium ${
                          b.match.status === "matched" ? "bg-emerald-100 text-emerald-800" : b.match.overridden ? "bg-amber-100 text-amber-800" : b.match.status === "legacy" ? "bg-slate-100 text-slate-700" : "bg-red-100 text-red-800"
                        }`}
                      >
                        3-way: {b.match.overridden && b.match.status !== "matched" ? "disetujui Finance" : MATCH_LABEL[b.match.status] ?? b.match.status}
                      </span>
                    )}
                  </p>
                  {b.match && b.match.status !== "matched" && (
                    <p className={`text-xs ${b.match.blocked ? "text-red-700" : "text-slate-500"}`}>
                      {b.match.note}
                      {b.match.overridden && b.match.overrideNote ? ` · alasan: ${b.match.overrideNote} (${b.match.overrideBy})` : ""}
                    </p>
                  )}
                  <p className="text-xs text-slate-500">
                    <Link href={`/supply-chain/bills/${b.id}`} className="font-mono hover:underline">{b.billNumber}</Link>
                    {b.vendorInvoiceNumber ? ` · invoice vendor ${b.vendorInvoiceNumber}` : ""}
                    {b.vendorTaxInvoiceNumber ? ` · FP ${formatTaxInvoiceNumber(b.vendorTaxInvoiceNumber)}` : ""}
                    {b.poNumber && (
                      <>
                        {" "}· <Link href={`/supply-chain/purchase-orders/${b.poId}`} className="font-mono hover:underline">{b.poNumber}</Link>
                      </>
                    )}
                    {b.soNumbers.length > 0 ? ` · SO ${b.soNumbers.join(", ")}` : ""}
                    {b.dueDate ? ` · jatuh tempo ${new Date(b.dueDate).toLocaleDateString("id-ID")}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold tabular-nums text-slate-900">{idr(b.outstanding)}</p>
                  {b.paidAmount > 0 && <p className="text-xs text-slate-500">dari {idr(b.grandTotal)}</p>}
                </div>
                <div className="flex gap-2">
                  {b.attachmentId && (
                    <a
                      href={`/api/attachments/${b.attachmentId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Lihat PDF
                    </a>
                  )}
                  {b.match?.blocked ? (
                    <button
                      type="button"
                      disabled={busy === b.id}
                      onClick={() => override(b, "approve")}
                      className="border border-amber-400 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900 disabled:opacity-50"
                    >
                      Setujui pengecualian
                    </button>
                  ) : (
                    <>
                      {b.match?.overridden && b.match.status !== "matched" && (
                        <button type="button" disabled={busy === b.id} onClick={() => override(b, "revoke")} className="border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 disabled:opacity-50">
                          Cabut
                        </button>
                      )}
                      <Link
                        href={`/supply-chain/vendor-payments/new?billId=${b.id}`}
                        className="bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                      >
                        Bayar
                      </Link>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
