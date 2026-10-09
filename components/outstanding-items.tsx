"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Line {
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

interface Group {
  key: string;
  partNumber: string | null;
  description: string;
  unit: string | null;
  total: number;
  lines: Line[];
}

export function OutstandingItems({ embedded = false }: { embedded?: boolean } = {}) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[] | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sales-orders/outstanding-items")
      .then((r) => (r.ok ? r.json() : []))
      .then(setLines)
      .catch(() => setLines([]));
  }, []);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, Group>();
    for (const l of lines ?? []) {
      const hay = [l.partNumber, l.description, l.soNumber, l.customerName, l.customerPoNumber].map((v) => (v || "").toLowerCase());
      if (q && !hay.some((h) => h.includes(q))) continue;
      const key = `${(l.partNumber || l.description).trim().toLowerCase()}|${(l.unit || "").toLowerCase()}`;
      const g = map.get(key) ?? { key, partNumber: l.partNumber, description: l.description, unit: l.unit, total: 0, lines: [] };
      g.total += l.quantity;
      g.lines.push(l);
      map.set(key, g);
    }
    return [...map.values()];
  }, [lines, query]);

  if (!lines || lines.length === 0) return null;

  const soCount = new Set(lines.map((l) => l.soId)).size;
  const selectable = (l: Line) => !l.inquiry;
  const toggle = (ids: string[]) =>
    setSelected((prev) => (ids.every((id) => prev.includes(id)) ? prev.filter((x) => !ids.includes(x)) : [...new Set([...prev, ...ids])]));

  const requestQuotes = async () => {
    setBusy(true);
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
      setBusy(false);
    }
  };

  return (
    <section className={embedded ? "" : "border border-slate-200 border-l-2 border-l-teal-500 bg-white"}>
      {!embedded && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Item belum dipesan ({lines.length} item dari {soCount} SO)
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Semua item SO terbuka yang belum punya PO, digabung per barang. Centang item lalu minta penawaran ke beberapa vendor sekaligus, tanpa membuat PO dulu.
            </p>
          </div>
          <button type="button" onClick={() => setOpen(!open)} className="text-sm text-slate-500 hover:text-slate-900">
            {open ? "Sembunyikan" : "Tampilkan"}
          </button>
        </div>
      )}

      {(open || embedded) && (
        <>
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari part number, nama barang, SO, atau customer…"
              className="min-w-64 flex-1 border border-slate-300 px-3 py-1.5 text-sm"
            />
            <button
              type="button"
              disabled={selected.length === 0 || busy}
              onClick={requestQuotes}
              className="bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy ? "Membuat…" : `Minta penawaran vendor (${selected.length} item)`}
            </button>
          </div>
          {error && <p className="border-b border-red-200 bg-red-50 px-5 py-2 text-sm text-red-800">{error}</p>}

          {groups.length === 0 ? (
            <p className="px-5 py-5 text-sm text-slate-400">Tidak ada item yang cocok.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    <th className="w-10 px-5 py-2" />
                    <th className="px-2 py-2">Part number</th>
                    <th className="px-2 py-2">Barang</th>
                    <th className="px-2 py-2 text-right">Qty</th>
                    <th className="px-2 py-2">Satuan</th>
                    <th className="px-5 py-2">Dibutuhkan untuk</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => {
                    const ids = g.lines.filter(selectable).map((l) => l.soItemId);
                    return (
                      <tr key={g.key} className="border-b border-slate-100 align-top">
                        <td className="px-5 py-2">
                          <input
                            type="checkbox"
                            disabled={ids.length === 0}
                            checked={ids.length > 0 && ids.every((id) => selected.includes(id))}
                            onChange={() => toggle(ids)}
                            aria-label={`Pilih ${g.description}`}
                            className="h-4 w-4"
                          />
                        </td>
                        <td className="px-2 py-2 font-mono text-xs text-slate-600">{g.partNumber || "-"}</td>
                        <td className="px-2 py-2 text-slate-900">{g.description}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{g.total}</td>
                        <td className="px-2 py-2 text-slate-500">{g.unit || "-"}</td>
                        <td className="px-5 py-2 text-xs text-slate-600">
                          {g.lines.map((l) => (
                            <p key={l.soItemId}>
                              <Link href={`/supply-chain/sales-orders/${l.soId}`} className="font-mono hover:underline">{l.soNumber}</Link>
                              {` · ${l.quantity} ${l.unit || ""} · ${l.customerName}`}
                              {l.deliveryDate ? ` · kirim ${new Date(l.deliveryDate).toLocaleDateString("id-ID")}` : ""}
                              {l.inquiry && (
                                <>
                                  {" "}· <Link href={`/supply-chain/price-inquiries/${l.inquiry.id}`} className="text-teal-700 hover:underline">sedang minta penawaran {l.inquiry.number}</Link>
                                </>
                              )}
                            </p>
                          ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
