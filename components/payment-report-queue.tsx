"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Attachments } from "@/components/attachments";

interface Row {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  amount: number;
  paidDate: string;
  method: string;
  notes: string | null;
  reportedByName: string | null;
}

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

export function PaymentReportQueue() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const res = await fetch("/api/payment-reports?status=pending");
    setRows(res.ok ? await res.json() : []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (row: Row, decision: "approved" | "rejected") => {
    if (
      decision === "approved" &&
      !confirm(`Dana ${idr(row.amount)} untuk ${row.invoiceNumber} sudah masuk ke rekening? Pembayaran akan dicatat dan invoice diperbarui.`)
    ) {
      return;
    }
    setBusyId(row.id);
    setError(null);
    try {
      const res = await fetch(`/api/payment-reports/${row.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reviewNotes: notes[row.id] || "" }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Gagal memproses");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memproses");
    } finally {
      setBusyId(null);
    }
  };

  if (!rows || rows.length === 0) return null;

  return (
    <section className="border border-slate-200 border-l-2 border-l-amber-400 bg-white">
      <div className="border-b border-slate-200 px-5 py-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          Verifikasi pembayaran customer ({rows.length})
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Sales melaporkan customer sudah bayar. Cek mutasi rekening, lalu setujui bila dana sudah masuk.
        </p>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </div>
      <ul className="divide-y divide-slate-100">
        {rows.map((r) => (
          <li key={r.id} className="px-5 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-slate-900">
                  {idr(r.amount)}{" "}
                  <Link href={`/finance/invoices/${r.invoiceId}`} className="font-normal text-slate-600 underline">
                    {r.invoiceNumber}
                  </Link>
                </p>
                <p className="text-xs text-slate-500">
                  {r.customerName} · {new Date(r.paidDate).toLocaleDateString("id-ID")} · {r.method}
                  {r.reportedByName ? ` · dilaporkan ${r.reportedByName}` : ""}
                </p>
                {r.notes && <p className="text-xs text-slate-500">{r.notes}</p>}
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={notes[r.id] || ""}
                  onChange={(e) => setNotes((p) => ({ ...p, [r.id]: e.target.value }))}
                  placeholder="Catatan (opsional)"
                  className="w-44 border border-slate-300 px-2 py-1.5 text-sm"
                />
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => decide(r, "approved")}
                  className="bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  Dana sudah masuk
                </button>
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => decide(r, "rejected")}
                  className="border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Tolak
                </button>
              </div>
            </div>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-slate-600 underline">Bukti transfer</summary>
              <Attachments referenceType="PaymentReport" referenceId={r.id} />
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
