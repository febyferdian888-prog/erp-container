"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface OutstandingLine {
  soItemId: string;
  soId: string;
  soNumber: string;
  customerPoNumber: string;
  customerName: string;
  deliveryDate: string | null;
  partNumber: string | null;
  description: string;
  quantity: number;
  unit: string | null;
  itemNotes: string | null;
  inquiry: { id: string; number: string } | null;
}

export interface SoMeta {
  id: string;
  status: string;
  partiallyOrdered: boolean;
  existingPos: { poId: string; poNumber: string; supplierName: string }[];
}

// Sales orders with items nobody has bought yet, each listed with its missing lines. Tick lines
// to start a PO for just those, or to ask several vendors for a quote.
export function ScmUnpo({ lines, metas, onChanged }: { lines: OutstandingLine[]; metas: SoMeta[]; onChanged: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const orders = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, { id: string; soNumber: string; customerName: string; customerPoNumber: string; deliveryDate: string | null; lines: OutstandingLine[] }>();
    for (const l of lines) {
      const hay = [l.partNumber, l.description, l.soNumber, l.customerName, l.customerPoNumber].map((v) => (v || "").toLowerCase());
      if (q && !hay.some((h) => h.includes(q))) continue;
      const o = map.get(l.soId) ?? { id: l.soId, soNumber: l.soNumber, customerName: l.customerName, customerPoNumber: l.customerPoNumber, deliveryDate: l.deliveryDate, lines: [] };
      o.lines.push(l);
      map.set(l.soId, o);
    }
    return [...map.values()];
  }, [lines, query]);

  const toggle = (ids: string[]) =>
    setSelected((prev) => (ids.every((id) => prev.includes(id)) ? prev.filter((x) => !ids.includes(x)) : [...new Set([...prev, ...ids])]));

  const requestQuotes = async () => {
    setBusy("quote");
    setError(null);
    try {
      const res = await fetch("/api/price-inquiries/from-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ soItemIds: selected }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Gagal membuat permintaan penawaran");
      router.push(`/supply-chain/price-inquiries/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal membuat permintaan penawaran");
      setBusy(null);
    }
  };

  const skip = async (soId: string, soNumber: string) => {
    if (!confirm(`Tandai sisa item ${soNumber} tidak perlu dibeli (dipenuhi dari stok)?`)) return;
    setBusy(soId);
    try {
      const res = await fetch(`/api/sales-orders/${soId}/skip-procurement`, { method: "POST" });
      if (res.ok) onChanged();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari part number, barang, SO, atau customer…"
          className="min-w-64 flex-1 border border-slate-300 px-3 py-1.5 text-sm"
        />
        <button
          type="button"
          disabled={selected.length === 0 || busy === "quote"}
          onClick={requestQuotes}
          className="border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {busy === "quote" ? "Membuat…" : `Minta penawaran vendor (${selected.length})`}
        </button>
      </div>
      {error && <p className="border-b border-red-200 bg-red-50 px-5 py-2 text-sm text-red-800">{error}</p>}

      {orders.length === 0 && <p className="px-5 py-5 text-sm text-slate-400">Tidak ada item yang cocok.</p>}
      <ul className="divide-y divide-slate-200">
        {orders.map((o) => {
          const meta = metas.find((m) => m.id === o.id);
          const free = o.lines.filter((l) => !l.inquiry).map((l) => l.soItemId);
          const picked = o.lines.filter((l) => selected.includes(l.soItemId)).map((l) => l.soItemId);
          const poIds = picked.length ? picked : o.lines.map((l) => l.soItemId);
          return (
            <li key={o.id} className="px-5 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">
                    <Link href={`/supply-chain/sales-orders/${o.id}`} className="hover:underline">{o.soNumber}</Link>
                    <span className="font-normal text-slate-500"> · {o.customerName} · PO {o.customerPoNumber}</span>
                    {o.deliveryDate && <span className="font-normal text-slate-500"> · kirim {new Date(o.deliveryDate).toLocaleDateString("id-ID")}</span>}
                  </p>
                  {meta && meta.existingPos.length > 0 && (
                    <p className="text-xs text-slate-500">
                      Sudah di PO:{" "}
                      {meta.existingPos.map((p, i) => (
                        <span key={p.poId}>{i > 0 ? ", " : ""}<Link href={`/supply-chain/purchase-orders/${p.poId}`} className="hover:underline">{p.poNumber}</Link> ({p.supplierName})</span>
                      ))}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/supply-chain/purchase-orders/new?soId=${o.id}&itemIds=${poIds.join(",")}`}
                    className="bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                  >
                    {picked.length ? `Buat PO (${picked.length} item)` : "Buat PO"}
                  </Link>
                  <button
                    type="button"
                    disabled={busy === o.id}
                    onClick={() => skip(o.id, o.soNumber)}
                    className="border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Tidak perlu beli
                  </button>
                </div>
              </div>
              <table className="mt-2 w-full text-sm">
                <tbody>
                  {o.lines.map((l) => (
                    <tr key={l.soItemId} className="border-t border-slate-100">
                      <td className="w-8 py-1.5">
                        <input type="checkbox" checked={selected.includes(l.soItemId)} disabled={!!l.inquiry} onChange={() => toggle([l.soItemId])} className="h-4 w-4" aria-label={`Pilih ${l.description}`} />
                      </td>
                      <td className="w-40 py-1.5 font-mono text-xs text-slate-500">{l.partNumber || "-"}</td>
                      <td className="py-1.5 text-slate-900">
                        {l.description}
                        {l.itemNotes && <span className="block text-xs text-slate-400">{l.itemNotes}</span>}
                      </td>
                      <td className="w-24 py-1.5 text-right tabular-nums">{l.quantity} {l.unit || ""}</td>
                      <td className="w-56 py-1.5 pl-3 text-xs text-teal-700">
                        {l.inquiry && <Link href={`/supply-chain/price-inquiries/${l.inquiry.id}`} className="hover:underline">minta penawaran {l.inquiry.number}</Link>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {free.length > 1 && (
                <button type="button" onClick={() => toggle(free)} className="mt-1 text-xs text-slate-500 underline">
                  {free.every((id) => selected.includes(id)) ? "Batal pilih semua" : "Pilih semua item SO ini"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
