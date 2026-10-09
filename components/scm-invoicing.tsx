"use client";

import { useRef, useState } from "react";
import Link from "next/link";

export interface InvoicingPo {
  poId: string;
  poNumber: string;
  status: string;
  supplierName: string;
  ppnPercent: number;
  poSubtotal: number;
  dpBilled: number;
  lines: { id: string; description: string; unit: string | null; quantity: number; invoiced: number; remaining: number; unitPrice: number }[];
}

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
const today = () => new Date().toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;

// PO lines the vendor has not billed yet. Tick the lines that appear on the vendor's invoice,
// enter its number and amount, attach the PDF, and those lines drop off this list.
export function ScmInvoicing({ pos, onChanged }: { pos: InvoicingPo[]; onChanged: () => void }) {
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [formFor, setFormFor] = useState<string | null>(null);
  const [form, setForm] = useState({ vendorInvoiceNumber: "", billDate: today(), dueDate: "", totalAmount: "" });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const toggle = (poId: string, ids: string[]) =>
    setSelected((prev) => {
      const cur = prev[poId] ?? [];
      const all = ids.every((id) => cur.includes(id));
      return { ...prev, [poId]: all ? cur.filter((x) => !ids.includes(x)) : [...new Set([...cur, ...ids])] };
    });

  const suggested = (po: InvoicingPo) => {
    const picked = po.lines.filter((l) => (selected[po.poId] ?? []).includes(l.id));
    const sub = r2(picked.reduce((s, l) => s + l.remaining * l.unitPrice, 0));
    const dp = po.poSubtotal > 0 && po.dpBilled > 0 ? r2(Math.min(po.dpBilled * (sub / po.poSubtotal), sub)) : 0;
    return { sub, dp, net: r2(sub - dp) };
  };

  const open = (po: InvoicingPo) => {
    setFormFor(po.poId);
    setError(null);
    setFile(null);
    setForm({ vendorInvoiceNumber: "", billDate: today(), dueDate: "", totalAmount: String(suggested(po).net || "") });
  };

  const submit = async (po: InvoicingPo) => {
    if (!file) return setError("Pilih PDF tagihan dari vendor");
    if (!form.vendorInvoiceNumber.trim()) return setError("Nomor invoice vendor wajib diisi");
    if (!(Number(form.totalAmount) > 0)) return setError("Isi nilai tagihan sebelum PPN");
    setBusy(true);
    setError(null);
    let billId: string | null = null;
    const call = async (body: unknown) => {
      const res = await fetch(`/api/purchase-orders/${po.poId}/bills`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Gagal menyimpan tagihan");
      return json;
    };
    try {
      billId = (await call({ action: "create_from_items", itemIds: selected[po.poId] ?? [] })).id as string;
      const fd = new FormData();
      fd.append("referenceType", "Bill");
      fd.append("referenceId", billId);
      fd.append("file", file);
      const up = await fetch("/api/attachments", { method: "POST", body: fd });
      if (!up.ok) throw new Error((await up.json().catch(() => null))?.error || "Gagal mengunggah PDF");
      await call({ action: "receive", billId, ...form, totalAmount: Number(form.totalAmount), ppnPercent: po.ppnPercent });
      setFormFor(null);
      setSelected((prev) => ({ ...prev, [po.poId]: [] }));
      onChanged();
    } catch (e) {
      if (billId) await call({ action: "discard_draft", billId }).catch(() => {});
      setError(e instanceof Error ? e.message : "Gagal menyimpan tagihan");
    } finally {
      setBusy(false);
    }
  };

  const input = "w-full border border-slate-300 px-2 py-1.5 text-sm";

  return (
    <ul className="divide-y divide-slate-200">
      {pos.length === 0 && <li className="px-5 py-4 text-sm text-slate-400">Semua item PO sudah ditagih.</li>}
      {pos.map((po) => {
        const picked = selected[po.poId] ?? [];
        const sg = suggested(po);
        return (
          <li key={po.poId} className="px-5 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-medium text-slate-900">
                <Link href={`/supply-chain/purchase-orders/${po.poId}`} className="hover:underline">{po.poNumber}</Link>
                <span className="font-normal text-slate-500"> · {po.supplierName}</span>
                {po.dpBilled > 0 && <span className="ml-2 bg-slate-100 px-1.5 py-0.5 text-[11px] font-normal text-slate-600">DP {idr(po.dpBilled)} ikut dipotong</span>}
              </p>
              <button
                type="button"
                disabled={picked.length === 0}
                onClick={() => open(po)}
                className="bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {picked.length ? `Catat tagihan (${picked.length} item)` : "Centang item di invoice vendor"}
              </button>
            </div>
            <table className="mt-1 w-full">
              <tbody>
                {po.lines.map((l) => (
                  <tr key={l.id} className="border-t border-slate-100">
                    <td className="w-8 py-1.5">
                      <input type="checkbox" className="h-4 w-4" checked={picked.includes(l.id)} onChange={() => toggle(po.poId, [l.id])} aria-label={`Pilih ${l.description}`} />
                    </td>
                    <td className="py-1.5 text-slate-900">{l.description}</td>
                    <td className="w-28 py-1.5 text-right tabular-nums text-slate-600">{l.remaining} {l.unit || ""}</td>
                    <td className="w-36 py-1.5 text-right tabular-nums text-slate-500">{idr(l.remaining * l.unitPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {po.lines.length > 1 && (
              <button type="button" onClick={() => toggle(po.poId, po.lines.map((l) => l.id))} className="mt-1 text-xs text-slate-500 underline">
                {picked.length === po.lines.length ? "Batal pilih semua" : "Pilih semua item"}
              </button>
            )}

            {formFor === po.poId && (
              <div className="mt-3 space-y-3 border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs text-slate-600">
                  {picked.length} item · {idr(sg.sub)}{sg.dp > 0 ? ` − potongan DP ${idr(sg.dp)}` : ""} = {idr(sg.net)} sebelum PPN {po.ppnPercent}%. Samakan dengan angka di PDF vendor.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs text-slate-600">Nomor invoice vendor *<input className={input} value={form.vendorInvoiceNumber} onChange={(e) => setForm({ ...form, vendorInvoiceNumber: e.target.value })} /></label>
                  <label className="text-xs text-slate-600">Nilai sebelum PPN *<input className={input} type="number" min="0" step="0.01" value={form.totalAmount} onChange={(e) => setForm({ ...form, totalAmount: e.target.value })} /></label>
                  <label className="text-xs text-slate-600">Tanggal tagihan *<input className={input} type="date" value={form.billDate} onChange={(e) => setForm({ ...form, billDate: e.target.value })} /></label>
                  <label className="text-xs text-slate-600">Jatuh tempo<input className={input} type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></label>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <input ref={fileInput} type="file" accept=".pdf,image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                  <button type="button" onClick={() => fileInput.current?.click()} className="border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    {file ? "Ganti file" : "Pilih PDF tagihan *"}
                  </button>
                  <span className="text-xs text-slate-500">{file ? file.name : "Maksimal 4 MB"}</span>
                </div>
                {error && <p className="text-sm text-red-700">{error}</p>}
                <div className="flex gap-2">
                  <button type="button" disabled={busy} onClick={() => submit(po)} className="bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
                    {busy ? "Menyimpan…" : "Simpan, tagihan sudah masuk"}
                  </button>
                  <button type="button" disabled={busy} onClick={() => setFormFor(null)} className="border border-slate-300 bg-white px-4 py-1.5 text-sm text-slate-700">Batal</button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
