"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard-layout";

interface Row {
  id: string;
  createdAt: string;
  user: string;
  entityType: string;
  entityId: string;
  action: string;
  description: string | null;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
}

const ENTITIES = [
  "RFQ", "Quotation", "SalesOrder", "Delivery", "Invoice", "Payment", "PurchaseRequest", "PurchaseOrder",
  "GoodsReceipt", "Bill", "Customer", "Supplier", "Product", "Project", "WorkOrder", "Employee", "Warehouse",
  "Approval", "Attachment", "UserMembership", "PriceInquiry", "Export", "Import", "Account",
];
const ACTION_LABEL: Record<string, string> = { CREATE: "Dibuat", UPDATE: "Diubah", DELETE: "Dihapus", EXPORT: "Diekspor", IMPORT: "Diimpor", PASSWORD_CHANGE: "Ganti password", PASSWORD_RESET: "Reset password" };
const PAGE = 50;

const th = "px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400";
const td = "px-4 py-2 text-sm text-slate-700";

function show(v: unknown) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString("id-ID");
  return String(v);
}

export default function AuditLogPage() {
  const { status } = useSession();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [f, setF] = useState({ entityType: "", action: "", q: "", from: "", to: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
    Object.entries(f).forEach(([k, v]) => v && p.set(k, v));
    const res = await fetch(`/api/audit-logs?${p}`);
    if (res.ok) {
      const d = await res.json();
      setRows(d.rows);
      setTotal(d.total);
      setError(null);
    } else {
      setError((await res.json().catch(() => null))?.error || "Gagal memuat audit log");
    }
    setLoading(false);
  }, [f, offset]);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/login");
    if (status === "authenticated") load();
  }, [status, router, load]);

  const set = (k: keyof typeof f, v: string) => {
    setOffset(0);
    setF((prev) => ({ ...prev, [k]: v }));
  };
  const field = "h-9 border border-slate-300 bg-white px-2 text-sm";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <Link href="/settings" className="text-sm text-slate-500 hover:text-slate-900">← Pengaturan</Link>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Audit log</h1>
          <p className="mt-1 text-slate-600">Siapa membuat, mengubah, atau menghapus dokumen dan data master.</p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <select className={field} value={f.entityType} onChange={(e) => set("entityType", e.target.value)}>
            <option value="">Semua jenis data</option>
            {ENTITIES.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          <select className={field} value={f.action} onChange={(e) => set("action", e.target.value)}>
            <option value="">Semua aksi</option>
            {Object.entries(ACTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input className={`${field} w-56`} placeholder="Cari nomor dokumen / nama" value={f.q} onChange={(e) => set("q", e.target.value)} />
          <label className="text-xs text-slate-500">Dari <input type="date" className={`${field} ml-1`} value={f.from} onChange={(e) => set("from", e.target.value)} /></label>
          <label className="text-xs text-slate-500">Sampai <input type="date" className={`${field} ml-1`} value={f.to} onChange={(e) => set("to", e.target.value)} /></label>
        </div>

        {error && <div className="border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}

        <div className="overflow-x-auto border border-slate-200 bg-white">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className={th}>Waktu</th>
                <th className={th}>Pengguna</th>
                <th className={th}>Aksi</th>
                <th className={th}>Jenis</th>
                <th className={th}>Dokumen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const changed = Object.keys(r.newValue || r.oldValue || {});
                const expandable = r.action !== "DELETE" ? changed.length > 0 : false;
                return (
                  <Fragment key={r.id}>
                    <tr
                      className={`border-b border-slate-100 ${expandable ? "cursor-pointer hover:bg-slate-50" : ""}`}
                      onClick={() => expandable && setOpen(open === r.id ? null : r.id)}
                    >
                      <td className={`${td} whitespace-nowrap tabular-nums`}>{new Date(r.createdAt).toLocaleString("id-ID")}</td>
                      <td className={td}>{r.user}</td>
                      <td className={`${td} font-medium ${r.action === "DELETE" ? "text-brand" : ""}`}>{ACTION_LABEL[r.action] || r.action}</td>
                      <td className={td}>{r.entityType}</td>
                      <td className={td}>
                        {expandable && <span className="mr-1 text-slate-400">{open === r.id ? "▾" : "▸"}</span>}
                        {r.description || r.entityId}
                      </td>
                    </tr>
                    {open === r.id && (
                      <tr className="border-b border-slate-100 bg-slate-50/60">
                        <td colSpan={5} className="px-6 py-3">
                          <table className="text-sm">
                            <tbody>
                              {changed.map((k) => (
                                <tr key={k}>
                                  <td className="pr-6 py-0.5 font-mono text-xs text-slate-500">{k}</td>
                                  {r.action === "UPDATE" && (
                                    <td className="pr-3 py-0.5 text-slate-400 line-through">{show(r.oldValue?.[k])}</td>
                                  )}
                                  <td className="py-0.5 text-slate-900">{show(r.newValue?.[k])}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-8 text-sm text-slate-400">Belum ada catatan. Perubahan yang dilakukan mulai sekarang akan tercatat di sini.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>{total} catatan</span>
          <div className="flex gap-2">
            <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))} className="border border-slate-300 bg-white px-3 py-1.5 disabled:opacity-40">Sebelumnya</button>
            <button disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)} className="border border-slate-300 bg-white px-3 py-1.5 disabled:opacity-40">Berikutnya</button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
