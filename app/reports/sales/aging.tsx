"use client";

import { Fragment, useState } from "react";
import Link from "next/link";

export interface AgingData {
  buckets: { key: string; label: string; total: number; count: number }[];
  totalOutstanding: number;
  overdueOutstanding: number;
  byCustomer: {
    customer: string;
    invoiceCount: number;
    totalInvoice: number;
    balance: number;
    oldest: number;
    buckets: Record<string, number>;
  }[];
  invoices: {
    id: string;
    invoiceNumber: string;
    customer: string;
    invoiceDate: string;
    dueDate: string | null;
    grandTotal: number;
    balance: number;
    daysOverdue: number;
    bucket: string;
    items: {
      lineNumber: number;
      partNumber: string | null;
      description: string;
      quantity: number;
      unit: string | null;
      unitPrice: number;
      subtotal: number;
    }[];
  }[];
}

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
const date = (d: string | null) => (d ? new Date(d).toLocaleDateString("id-ID") : "-");

const th = "px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400";
const thr = th.replace("text-left", "text-right");
const td = "px-4 py-2 text-sm text-slate-700";
const tdr = `${td} text-right tabular-nums`;

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="border border-slate-200 bg-white p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{value}</p>
      {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
    </div>
  );
}

const LABELS = {
  piutang: { total: "Total piutang", unpaid: "invoice belum lunas", party: "Piutang per customer", doc: "No. invoice", docTotal: "Total invoice", rest: "Sisa piutang", href: "/finance/invoices", empty: "Tidak ada piutang." },
  utang: { total: "Total utang", unpaid: "bill belum lunas", party: "Utang per vendor", doc: "No. bill", docTotal: "Total bill", rest: "Sisa utang", href: "/supply-chain/bills", empty: "Tidak ada utang." },
};

export function Aging({ d, kind = "piutang" }: { d: AgingData; kind?: "piutang" | "utang" }) {
  const L = LABELS[kind];
  const [openCustomer, setOpenCustomer] = useState<string | null>(null);
  const [openInvoice, setOpenInvoice] = useState<string | null>(null);
  const worst = d.buckets.find((b) => b.key === "d90");
  const cols = d.buckets;
  const bucketSum = (k: string) => d.byCustomer.reduce((s, c) => s + (c.buckets[k] || 0), 0);
  const span = 4 + cols.length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={L.total} value={idr(d.totalOutstanding)} note={`${d.invoices.length} ${L.unpaid}`} />
        <Stat
          label="Sudah lewat jatuh tempo"
          value={idr(d.overdueOutstanding)}
          note={
            d.totalOutstanding > 0
              ? `${Math.round((d.overdueOutstanding / d.totalOutstanding) * 100)}% dari total`
              : undefined
          }
        />
        <Stat label="Lebih dari 90 hari" value={idr(worst?.total ?? 0)} note={`${worst?.count ?? 0} invoice`} />
      </div>

      <section className="border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            {L.party}
          </h3>
          <p className="mt-0.5 text-xs text-slate-400">
            Klik baris untuk melihat dokumennya, lalu klik &ldquo;Lihat item&rdquo; untuk isinya. Aging dihitung
            dari tanggal jatuh tempo sampai hari ini.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className={th}>{kind === "utang" ? "Vendor" : "Customer"}</th>
                <th className={thr}>{L.doc}</th>
                <th className={thr}>{L.docTotal}</th>
                <th className={thr}>{L.rest}</th>
                {cols.map((b) => (
                  <th key={b.key} className={thr}>
                    {b.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.byCustomer.map((c) => {
                const open = openCustomer === c.customer;
                const invs = d.invoices.filter((i) => i.customer === c.customer);
                return (
                  <Fragment key={c.customer}>
                    <tr
                      onClick={() => setOpenCustomer(open ? null : c.customer)}
                      className={`cursor-pointer border-b border-slate-100 hover:bg-slate-50 ${open ? "bg-slate-50" : ""}`}
                    >
                      <td className={`${td} font-medium text-slate-900`}>
                        <span className="mr-2 inline-block w-3 text-slate-400">{open ? "▾" : "▸"}</span>
                        {c.customer}
                      </td>
                      <td className={tdr}>{c.invoiceCount}</td>
                      <td className={tdr}>{idr(c.totalInvoice)}</td>
                      <td className={`${tdr} font-semibold text-slate-900`}>{idr(c.balance)}</td>
                      {cols.map((b) => (
                        <td
                          key={b.key}
                          className={`${tdr} ${
                            c.buckets[b.key] > 0 ? (b.key === "current" ? "" : "text-brand") : "text-slate-300"
                          }`}
                        >
                          {c.buckets[b.key] > 0 ? idr(c.buckets[b.key]) : "-"}
                        </td>
                      ))}
                    </tr>
                    {open && (
                      <tr className="border-b border-slate-200 bg-slate-50/60">
                        <td colSpan={span} className="px-4 py-3">
                          <table className="w-full bg-white">
                            <thead>
                              <tr className="border-b border-slate-200">
                                <th className={th}>{L.doc}</th>
                                <th className={th}>Tanggal</th>
                                <th className={th}>Jatuh tempo</th>
                                <th className={thr}>Aging</th>
                                <th className={thr}>Total</th>
                                <th className={thr}>Sisa</th>
                                <th className={thr}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {invs.map((i) => {
                                const iopen = openInvoice === i.id;
                                return (
                                  <Fragment key={i.id}>
                                    <tr className="border-b border-slate-100">
                                      <td className={`${td} font-mono text-xs`}>
                                        <Link href={`${L.href}/${i.id}`} className="hover:underline">
                                          {i.invoiceNumber}
                                        </Link>
                                      </td>
                                      <td className={td}>{date(i.invoiceDate)}</td>
                                      <td className={td}>{date(i.dueDate)}</td>
                                      <td className={tdr}>
                                        {i.daysOverdue > 0 ? `${i.daysOverdue} hari` : "belum jatuh tempo"}
                                      </td>
                                      <td className={tdr}>{idr(i.grandTotal)}</td>
                                      <td className={`${tdr} font-medium`}>{idr(i.balance)}</td>
                                      <td className={tdr}>
                                        <button
                                          onClick={() => setOpenInvoice(iopen ? null : i.id)}
                                          className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline"
                                        >
                                          {iopen ? "Tutup item" : `Lihat ${i.items.length} item`}
                                        </button>
                                      </td>
                                    </tr>
                                    {iopen && (
                                      <tr className="border-b border-slate-100">
                                        <td colSpan={7} className="bg-slate-50/60 px-4 py-3">
                                          <table className="w-full">
                                            <thead>
                                              <tr className="border-b border-slate-200">
                                                <th className={th}>#</th>
                                                <th className={th}>Part no.</th>
                                                <th className={th}>Deskripsi</th>
                                                <th className={thr}>Qty</th>
                                                <th className={thr}>Harga satuan</th>
                                                <th className={thr}>Subtotal</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                              {i.items.map((it) => (
                                                <tr key={it.lineNumber}>
                                                  <td className={td}>{it.lineNumber}</td>
                                                  <td className={`${td} font-mono text-xs`}>{it.partNumber || "-"}</td>
                                                  <td className={td}>{it.description}</td>
                                                  <td className={tdr}>
                                                    {it.quantity} {it.unit}
                                                  </td>
                                                  <td className={tdr}>{idr(it.unitPrice)}</td>
                                                  <td className={tdr}>{idr(it.subtotal)}</td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </td>
                                      </tr>
                                    )}
                                  </Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {d.byCustomer.length === 0 && (
                <tr>
                  <td colSpan={span} className="px-5 py-6 text-sm text-slate-400">
                    {L.empty}
                  </td>
                </tr>
              )}
            </tbody>
            {d.byCustomer.length > 0 && (
              <tfoot>
                <tr className="border-t border-slate-300 bg-slate-50">
                  <td className={`${td} font-semibold`}>Total</td>
                  <td className={`${tdr} font-semibold`}>{d.invoices.length}</td>
                  <td className={`${tdr} font-semibold`}>
                    {idr(d.byCustomer.reduce((s, c) => s + c.totalInvoice, 0))}
                  </td>
                  <td className={`${tdr} font-semibold`}>{idr(d.totalOutstanding)}</td>
                  {cols.map((b) => (
                    <td key={b.key} className={`${tdr} font-semibold`}>
                      {idr(bucketSum(b.key))}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  );
}
