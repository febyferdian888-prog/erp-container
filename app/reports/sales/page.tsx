"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Aging, type AgingData } from "./aging";

interface Report {
  limited?: boolean;
  pipeline: {
    funnel: { key: string; label: string; count: number; value: number | null }[];
    customers: { name: string; soCount: number; soValue: number; invoicedNet: number; invoicedTax: number; invoiced: number; paid: number }[];
    stalledRfqs: { id: string; number: string; customer: string; date: string }[];
    notDelivered: { id: string; soNumber: string; poNumber: string; customer: string; value: number; date: string }[];
    notInvoiced: { id: string; soNumber: string; poNumber: string; customer: string; value: number; date: string }[];
  };
  aging: AgingData;
  payables: AgingData;
  margin: {
    rows: {
      id: string; soNumber: string; poNumber: string; customer: string; revenue: number;
      cost: number | null; poCount: number; billCount: number; margin: number | null; marginPct: number | null;
      costActual: number; costCommitted: number; costDraftOnly: number; costIsAllocated: boolean; costIsFinal: boolean;
    }[];
    coveredCount: number;
    totalCount: number;
    coveredRevenue: number;
    coveredCost: number;
    draftOnlyCount: number;
    allocatedCount: number;
  };
}

const TABS = [
  { key: "pipeline", label: "Pipeline penjualan" },
  { key: "aging", label: "Aging piutang" },
  { key: "payables", label: "Aging utang" },
  { key: "margin", label: "Margin per Sales Order" },
] as const;

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
const date = (d: string | null) => (d ? new Date(d).toLocaleDateString("id-ID") : "-");

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="border border-slate-200 bg-white p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{value}</p>
      {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{title}</h3>
        {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

const th = "px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400";
const thr = th.replace("text-left", "text-right");
const td = "px-4 py-2 text-sm text-slate-700";
const tdr = `${td} text-right tabular-nums`;

export default function SalesReportsPage() {
  const { status } = useSession();
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("pipeline");
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/login");
    if (status === "authenticated") {
      fetch("/api/reports/sales")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Gagal memuat laporan"))))
        .then(setData)
        .catch((e) => setError(e.message));
    }
  }, [status, router]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <Link href="/reports" className="text-sm text-slate-500 hover:text-slate-900">
            ← Laporan
          </Link>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Laporan penjualan dan utang</h1>
          <p className="mt-1 text-slate-600">Posisi RFQ sampai pembayaran, piutang, utang vendor, dan margin.</p>
        </div>

        <div className="flex gap-6 border-b border-slate-200">
          {TABS.filter((t) => !data?.limited || t.key === "pipeline").map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px border-b-2 pb-3 text-sm font-medium ${
                tab === t.key ? "border-brand text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && <div className="border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
        {!data && !error && <p className="py-12 text-center text-slate-500">Memuat…</p>}

        {data && tab === "pipeline" && <Pipeline d={data.pipeline} />}
        {data && tab === "aging" && <Aging d={data.aging} />}
        {data && tab === "payables" && <Aging d={data.payables} kind="utang" />}
        {data && tab === "margin" && <Margin d={data.margin} />}
      </div>
    </DashboardLayout>
  );
}

function Pipeline({ d }: { d: Report["pipeline"] }) {
  const max = Math.max(...d.funnel.map((f) => f.count), 1);
  return (
    <div className="space-y-6">
      <Section title="Tahapan" hint="Jumlah dokumen di tiap tahap, dan nilainya bila ada.">
        <ul className="divide-y divide-slate-100">
          {d.funnel.map((f) => (
            <li key={f.key} className="grid grid-cols-[minmax(0,12rem)_1fr_auto] items-center gap-4 px-5 py-3">
              <span className="text-sm text-slate-700">{f.label}</span>
              <div className="h-2 bg-slate-100">
                <div className="h-2 bg-slate-800" style={{ width: `${(f.count / max) * 100}%` }} />
              </div>
              <span className="text-right text-sm tabular-nums text-slate-900">
                <b className="font-semibold">{f.count}</b>
                {f.value !== null && <span className="ml-3 text-slate-500">{idr(f.value)}</span>}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <div className="grid gap-6 lg:grid-cols-3">
        <ActionList title="RFQ belum dibuat quotation" rows={d.stalledRfqs.map((r) => ({ id: r.id, href: `/sales/rfq/${r.id}`, a: r.number, b: r.customer, c: date(r.date) }))} />
        <ActionList title="SO belum dikirim" rows={d.notDelivered.map((r) => ({ id: r.id, href: `/sales/orders/${r.id}`, a: r.soNumber, b: r.customer, c: idr(r.value) }))} />
        <ActionList title="Sudah dikirim, belum ditagih" rows={d.notInvoiced.map((r) => ({ id: r.id, href: `/sales/orders/${r.id}`, a: r.soNumber, b: r.customer, c: idr(r.value) }))} />
      </div>

      <Section title="Per customer" hint="Nilai SO tidak memuat PPN. Bandingkan dengan kolom Ditagih (sebelum PPN). Dibayar sudah termasuk PPN dan PPh 23 yang dipotong customer, jadi Belum dibayar = Ditagih (termasuk PPN) dikurangi Dibayar.">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200">
              <th className={th}>Customer</th>
              <th className={thr}>SO</th>
              <th className={thr}>Nilai SO (sebelum PPN)</th>
              <th className={thr}>Ditagih (sebelum PPN)</th>
              <th className={thr}>PPN</th>
              <th className={thr}>Ditagih (termasuk PPN)</th>
              <th className={thr}>Dibayar</th>
              <th className={thr}>Belum dibayar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {d.customers.map((c) => (
              <tr key={c.name}>
                <td className={td}>{c.name}</td>
                <td className={tdr}>{c.soCount}</td>
                <td className={tdr}>{idr(c.soValue)}</td>
                <td className={tdr}>{idr(c.invoicedNet)}</td>
                <td className={tdr}>{idr(c.invoicedTax)}</td>
                <td className={tdr}>{idr(c.invoiced)}</td>
                <td className={tdr}>{idr(c.paid)}</td>
                <td className={`${tdr} font-medium ${c.invoiced - c.paid > 0.5 ? "text-slate-900" : "text-slate-400"}`}>
                  {idr(Math.max(c.invoiced - c.paid, 0))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

function ActionList({ title, rows }: { title: string; rows: { id: string; href: string; a: string; b: string; c: string }[] }) {
  return (
    <Section title={`${title} (${rows.length})`}>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-400">Tidak ada.</p>
      ) : (
        <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={r.href} className="block px-5 py-2.5 hover:bg-slate-50">
                <span className="block truncate font-mono text-xs text-slate-900">{r.a}</span>
                <span className="flex justify-between gap-3 text-xs text-slate-500">
                  <span className="truncate">{r.b}</span>
                  <span className="shrink-0 tabular-nums">{r.c}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

interface ItemTrace {
  soNumber: string;
  poNumber: string;
  customerName: string;
  items: {
    lineNumber: number;
    partNumber: string | null;
    description: string;
    qty: number;
    sellPrice: number;
    sellSubtotal: number;
    avgBuyPrice: number | null;
    marginPerUnit: number | null;
    marginPct: number | null;
    purchases: { billNumber: string; billDate: string; supplierName: string; quantity: number; unitPrice: number }[];
  }[];
}

function ItemTraceRows({ soId }: { soId: string }) {
  const [trace, setTrace] = useState<ItemTrace | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/reports/sales/${soId}/item-trace`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setTrace)
      .catch(() => setErr("Gagal memuat rincian item"));
  }, [soId]);

  if (err) return <tr><td colSpan={6} className="px-5 py-3 text-sm text-slate-400">{err}</td></tr>;
  if (!trace) return <tr><td colSpan={6} className="px-5 py-3 text-sm text-slate-400">Memuat rincian item…</td></tr>;

  return (
    <tr>
      <td colSpan={6} className="bg-slate-50/60 px-5 py-3">
        <table className="w-full bg-white">
          <thead>
            <tr className="border-b border-slate-200">
              <th className={th}>Part</th>
              <th className={th}>Deskripsi</th>
              <th className={thr}>Qty</th>
              <th className={thr}>Harga beli (rata²)</th>
              <th className={thr}>Harga jual</th>
              <th className={thr}>Margin/unit</th>
              <th className={th}>Dibeli dari</th>
              <th className={th}>Dijual ke</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {trace.items.map((it) => (
              <tr key={it.lineNumber}>
                <td className={`${td} font-mono text-xs`}>{it.partNumber || "-"}</td>
                <td className={td}>{it.description}</td>
                <td className={tdr}>{it.qty}</td>
                <td className={tdr}>{it.avgBuyPrice === null ? <span className="text-slate-300">belum ada beli</span> : idr(it.avgBuyPrice)}</td>
                <td className={tdr}>{idr(it.sellPrice)}</td>
                <td className={`${tdr} ${it.marginPerUnit !== null && it.marginPerUnit < 0 ? "text-brand" : ""}`}>
                  {it.marginPerUnit === null ? "-" : `${idr(it.marginPerUnit)} (${it.marginPct?.toFixed(1)}%)`}
                </td>
                <td className={td}>
                  {it.purchases.length === 0
                    ? "-"
                    : it.purchases.map((p, i) => (
                        <span key={i} className="block text-xs text-slate-500">
                          {p.supplierName} · {p.billNumber} · {idr(p.unitPrice)}
                        </span>
                      ))}
                </td>
                <td className={td}>{trace.customerName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </td>
    </tr>
  );
}

function Margin({ d }: { d: Report["margin"] }) {
  const margin = d.coveredRevenue - d.coveredCost;
  const pct = d.coveredRevenue > 0 ? (margin / d.coveredRevenue) * 100 : 0;
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Margin (SO yang ada biaya belinya)" value={idr(margin)} note={d.coveredCount ? `${pct.toFixed(1)}% dari ${idr(d.coveredRevenue)}` : "Belum ada data"} />
        <Stat label="SO dengan PO vendor" value={`${d.coveredCount} dari ${d.totalCount}`} />
        <Stat label="Total biaya beli" value={idr(d.coveredCost)} />
      </div>

      {d.coveredCount < d.totalCount && (
        <p className="border-l-2 border-brand bg-white px-4 py-3 text-sm text-slate-600">
          Margin dihitung dari harga jual SO dikurangi biaya beli: bill vendor yang sudah diinput (biaya aktual), atau nilai PO yang sudah dikirim/dikonfirmasi ke vendor bila belum ada bill (biaya komitmen). SO tanpa
          biaya ditampilkan tanpa margin, bukan dianggap untung penuh. Isi “For Sales Order” di PO atau “Untuk Sales Order” di bill agar biayanya masuk ke sini.
        </p>
      )}
      {!!d.draftOnlyCount && (
        <p className="border-l-2 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {d.draftOnlyCount} SO hanya punya biaya dari PO yang masih Draft (belum dikirim ke vendor) — PO draft bukan komitmen nyata, jadi sengaja tidak dihitung sebagai biaya di sini. SO itu tampil tanpa margin sampai PO-nya dikirim atau ada bill.
        </p>
      )}
      {!!d.allocatedCount && (
        <p className="border-l-2 border-slate-300 bg-white px-4 py-3 text-sm text-slate-600">
          {d.allocatedCount} SO berbagi satu PO gabungan dengan SO lain — biayanya dibagi proporsional menurut nilai jual masing-masing SO (estimasi, bukan alokasi item per item).
        </p>
      )}

      <Section title="Per Sales Order">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200">
              <th className={th}>SO</th>
              <th className={th}>Customer</th>
              <th className={thr}>Harga jual</th>
              <th className={thr}>Biaya beli</th>
              <th className={thr}>Margin</th>
              <th className={thr}>%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {d.rows.map((r) => (
              <Fragment key={r.id}>
                <tr className="cursor-pointer hover:bg-slate-50/60" onClick={() => setOpen(open === r.id ? null : r.id)}>
                  <td className={`${td} font-mono text-xs`}>
                    <Link href={`/sales/orders/${r.id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">{r.soNumber}</Link>
                    <span className="block text-slate-400">{r.poNumber}</span>
                  </td>
                  <td className={td}>{r.customer}</td>
                  <td className={tdr}>{idr(r.revenue)}</td>
                  <td className={tdr}>
                    {r.cost === null ? (
                      r.costDraftOnly > 0 ? (
                        <span className="text-amber-600">PO draft saja ({idr(r.costDraftOnly)})</span>
                      ) : (
                        <span className="text-slate-300">belum ada PO</span>
                      )
                    ) : (
                      <>
                        {idr(r.cost)}
                        <span className="block text-xs text-slate-400">
                          {r.costActual > 0 && `aktual ${idr(r.costActual)}`}
                          {r.costActual > 0 && r.costCommitted > 0 && " + "}
                          {r.costCommitted > 0 && `komitmen ${idr(r.costCommitted)}`}
                          {r.costIsAllocated && " · dibagi dari PO gabungan"}
                        </span>
                      </>
                    )}
                  </td>
                  <td className={`${tdr} font-medium ${r.margin !== null && r.margin < 0 ? "text-brand" : ""}`}>{r.margin === null ? "-" : idr(r.margin)}</td>
                  <td className={tdr}>
                    {r.marginPct === null ? "-" : `${r.marginPct.toFixed(1)}%`}
                    {r.margin !== null && !r.costIsFinal && <span className="block text-xs text-slate-400">belum final</span>}
                  </td>
                </tr>
                {open === r.id && <ItemTraceRows soId={r.id} />}
              </Fragment>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
