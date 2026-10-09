"use client";

import { useState } from "react";
import Link from "next/link";

export interface GoodsPo {
  poId: string;
  poNumber: string;
  status: string;
  supplierName: string;
  deliveryDate: string | null;
  progress: number;
  draftGr: { id: string; receiptNumber: string } | null;
  lines: { id: string; description: string; unit: string | null; ordered: number; received: number }[];
}

// PO lines not yet received. Tick what arrived (and adjust the quantity if only part came),
// then mark received: the goods receipt, stock and outstanding list update straight away.
export function ScmReceiving({ pos, onChanged }: { pos: GoodsPo[]; onChanged: () => void }) {
  const [picked, setPicked] = useState<Record<string, Record<string, string>>>({}); // poId -> lineId -> qty text
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<{ poId: string; text: string } | null>(null);

  const toggle = (poId: string, line: GoodsPo["lines"][number]) =>
    setPicked((prev) => {
      const cur = { ...(prev[poId] ?? {}) };
      if (line.id in cur) delete cur[line.id];
      else cur[line.id] = String(line.ordered - line.received);
      return { ...prev, [poId]: cur };
    });

  const toggleAll = (po: GoodsPo) =>
    setPicked((prev) => {
      const cur = prev[po.poId] ?? {};
      const all = po.lines.every((l) => l.id in cur);
      return { ...prev, [po.poId]: all ? {} : Object.fromEntries(po.lines.map((l) => [l.id, String(l.ordered - l.received)])) };
    });

  const submit = async (po: GoodsPo) => {
    const sel = picked[po.poId] ?? {};
    const items = Object.entries(sel).map(([poItemId, q]) => ({ poItemId, quantity: Number(q) }));
    if (!items.length) return;
    setBusyId(po.poId);
    setError(null);
    try {
      const res = await fetch(`/api/purchase-orders/${po.poId}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Gagal mencatat penerimaan");
      setPicked((prev) => ({ ...prev, [po.poId]: {} }));
      onChanged();
    } catch (e) {
      setError({ poId: po.poId, text: e instanceof Error ? e.message : "Gagal mencatat penerimaan" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ul className="divide-y divide-slate-200">
      {pos.length === 0 && <li className="px-5 py-4 text-sm text-slate-400">Semua barang sudah diterima.</li>}
      {pos.map((po) => {
        const sel = picked[po.poId] ?? {};
        const count = Object.keys(sel).length;
        return (
          <li key={po.poId} className="px-5 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-slate-900">
                  <Link href={`/supply-chain/purchase-orders/${po.poId}`} className="hover:underline">{po.poNumber}</Link>
                  <span className="font-normal text-slate-500"> · {po.supplierName}</span>
                  {po.deliveryDate && <span className="font-normal text-slate-500"> · tiba {new Date(po.deliveryDate).toLocaleDateString("id-ID")}</span>}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 w-32 bg-slate-100"><div className="h-1.5 bg-teal-500" style={{ width: `${po.progress}%` }} /></div>
                  <span className="text-xs text-slate-500">{po.progress}% diterima</span>
                  {po.draftGr && (
                    <Link href={`/supply-chain/goods-receipts/${po.draftGr.id}`} className="text-xs text-slate-500 underline">
                      draft {po.draftGr.receiptNumber}
                    </Link>
                  )}
                </div>
              </div>
              <button
                type="button"
                disabled={count === 0 || busyId === po.poId}
                onClick={() => submit(po)}
                className="bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {busyId === po.poId ? "Memproses…" : count ? `Tandai diterima (${count} item)` : "Centang item yang sudah datang"}
              </button>
            </div>
            <table className="mt-1 w-full">
              <tbody>
                {po.lines.map((l) => {
                  const remaining = l.ordered - l.received;
                  const on = l.id in sel;
                  return (
                    <tr key={l.id} className="border-t border-slate-100">
                      <td className="w-8 py-1.5">
                        <input type="checkbox" className="h-4 w-4" checked={on} onChange={() => toggle(po.poId, l)} aria-label={`Pilih ${l.description}`} />
                      </td>
                      <td className="py-1.5 text-slate-900">{l.description}</td>
                      <td className="w-32 py-1.5 text-right tabular-nums text-slate-500">{l.received}/{l.ordered} {l.unit || ""}</td>
                      <td className="w-28 py-1.5 pl-3">
                        {on && (
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={sel[l.id]}
                            onChange={(e) => setPicked((prev) => ({ ...prev, [po.poId]: { ...(prev[po.poId] ?? {}), [l.id]: e.target.value } }))}
                            className="w-full border border-slate-300 px-2 py-1 text-right text-sm"
                            aria-label={`Qty diterima ${l.description}`}
                          />
                        )}
                        {!on && <span className="text-xs text-slate-400">sisa {remaining}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {po.lines.length > 1 && (
              <button type="button" onClick={() => toggleAll(po)} className="mt-1 text-xs text-slate-500 underline">
                {po.lines.every((l) => l.id in sel) ? "Batal pilih semua" : "Pilih semua (diterima penuh)"}
              </button>
            )}
            {error?.poId === po.poId && <p className="mt-2 text-sm text-red-700">{error.text}</p>}
          </li>
        );
      })}
    </ul>
  );
}
