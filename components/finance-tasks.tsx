"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Bill {
  id: string;
  billNumber: string;
  kind: string;
  vendorName: string;
  vendorInvoiceNumber: string | null;
  dueDate: string | null;
  overdue: boolean;
  grandTotal: number;
  paidAmount: number;
  outstanding: number;
  poId: string | null;
  poNumber: string | null;
  soNumbers: string[];
  attachmentId: string | null;
}

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

  useEffect(() => {
    fetch("/api/finance/tasks")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null));
  }, []);

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
                  </p>
                  <p className="text-xs text-slate-500">
                    <Link href={`/supply-chain/bills/${b.id}`} className="font-mono hover:underline">{b.billNumber}</Link>
                    {b.vendorInvoiceNumber ? ` · invoice vendor ${b.vendorInvoiceNumber}` : ""}
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
                  <Link
                    href={`/supply-chain/vendor-payments/new?billId=${b.id}`}
                    className="bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                  >
                    Bayar
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
