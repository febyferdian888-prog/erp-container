"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard-layout";

interface Approval {
  id: string;
  referenceType: string;
  referenceId: string;
  documentLabel: string | null;
  status: "pending" | "approved" | "rejected";
  amount: number | null;
  notes: string | null;
  createdAt: string;
  approvedAt: string | null;
  requestedByName: string | null;
  approvedByName: string | null;
}

const idr = (n: number | null) =>
  n === null ? "-" : new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
const TYPE_LABEL: Record<string, string> = { PurchaseOrder: "Purchase Order", Quotation: "Quotation" };
const HREF: Record<string, string> = { PurchaseOrder: "/supply-chain/purchase-orders", Quotation: "/sales/quotations" };
const STATUS_LABEL = { pending: "Menunggu", approved: "Disetujui", rejected: "Ditolak" };

const th = "px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400";
const td = "px-4 py-2 text-sm text-slate-700";

export default function ApprovalsPage() {
  const { status } = useSession();
  const router = useRouter();
  const [rows, setRows] = useState<Approval[]>([]);
  const [canDecide, setCanDecide] = useState(false);
  const [thresholds, setThresholds] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/approvals?status=${filter}`);
    if (res.ok) {
      const d = await res.json();
      setRows(d.approvals);
      setCanDecide(d.canDecide);
      setThresholds(d.thresholds);
    }
  }, [filter]);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/login");
    if (status === "authenticated") load();
  }, [status, router, load]);

  const decide = async (id: string, decision: "approved" | "rejected") => {
    setBusy(id);
    setError(null);
    const res = await fetch(`/api/approvals/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, notes: notes[id] || "" }),
    });
    if (!res.ok) setError((await res.json().catch(() => null))?.error || "Gagal memproses");
    setBusy(null);
    load();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <Link href="/settings" className="text-sm text-slate-500 hover:text-slate-900">← Pengaturan</Link>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Persetujuan</h1>
          <p className="mt-1 text-slate-600">
            Dokumen di atas batas nilai harus disetujui sebelum keluar dari Draft
            {Object.keys(thresholds).length > 0 &&
              ` (${Object.entries(thresholds).map(([k, v]) => `${TYPE_LABEL[k] || k} ≥ ${idr(v)}`).join(", ")})`}.
          </p>
        </div>

        <div className="flex gap-6 border-b border-slate-200">
          {(["pending", "all"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`-mb-px border-b-2 pb-3 text-sm font-medium ${filter === k ? "border-brand text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}
            >
              {k === "pending" ? "Menunggu" : "Semua riwayat"}
            </button>
          ))}
        </div>

        {!canDecide && <p className="text-sm text-slate-500">Anda dapat melihat daftar ini, tetapi hanya Owner atau Admin yang bisa menyetujui.</p>}
        {error && <div className="border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}

        <div className="overflow-x-auto border border-slate-200 bg-white">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className={th}>Dokumen</th>
                <th className={th}>Jenis</th>
                <th className={th}>Nilai</th>
                <th className={th}>Diajukan</th>
                <th className={th}>Status</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-b border-slate-100 align-top">
                  <td className={`${td} font-mono text-xs`}>
                    <Link href={`${HREF[a.referenceType] || "#"}/${a.referenceId}`} className="hover:underline">
                      {a.documentLabel || a.referenceId}
                    </Link>
                  </td>
                  <td className={td}>{TYPE_LABEL[a.referenceType] || a.referenceType}</td>
                  <td className={`${td} tabular-nums`}>{idr(a.amount)}</td>
                  <td className={td}>
                    {new Date(a.createdAt).toLocaleDateString("id-ID")}
                    {a.requestedByName && <span className="block text-xs text-slate-400">{a.requestedByName}</span>}
                  </td>
                  <td className={td}>
                    <span className={a.status === "rejected" ? "text-brand" : a.status === "approved" ? "text-emerald-700" : "text-amber-700"}>
                      {STATUS_LABEL[a.status]}
                    </span>
                    {a.status !== "pending" && (
                      <span className="block text-xs text-slate-400">
                        {a.approvedByName} · {a.approvedAt && new Date(a.approvedAt).toLocaleDateString("id-ID")}
                        {a.notes ? ` · ${a.notes}` : ""}
                      </span>
                    )}
                  </td>
                  <td className={td}>
                    {a.status === "pending" && canDecide && (
                      <div className="flex min-w-64 flex-col gap-2">
                        <input
                          value={notes[a.id] || ""}
                          onChange={(e) => setNotes({ ...notes, [a.id]: e.target.value })}
                          placeholder="Catatan (opsional)"
                          className="border border-slate-300 px-2 py-1 text-sm"
                        />
                        <div className="flex gap-2">
                          <button disabled={busy === a.id} onClick={() => decide(a.id, "approved")} className="bg-primary px-3 py-1 text-sm font-medium text-primary-foreground disabled:opacity-50">Setujui</button>
                          <button disabled={busy === a.id} onClick={() => decide(a.id, "rejected")} className="border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 disabled:opacity-50">Tolak</button>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-8 text-sm text-slate-400">{filter === "pending" ? "Tidak ada pengajuan yang menunggu." : "Belum ada pengajuan."}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}
