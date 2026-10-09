"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePermissions } from "@/components/permissions";

interface Quote {
  id: string;
  number: string;
  status: string;
  customerName: string;
  quotationDate: string;
  expired: boolean;
  ageDays: number;
  salesPic: string | null;
  nextFollowUpAt: string | null;
  followUpOverdue: boolean;
  value: number;
  items: { description: string; quantity: number; unit: string | null }[];
}

interface DeliveryRow {
  id: string;
  soNumber: string;
  customerPoNumber: string;
  customerName: string;
  deliveryDate: string | null;
  late: boolean;
  stage: string;
  hasDelivery: boolean;
  debtAt: string | null;
  debtNote: string | null;
  lines: { description: string; partNumber: string | null; unit: string | null; ordered: number; delivered: number; remaining: number }[];
}

interface InvoiceRow {
  id: string;
  soNumber: string;
  customerPoNumber: string;
  customerName: string;
  value: number;
  deliveredShare: number;
  stage: string;
  items: { description: string; quantity: number; unit: string | null }[];
}

interface Data {
  quotations: Quote[];
  quotationValue: number;
  delivery: DeliveryRow[];
  deliveryItems: number;
  debt: DeliveryRow[];
  debtItems: number;
  invoicing: InvoiceRow[];
  invoicingValue: number;
}

type Tab = "quote" | "delivery" | "debt" | "invoice";

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
const compact = (n: number) =>
  n >= 1e9 ? `Rp ${(n / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 2 })} M` : n >= 1e6 ? `Rp ${(n / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt` : idr(n);
const tgl = (d: string | null) => (d ? new Date(d).toLocaleDateString("id-ID") : "-");

// Sales outstanding at a glance, following a deal from quotation to PO to delivery to invoice.
export function SalesBoard() {
  const { me } = usePermissions();
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);
  const [debtFor, setDebtFor] = useState<string | null>(null);
  const [debtNote, setDebtNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    fetch("/api/sales/outstanding", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null));

  useEffect(() => {
    load();
  }, []);

  const debtAction = async (soId: string, action: "acknowledge" | "clear") => {
    setBusy(soId);
    setError(null);
    try {
      const res = await fetch(`/api/sales-orders/${soId}/delivery-debt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: debtNote }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Gagal menyimpan");
      setDebtFor(null);
      setDebtNote("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setBusy(null);
    }
  };

  if (!data) return null;

  const canInvoice = !!me && (me.perms.finance === "edit");
  const tiles: { key: Tab; label: string; value: number; unit: string; sub: string }[] = [
    { key: "quote", label: "Penawaran belum jadi PO", value: data.quotations.length, unit: "penawaran", sub: data.quotations.length ? compact(data.quotationValue) : "tidak ada" },
    { key: "delivery", label: "SO belum dikirim", value: data.delivery.length, unit: "SO", sub: `${data.deliveryItems} item` },
    { key: "debt", label: "Hutang kirim", value: data.debt.length, unit: "SO", sub: `${data.debtItems} item terutang` },
    { key: "invoice", label: "SO belum di-invoice", value: data.invoicing.length, unit: "SO", sub: data.invoicing.length ? compact(data.invoicingValue) : "tidak ada" },
  ];
  const active: Tab = tab ?? tiles.find((t) => t.value > 0)?.key ?? "quote";
  const nothing = tiles.every((t) => t.value === 0);

  return (
    <section className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`border bg-white px-4 py-3 text-left transition-colors ${active === t.key ? "border-slate-900" : "border-slate-200 hover:border-slate-400"}`}
          >
            <p className="text-xs text-slate-500">{t.label}</p>
            <p className="mt-1 flex items-baseline gap-1.5">
              <span className={`text-2xl font-semibold tabular-nums ${t.value > 0 ? "text-slate-900" : "text-slate-400"}`}>{t.value}</span>
              <span className="text-xs text-slate-500">{t.unit}</span>
            </p>
            <p className="text-xs text-slate-500">{t.sub}</p>
          </button>
        ))}
      </div>

      {nothing ? (
        <p className="border border-slate-200 bg-white px-5 py-4 text-sm text-slate-500">Tidak ada pekerjaan sales yang menunggu.</p>
      ) : (
        <div className="border border-slate-200 bg-white">
          {active === "quote" && (
            <ul className="divide-y divide-slate-200">
              {data.quotations.length === 0 && <li className="px-5 py-4 text-sm text-slate-400">Semua penawaran yang terbit sudah jadi PO atau ditutup.</li>}
              {data.quotations.map((q) => (
                <li key={q.id} className="px-5 py-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">
                        <Link href={`/sales/quotations/${q.id}`} className="font-mono hover:underline">{q.number}</Link>
                        <span className="font-normal text-slate-500"> · {q.customerName} · {idr(q.value)}</span>
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-slate-500">Terbit {tgl(q.quotationDate)} ({q.ageDays} hari)</span>
                        {q.status === "accepted" && <span className="bg-blue-100 px-1.5 py-0.5 font-medium text-blue-800">Disetujui, PO customer belum diinput</span>}
                        {q.status === "sent" && q.expired && <span className="bg-red-100 px-1.5 py-0.5 font-medium text-red-800">Masa berlaku habis</span>}
                        {q.followUpOverdue && <span className="bg-red-100 px-1.5 py-0.5 font-medium text-red-800">Follow-up terlewat {tgl(q.nextFollowUpAt)}</span>}
                        {!q.nextFollowUpAt && q.status === "sent" && <span className="bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800">Belum ada jadwal follow-up</span>}
                        {q.nextFollowUpAt && !q.followUpOverdue && <span className="text-slate-500">Follow-up {tgl(q.nextFollowUpAt)}</span>}
                        {q.salesPic && <span className="text-slate-500">· Sales {q.salesPic}</span>}
                      </div>
                      <ul className="mt-1.5 space-y-0.5 text-xs text-slate-600">
                        {q.items.map((i, idx) => (
                          <li key={idx} className="flex justify-between gap-3 border-t border-slate-100 pt-0.5">
                            <span className="min-w-0 truncate">{i.description}</span>
                            <span className="shrink-0 tabular-nums text-slate-500">{i.quantity} {i.unit || ""}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="flex gap-2">
                      <Link href={`/sales/orders/new?quotationId=${q.id}`} className="bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">Input PO customer</Link>
                      <Link href="/sales/pipeline" className="border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Atur follow-up</Link>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {active === "delivery" && (
            <ul className="divide-y divide-slate-200">
              {data.delivery.length === 0 && <li className="px-5 py-4 text-sm text-slate-400">Semua barang sudah terkirim.</li>}
              {data.delivery.map((d) => (
                <li key={d.id} className="px-5 py-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">
                        <Link href={`/sales/orders/${d.id}`} className="font-mono hover:underline">{d.soNumber}</Link>
                        <span className="font-normal text-slate-500"> · {d.customerName} · PO {d.customerPoNumber}</span>
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                        <span className="bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">{d.stage}</span>
                        {d.deliveryDate && (
                          <span className={d.late ? "bg-red-100 px-1.5 py-0.5 font-medium text-red-800" : "text-slate-500"}>
                            {d.late ? "Lewat jadwal kirim " : "Kirim "}{tgl(d.deliveryDate)}
                          </span>
                        )}
                        {d.hasDelivery && <span className="text-slate-500">sudah ada surat jalan sebagian</span>}
                      </div>
                      <ul className="mt-1.5 space-y-0.5 text-xs text-slate-600">
                        {d.lines.map((l, idx) => (
                          <li key={idx} className="flex justify-between gap-3 border-t border-slate-100 pt-0.5">
                            <span className="min-w-0 truncate">{l.description}</span>
                            <span className="shrink-0 tabular-nums text-slate-500">terkirim {l.delivered} dari {l.ordered} {l.unit || ""}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="flex gap-2">
                      <Link href={`/sales/delivery/new?soId=${d.id}`} className="bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">Buat surat jalan</Link>
                      {d.hasDelivery && (
                        <button type="button" onClick={() => { setDebtFor(debtFor === d.id ? null : d.id); setDebtNote(""); setError(null); }} className="border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                          Tandai hutang kirim
                        </button>
                      )}
                    </div>
                  </div>
                  {debtFor === d.id && (
                    <div className="mt-3 space-y-2 border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs text-slate-600">
                        Pakai ini bila sebagian barang sudah dikirim dan di-BAST, invoice mengikuti penuh, tapi sisanya masih terutang ke customer (mis. stok kurang). SO pindah ke daftar Hutang kirim sampai sisanya dikirim.
                      </p>
                      <input value={debtNote} onChange={(e) => setDebtNote(e.target.value)} placeholder="Alasan, mis. stok kurang 1 pcs per item" className="w-full border border-slate-300 px-2 py-1.5 text-sm" />
                      {error && <p className="text-sm text-red-700">{error}</p>}
                      <div className="flex gap-2">
                        <button type="button" disabled={busy === d.id} onClick={() => debtAction(d.id, "acknowledge")} className="bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
                          {busy === d.id ? "Menyimpan…" : "Simpan hutang kirim"}
                        </button>
                        <button type="button" onClick={() => setDebtFor(null)} className="border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700">Batal</button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {active === "debt" && (
            <ul className="divide-y divide-slate-200">
              {data.debt.length === 0 && <li className="px-5 py-4 text-sm text-slate-400">Tidak ada hutang kirim.</li>}
              {data.debt.map((d) => (
                <li key={d.id} className="px-5 py-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">
                        <Link href={`/sales/orders/${d.id}`} className="font-mono hover:underline">{d.soNumber}</Link>
                        <span className="font-normal text-slate-500"> · {d.customerName} · PO {d.customerPoNumber}</span>
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        <span className="bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800">Hutang kirim sejak {tgl(d.debtAt)}</span>
                        {d.debtNote && <span className="ml-2 text-slate-500">{d.debtNote}</span>}
                      </p>
                      <ul className="mt-1.5 space-y-0.5 text-xs text-slate-600">
                        {d.lines.map((l, idx) => (
                          <li key={idx} className="flex justify-between gap-3 border-t border-slate-100 pt-0.5">
                            <span className="min-w-0 truncate">{l.description}{l.partNumber ? ` (${l.partNumber})` : ""}</span>
                            <span className="shrink-0 tabular-nums text-slate-500">terutang {l.remaining} {l.unit || ""} (terkirim {l.delivered} dari {l.ordered})</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="flex gap-2">
                      <Link href={`/sales/delivery/new?soId=${d.id}`} className="bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">Kirim sisa</Link>
                      <button type="button" disabled={busy === d.id} onClick={() => debtAction(d.id, "clear")} className="border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                        Batalkan hutang kirim
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {active === "invoice" && (
            <ul className="divide-y divide-slate-200">
              {data.invoicing.length === 0 && <li className="px-5 py-4 text-sm text-slate-400">Semua SO sudah punya invoice.</li>}
              {data.invoicing.map((o) => (
                <li key={o.id} className="px-5 py-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">
                        <Link href={`/sales/orders/${o.id}`} className="font-mono hover:underline">{o.soNumber}</Link>
                        <span className="font-normal text-slate-500"> · {o.customerName} · {idr(o.value)}</span>
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                        <span className="bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">{o.stage}</span>
                        <span className="text-slate-500">{o.deliveredShare}% terkirim</span>
                      </div>
                      <ul className="mt-1.5 space-y-0.5 text-xs text-slate-600">
                        {o.items.map((i, idx) => (
                          <li key={idx} className="flex justify-between gap-3 border-t border-slate-100 pt-0.5">
                            <span className="min-w-0 truncate">{i.description}</span>
                            <span className="shrink-0 tabular-nums text-slate-500">{i.quantity} {i.unit || ""}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    {canInvoice ? (
                      <Link href={`/finance/invoices/new?soId=${o.id}`} className="bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">Buat invoice</Link>
                    ) : (
                      <span className="text-xs text-slate-500">Invoice dibuat oleh Finance</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
