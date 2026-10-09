"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface QueueRow {
  id: string;
  soNumber: string;
  poNumber: string;
  poDate: string;
  deliveryDate: string | null;
  status: string;
  customerName: string;
  itemCount: number;
  outstandingCount: number;
  partiallyOrdered: boolean;
  outstandingItems: { description: string; quantity: number; unit: string | null }[];
  existingPos: { poId: string; poNumber: string; supplierName: string }[];
}


export function ProcurementQueue({ embedded = false }: { embedded?: boolean } = {}) {
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const load = useCallback(async () => {
    const res = await fetch("/api/sales-orders/procurement-queue");
    setRows(res.ok ? await res.json() : []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const skip = async (row: QueueRow) => {
    if (!confirm(row.partiallyOrdered ? `Tandai sisa item ${row.soNumber} tidak perlu pembelian? Item yang belum dipesan akan hilang dari daftar.` : `Tandai ${row.soNumber} tidak perlu pembelian? Order ini akan hilang dari daftar.`)) return;
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/sales-orders/${row.id}/skip-procurement`, { method: "POST" });
      if (res.ok) {
        setRows((prev) => (prev || []).filter((r) => r.id !== row.id));
        setSelected((prev) => prev.filter((x) => x !== row.id));
      }
    } finally {
      setBusyId(null);
    }
  };

  if (!rows || rows.length === 0) return null;

  return (
    <section className={embedded ? "" : "border border-slate-200 border-l-2 border-l-amber-400 bg-white"}>
      <div className={embedded ? "px-5 pt-3" : "border-b border-slate-200 px-5 py-3"}>
        {!embedded && (<>
<h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          Perlu diproses Purchasing ({rows.length})
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Sales order yang masih punya item belum dipesan, baik belum ada PO sama sekali maupun baru sebagian (satu SO bisa dipecah ke beberapa vendor). Buat PO dari item SO, atau tandai tidak perlu beli bila dipenuhi dari stok.
          Centang beberapa SO untuk satu PO gabungan ke vendor; item yang sama dijumlahkan.
        </p>

</>)}        {selected.length > 1 && (
          <Link
            href={`/supply-chain/purchase-orders/new?soIds=${selected.join(",")}`}
            className="mt-2 inline-block bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
          >
            Buat PO gabungan ({selected.length} SO)
          </Link>
        )}
      </div>
      <ul className="divide-y divide-slate-100">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
            <input
              type="checkbox"
              checked={selected.includes(r.id)}
              onChange={() => toggle(r.id)}
              aria-label={`Pilih ${r.soNumber} untuk PO gabungan`}
              className="h-4 w-4"
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-slate-900">
                <Link href={`/supply-chain/sales-orders/${r.id}`} className="hover:underline">{r.soNumber}</Link> <span className="font-normal text-slate-500">· PO {r.poNumber}</span>
              </p>
              <p className="text-xs text-slate-500">
                {r.customerName} · {r.partiallyOrdered ? `${r.outstandingCount} dari ${r.itemCount} item belum di-PO` : `${r.itemCount} item`}
                {r.deliveryDate ? ` · kirim ${new Date(r.deliveryDate).toLocaleDateString("id-ID")}` : ""}
                {r.status === "draft" ? " · SO masih draft" : ""}
              </p>
              {r.partiallyOrdered && (
                <div className="mt-1 text-xs text-slate-600">
                  <p>
                    Belum dipesan:{" "}
                    {r.outstandingItems.map((i) => `${i.description} (${i.quantity} ${i.unit || "pcs"})`).join(", ")}
                    {r.outstandingCount > r.outstandingItems.length ? `, dan ${r.outstandingCount - r.outstandingItems.length} lainnya` : ""}
                  </p>
                  {r.existingPos.length > 0 && (
                    <p className="text-slate-500">
                      Sudah di PO:{" "}
                      {r.existingPos.map((po, i) => (
                        <span key={po.poId}>
                          {i > 0 ? ", " : ""}
                          <Link href={`/supply-chain/purchase-orders/${po.poId}`} className="hover:underline">{po.poNumber}</Link> ({po.supplierName})
                        </span>
                      ))}
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Link
                href={`/supply-chain/purchase-orders/new?soId=${r.id}`}
                className="bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
              >
                {r.partiallyOrdered ? "Buat PO sisa item" : "Buat PO"}
              </Link>
              <button
                type="button"
                disabled={busyId === r.id}
                onClick={() => skip(r)}
                className="border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Tidak perlu beli
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
