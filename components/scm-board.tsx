"use client";

import { useCallback, useEffect, useState } from "react";
import { ScmUnpo, type OutstandingLine, type SoMeta } from "@/components/scm-unpo";
import { ScmPoActions, type QueueRow } from "@/components/scm-po-actions";
import { ScmInvoicing, type InvoicingPo } from "@/components/scm-invoicing";
import { ScmReceiving, type GoodsPo } from "@/components/scm-receiving";

interface Summary {
  invoicing: InvoicingPo[];
  invoicingItems: number;
  goods: GoodsPo[];
  goodsItems: number;
  grWaiting: number;
}

type Tab = "unpo" | "action" | "invoice" | "gr";

// Supply Chain at a glance: four counts, each opening an item-level list SCM can act on.
export function ScmBoard() {
  const [lines, setLines] = useState<OutstandingLine[] | null>(null);
  const [metas, setMetas] = useState<SoMeta[]>([]);
  const [queue, setQueue] = useState<QueueRow[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);

  const load = useCallback(async () => {
    const get = (url: string) => fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const [l, m, q, s] = await Promise.all([
      get("/api/sales-orders/outstanding-items"),
      get("/api/sales-orders/procurement-queue"),
      get("/api/purchase-orders/queue"),
      get("/api/purchase-orders/scm-summary"),
    ]);
    setLines(l ?? []);
    setMetas(m ?? []);
    setQueue(q ?? []);
    setSummary(s ?? { invoicing: [], invoicingItems: 0, goods: [], goodsItems: 0, grWaiting: 0 });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!lines || !queue || !summary) return null;

  const unpoSos = new Set(lines.map((l) => l.soId)).size;
  const mine = queue.filter((q) => q.owner === "scm").length;

  const tiles: { key: Tab; label: string; value: number; unit: string; sub: string }[] = [
    { key: "unpo", label: "SO belum di-PO", value: lines.length, unit: "item", sub: `${unpoSos} SO` },
    { key: "action", label: "PO perlu tindakan", value: queue.length, unit: "PO", sub: `${mine} tindakan SCM` },
    { key: "invoice", label: "PO belum ada tagihan", value: summary.invoicingItems, unit: "item", sub: `${summary.invoicing.length} PO` },
    { key: "gr", label: "Item belum GR", value: summary.goodsItems, unit: "item", sub: summary.grWaiting > 0 ? `${summary.grWaiting} GR menunggu cek` : `${summary.goods.length} PO` },
  ];

  const active: Tab = tab ?? tiles.find((t) => t.value > 0)?.key ?? "unpo";
  const nothing = tiles.every((t) => t.value === 0);

  return (
    <section className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
        <p className="border border-slate-200 bg-white px-5 py-4 text-sm text-slate-500">Tidak ada tugas SCM yang menunggu.</p>
      ) : (
        <div className="border border-slate-200 bg-white">
          {active === "unpo" && <ScmUnpo lines={lines} metas={metas} onChanged={load} />}
          {active === "action" && <ScmPoActions rows={queue} onChanged={load} />}
          {active === "invoice" && <ScmInvoicing pos={summary.invoicing} onChanged={load} />}
          {active === "gr" && <ScmReceiving pos={summary.goods} onChanged={load} />}
        </div>
      )}
    </section>
  );
}
