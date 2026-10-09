"use client";

import { useCallback, useEffect, useState } from "react";
import { Attachments } from "@/components/attachments";

interface Report {
  id: string;
  amount: number;
  paidDate: string;
  method: string;
  notes: string | null;
  status: "pending" | "approved" | "rejected";
  reviewNotes: string | null;
  reportedByName: string | null;
  reviewedByName: string | null;
}

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const STATUS_LABEL: Record<Report["status"], string> = {
  pending: "Menunggu verifikasi finance",
  approved: "Sudah diverifikasi",
  rejected: "Ditolak finance",
};
const STATUS_TONE: Record<Report["status"], string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
};

export function InvoicePaymentPanel({
  invoiceId,
  grandTotal,
  cashPaid,
  pphWithheld,
  balanceDue,
  stateLabel,
}: {
  invoiceId: string;
  grandTotal: number;
  cashPaid: number;
  pphWithheld: number;
  balanceDue: number;
  stateLabel: string;
}) {
  const [reports, setReports] = useState<Report[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [paidDate, setPaidDate] = useState(new Date().toISOString().split("T")[0]);
  const [method, setMethod] = useState("transfer");
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/payment-reports?invoiceId=${invoiceId}`);
    if (res.ok) setReports(await res.json());
  }, [invoiceId]);

  useEffect(() => {
    load();
  }, [load]);

  const pendingTotal = reports.filter((r) => r.status === "pending").reduce((s, r) => s + r.amount, 0);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/payment-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId, amount: Number(amount), paidDate, method, notes }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Gagal melaporkan pembayaran");
      setOpen(false);
      setAmount("");
      setNotes("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal melaporkan pembayaran");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-8 border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Pembayaran customer</h3>
        <a
          href={`/api/invoices/${invoiceId}/kwitansi`}
          target="_blank"
          rel="noopener noreferrer"
          className="border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Kwitansi (PDF)
        </a>
      </div>

      <div className="grid grid-cols-2 gap-3 px-5 py-4 text-sm md:grid-cols-4">
        <div>
          <p className="text-xs text-slate-500">Total tagihan</p>
          <p className="font-semibold">{idr(grandTotal)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Sudah masuk (terverifikasi)</p>
          <p className="font-semibold">{idr(cashPaid)}</p>
          {pphWithheld > 0 && <p className="text-xs text-slate-400">+ PPh dipotong {idr(pphWithheld)}</p>}
        </div>
        <div>
          <p className="text-xs text-slate-500">Sisa tagihan</p>
          <p className="font-semibold">{idr(Math.max(balanceDue, 0))}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Status</p>
          <p className="font-semibold">{stateLabel}</p>
          {pendingTotal > 0 && <p className="text-xs text-amber-700">{idr(pendingTotal)} menunggu verifikasi</p>}
        </div>
      </div>

      {reports.length > 0 && (
        <ul className="divide-y divide-slate-100 border-t border-slate-200">
          {reports.map((r) => (
            <li key={r.id} className="px-5 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p>
                  <strong>{idr(r.amount)}</strong>
                  <span className="ml-2 text-slate-500">
                    {new Date(r.paidDate).toLocaleDateString("id-ID")} · {r.method}
                    {r.reportedByName ? ` · dilaporkan ${r.reportedByName}` : ""}
                  </span>
                </p>
                <span className={`px-2 py-0.5 text-xs font-medium ${STATUS_TONE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
              </div>
              {r.notes && <p className="mt-1 text-xs text-slate-500">{r.notes}</p>}
              {r.reviewNotes && (
                <p className="mt-1 text-xs text-slate-500">
                  Catatan finance{r.reviewedByName ? ` (${r.reviewedByName})` : ""}: {r.reviewNotes}
                </p>
              )}
              {r.status === "pending" && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-slate-600 underline">Bukti transfer</summary>
                  <Attachments referenceType="PaymentReport" referenceId={r.id} />
                </details>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-slate-200 px-5 py-4">
        {!open ? (
          <button
            type="button"
            disabled={balanceDue <= 0.5}
            onClick={() => {
              setAmount(String(Math.max(Math.round(balanceDue - pendingTotal), 0) || ""));
              setOpen(true);
            }}
            className="border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Lapor customer sudah bayar
          </button>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <label className="text-xs text-slate-500">
                Nominal (Rp)
                <input
                  type="number"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="mt-1 w-full border border-slate-300 px-3 py-1.5 text-sm text-slate-900"
                />
              </label>
              <label className="text-xs text-slate-500">
                Tanggal bayar
                <input
                  type="date"
                  value={paidDate}
                  onChange={(e) => setPaidDate(e.target.value)}
                  className="mt-1 w-full border border-slate-300 px-3 py-1.5 text-sm text-slate-900"
                />
              </label>
              <label className="text-xs text-slate-500">
                Metode
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="mt-1 w-full border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900"
                >
                  <option value="transfer">Transfer</option>
                  <option value="cash">Cash</option>
                  <option value="check">Cek/Giro</option>
                </select>
              </label>
            </div>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Catatan untuk finance (opsional), mis. bank pengirim"
              className="w-full border border-slate-300 px-3 py-1.5 text-sm"
            />
            {error && <p className="text-sm text-red-700">{error}</p>}
            <p className="text-xs text-slate-500">
              Setelah dikirim, unggah bukti transfer di daftar laporan (bagian "Bukti transfer"). Pembayaran baru tercatat setelah finance memverifikasi dana masuk.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy || !(Number(amount) > 0)}
                onClick={submit}
                className="bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {busy ? "Mengirim..." : "Kirim ke finance"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700"
              >
                Batal
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
