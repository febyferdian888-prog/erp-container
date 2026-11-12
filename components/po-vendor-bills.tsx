"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Attachments } from "@/components/attachments";

interface BillRow {
  id: string;
  billNumber: string;
  billKind: string;
  status: string;
  vendorInvoiceNumber: string | null;
  billDate: string;
  dueDate: string | null;
  totalAmount: number;
  ppnPercent: number;
  grandTotal: number;
  paidAmount: number;
}

interface Data {
  poNumber: string;
  ppnPercent: number;
  poSubtotal: number;
  suggestedInvoiceAmount: number;
  bills: BillRow[];
}

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
const today = () => new Date().toISOString().slice(0, 10);

function statusOf(b: BillRow) {
  if (b.status === "draft") return { text: "Menunggu tagihan vendor", cls: "bg-amber-100 text-amber-800" };
  if (b.paidAmount + 0.5 >= b.grandTotal) return { text: "Lunas", cls: "bg-emerald-100 text-emerald-800" };
  if (b.paidAmount > 0) return { text: "Dibayar sebagian", cls: "bg-blue-100 text-blue-800" };
  return { text: "Tagihan masuk, menunggu Finance", cls: "bg-blue-100 text-blue-800" };
}

interface FormState {
  vendorInvoiceNumber: string;
  vendorTaxInvoiceNumber: string;
  vendorTaxInvoiceDate: string;
  billDate: string;
  dueDate: string;
  totalAmount: string;
}

// Where purchasing records the vendor's DP or invoice for a PO: upload the PDF, enter the
// numbers, and mark it received so Finance can pay it.
export function PoVendorBills({ poId }: { poId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [openId, setOpenId] = useState<string | null>(null); // bill being marked received, or "new"
  const [newKind, setNewKind] = useState<"regular" | "down_payment">("regular");
  const [form, setForm] = useState<FormState>({ vendorInvoiceNumber: "", vendorTaxInvoiceNumber: "", vendorTaxInvoiceDate: "", billDate: today(), dueDate: "", totalAmount: "" });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/purchase-orders/${poId}/bills`);
    if (res.ok) setData(await res.json());
  }, [poId]);

  useEffect(() => {
    load();
  }, [load]);

  const openFor = (id: string, amount: number) => {
    setOpenId(id);
    setError(null);
    setFile(null);
    setForm({ vendorInvoiceNumber: "", vendorTaxInvoiceNumber: "", vendorTaxInvoiceDate: "", billDate: today(), dueDate: "", totalAmount: String(amount || "") });
  };

  const post = async (body: unknown) => {
    const res = await fetch(`/api/purchase-orders/${poId}/bills`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Gagal menyimpan tagihan");
    return json;
  };

  const submit = async () => {
    if (!file) return setError("Pilih file PDF tagihan dari vendor");
    if (!form.vendorInvoiceNumber.trim()) return setError("Nomor invoice vendor wajib diisi");
    if (data.ppnPercent > 0 && form.vendorTaxInvoiceNumber.replace(/D/g, "").length !== 16) return setError("Nomor faktur pajak vendor wajib diisi (16 digit)");
    if (!(Number(form.totalAmount) > 0)) return setError("Isi nilai tagihan sebelum PPN");
    setBusy(true);
    setError(null);
    try {
      let billId = openId!;
      if (openId === "new") {
        billId = (await post({ action: "create", kind: newKind, totalAmount: Number(form.totalAmount) })).id;
      }
      const fd = new FormData();
      fd.append("referenceType", "Bill");
      fd.append("referenceId", billId);
      fd.append("file", file);
      const up = await fetch("/api/attachments", { method: "POST", body: fd });
      if (!up.ok) throw new Error((await up.json().catch(() => null))?.error || "Gagal mengunggah PDF");
      await post({ action: "receive", billId, ...form, totalAmount: Number(form.totalAmount), ppnPercent: data?.ppnPercent });
      setOpenId(null);
      await load();
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan tagihan");
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (!data) return null;

  const input = "w-full border border-slate-300 px-2 py-1.5 text-sm";

  const formBlock = (
    <div className="mt-3 space-y-3 border border-slate-200 bg-slate-50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-600">
          Nomor invoice vendor *
          <input className={input} value={form.vendorInvoiceNumber} onChange={(e) => setForm({ ...form, vendorInvoiceNumber: e.target.value })} />
        </label>
        <label className="text-xs text-slate-600">
          Nomor faktur pajak vendor{data.ppnPercent > 0 ? " *" : ""}
          <input className={input} inputMode="numeric" placeholder="16 digit" value={form.vendorTaxInvoiceNumber} onChange={(e) => setForm({ ...form, vendorTaxInvoiceNumber: e.target.value })} />
        </label>
        <label className="text-xs text-slate-600">
          Tanggal faktur pajak
          <input className={input} type="date" value={form.vendorTaxInvoiceDate} onChange={(e) => setForm({ ...form, vendorTaxInvoiceDate: e.target.value })} />
        </label>
        <label className="text-xs text-slate-600">
          Nilai tagihan sebelum PPN *
          <input className={input} type="number" min="0" step="0.01" value={form.totalAmount} onChange={(e) => setForm({ ...form, totalAmount: e.target.value })} />
          <span className="text-[11px] text-slate-400">PPN {data.ppnPercent}% ditambahkan otomatis. Samakan dengan angka di PDF vendor.</span>
        </label>
        <label className="text-xs text-slate-600">
          Tanggal tagihan *
          <input className={input} type="date" value={form.billDate} onChange={(e) => setForm({ ...form, billDate: e.target.value })} />
        </label>
        <label className="text-xs text-slate-600">
          Jatuh tempo
          <input className={input} type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
        </label>
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
        <button type="button" disabled={busy} onClick={submit} className="bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {busy ? "Menyimpan…" : "Simpan, tagihan sudah masuk"}
        </button>
        <button type="button" disabled={busy} onClick={() => setOpenId(null)} className="border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-700">
          Batal
        </button>
      </div>
    </div>
  );

  return (
    <section className="mt-6 border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Tagihan vendor</h3>
          <p className="mt-0.5 text-xs text-slate-400">Unggah PDF tagihan DP atau invoice dari vendor, lalu tandai sudah masuk supaya Finance bisa memproses pembayaran.</p>
        </div>
        {openId !== "new" && (
          <button type="button" onClick={() => openFor("new", data.suggestedInvoiceAmount)} className="border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Catat tagihan baru
          </button>
        )}
      </div>

      {openId === "new" && (
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={newKind === "regular"} onChange={() => { setNewKind("regular"); setForm((f) => ({ ...f, totalAmount: String(data.suggestedInvoiceAmount || "") })); }} /> Invoice
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={newKind === "down_payment"} onChange={() => { setNewKind("down_payment"); setForm((f) => ({ ...f, totalAmount: "" })); }} /> Uang muka (DP)
            </label>
          </div>
          {formBlock}
        </div>
      )}

      {data.bills.length === 0 && openId !== "new" ? (
        <p className="px-5 py-5 text-sm text-slate-400">Belum ada tagihan vendor untuk PO ini.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {data.bills.map((b) => {
            const st = statusOf(b);
            return (
              <li key={b.id} className="px-5 py-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900">
                      {b.billKind === "down_payment" ? "Uang muka (DP)" : "Invoice"} ·{" "}
                      <Link href={`/supply-chain/bills/${b.id}`} className="font-mono text-xs hover:underline">{b.billNumber}</Link>
                    </p>
                    <p className="text-xs text-slate-500">
                      {b.vendorInvoiceNumber ? `Invoice vendor ${b.vendorInvoiceNumber} · ` : ""}
                      {idr(b.grandTotal)} termasuk PPN{b.paidAmount > 0 ? ` · dibayar ${idr(b.paidAmount)}` : ""}
                    </p>
                  </div>
                  <span className={`px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.text}</span>
                </div>
                {b.status === "draft" && openId !== b.id && (
                  <button type="button" onClick={() => openFor(b.id, b.totalAmount)} className="mt-2 bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
                    Tagihan sudah masuk, unggah PDF
                  </button>
                )}
                {openId === b.id && formBlock}
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-slate-500">Lampiran tagihan</summary>
                  <Attachments referenceType="Bill" referenceId={b.id} />
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
