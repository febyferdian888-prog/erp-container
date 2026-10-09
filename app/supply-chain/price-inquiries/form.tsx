"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Attachments } from "@/components/attachments";

interface Supplier { id: string; code: string; name: string }
interface SoOption { id: string; soNumber: string; poNumber: string; customer: { name: string }; items: { partNumber: string | null; description: string; quantity: string; unit: string | null }[] }
interface Product { sku: string; standardPrice: string | number }
interface VendorPrice { supplierId: string; supplierName: string; last: number; lastDate: string; lastRef: string; min: number; max: number; avg: number; count: number }
interface Quote { price: string; lead: string }
interface Item {
  key: string;
  id?: string;
  partNumber: string;
  description: string;
  quantity: string;
  unit: string;
  awarded: string;
  quotes: Record<string, Quote>;
  poId?: string | null;
  poNumber?: string | null;
  soNumber?: string | null;
}
interface CreatedPo { id: string; poNumber: string; supplierName: string; total: number; lines: number }

const STATUS = [
  { value: "draft", label: "Draft" },
  { value: "open", label: "Menunggu penawaran" },
  { value: "awarded", label: "Vendor dipilih" },
  { value: "closed", label: "Selesai" },
  { value: "cancelled", label: "Dibatalkan" },
];

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
const dt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("id-ID");
const num = (s: string) => {
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
};
let keySeq = 0;
const newKey = () => `k${++keySeq}`;
const blankItem = (): Item => ({ key: newKey(), partNumber: "", description: "", quantity: "1", unit: "pcs", awarded: "", quotes: {} });

const field = "h-9 w-full border border-slate-300 bg-white px-2 text-sm";
const th = "px-2 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400";
const btn = "border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const btnPrimary = "bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50";

export function PriceInquiryForm({ inquiryId, companyId }: { inquiryId?: string; companyId: string }) {
  const router = useRouter();
  const { status } = useSession();
  const [loading, setLoading] = useState(!!inquiryId);
  const [saving, setSaving] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [salesOrders, setSalesOrders] = useState<SoOption[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [number, setNumber] = useState("");
  const [form, setForm] = useState({ title: "", inquiryDate: new Date().toISOString().slice(0, 10), neededDate: "", soId: "", status: "draft", notes: "" });
  const [vendorIds, setVendorIds] = useState<string[]>([]);
  const [items, setItems] = useState<Item[]>([blankItem()]);
  const [history, setHistory] = useState<Record<string, VendorPrice[]>>({}); // item key -> vendor prices
  const [createdPos, setCreatedPos] = useState<CreatedPo[]>([]);

  const isNew = !inquiryId;

  const load = useCallback(async () => {
    if (!inquiryId) return;
    const res = await fetch(`/api/price-inquiries/${inquiryId}`);
    if (!res.ok) return router.push("/supply-chain/price-inquiries");
    const d = await res.json();
    setNumber(d.number);
    setForm({
      title: d.title,
      inquiryDate: d.inquiryDate.slice(0, 10),
      neededDate: d.neededDate ? d.neededDate.slice(0, 10) : "",
      soId: d.soId || "",
      status: d.status,
      notes: d.notes || "",
    });
    setVendorIds(d.vendors.map((v: { supplierId: string }) => v.supplierId));
    setItems(
      d.items.map((i: { soNumber?: string | null; id: string; partNumber: string | null; description: string; quantity: number; unit: string | null; awardedSupplierId: string | null; poId: string | null; poNumber: string | null; quotes: Record<string, { unitPrice: number; leadTimeDays: number | null }> }) => ({
        key: newKey(),
        id: i.id,
        partNumber: i.partNumber || "",
        description: i.description,
        quantity: String(i.quantity),
        unit: i.unit || "",
        awarded: i.awardedSupplierId || "",
        poId: i.poId,
        poNumber: i.poNumber,
        soNumber: i.soNumber ?? null,
        quotes: Object.fromEntries(Object.entries(i.quotes).map(([s, q]) => [s, { price: String(q.unitPrice), lead: q.leadTimeDays === null ? "" : String(q.leadTimeDays) }])),
      }))
    );
    setLoading(false);
  }, [inquiryId, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/suppliers").then((r) => (r.ok ? r.json() : [])).then(setSuppliers).catch(() => {});
    fetch("/api/sales-orders").then((r) => (r.ok ? r.json() : [])).then(setSalesOrders).catch(() => {});
    fetch("/api/products").then((r) => (r.ok ? r.json() : [])).then(setProducts).catch(() => {});
    load();
  }, [status, load]);

  const refreshHistory = useCallback(async (list: Item[]) => {
    const withPart = list.filter((i) => i.partNumber.trim());
    if (!withPart.length) return setHistory({});
    const res = await fetch("/api/price-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: withPart.map((i) => ({ partNumber: i.partNumber, description: i.description })) }),
    });
    if (!res.ok) return;
    const d: { history: VendorPrice[][] } = await res.json();
    setHistory(Object.fromEntries(withPart.map((i, idx) => [i.key, d.history[idx]])));
  }, []);

  useEffect(() => {
    if (!loading && items.length) refreshHistory(items);
    // only when the inquiry finishes loading; later refreshes are manual
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const vendors = useMemo(() => vendorIds.map((id) => suppliers.find((s) => s.id === id)).filter(Boolean) as Supplier[], [vendorIds, suppliers]);
  const sellPrice = useMemo(() => new Map(products.map((p) => [p.sku.trim().toLowerCase(), Number(p.standardPrice)])), [products]);

  const setItem = (key: string, patch: Partial<Item>) => setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const setQuote = (key: string, supplierId: string, patch: Partial<Quote>) =>
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, quotes: { ...i.quotes, [supplierId]: { ...({ price: "", lead: "" } as Quote), ...i.quotes[supplierId], ...patch } } } : i)));

  const priceOf = (i: Item, s: string) => {
    const p = num(i.quotes[s]?.price ?? "");
    return p !== null && p >= 0 && (i.quotes[s]?.price ?? "") !== "" ? p : null;
  };
  const lowest = (i: Item) => {
    const ps = vendorIds.map((s) => priceOf(i, s)).filter((p): p is number => p !== null);
    return ps.length ? Math.min(...ps) : null;
  };

  const totals = useMemo(() => {
    const per = vendors.map((v) => {
      let total = 0;
      let quoted = 0;
      for (const i of items) {
        const p = priceOf(i, v.id);
        if (p !== null) {
          total += p * (num(i.quantity) ?? 0);
          quoted++;
        }
      }
      return { id: v.id, total, quoted, complete: items.length > 0 && quoted === items.filter((x) => x.description.trim()).length };
    });
    let split = 0;
    let splitCount = 0;
    const splitVendors = new Set<string>();
    for (const i of items) {
      const low = lowest(i);
      if (low === null) continue;
      split += low * (num(i.quantity) ?? 0);
      splitCount++;
      const winner = vendorIds.find((s) => priceOf(i, s) === low);
      if (winner) splitVendors.add(winner);
    }
    const complete = per.filter((p) => p.complete).sort((a, b) => a.total - b.total);
    const awardedTotal = items.reduce((s, i) => {
      const p = i.awarded ? priceOf(i, i.awarded) : null;
      return p === null ? s : s + p * (num(i.quantity) ?? 0);
    }, 0);
    return { per, split, splitCount, splitVendors: splitVendors.size, cheapestSingle: complete[0], dearestSingle: complete[complete.length - 1], awardedTotal, awardedCount: items.filter((i) => i.awarded).length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, vendors, vendorIds]);

  const awardLowest = () =>
    setItems((prev) => prev.map((i) => {
      if (i.poId) return i;
      const low = lowest(i);
      const winner = low === null ? "" : vendorIds.find((s) => priceOf(i, s) === low) || "";
      return { ...i, awarded: winner };
    }));
  const awardVendor = (supplierId: string) =>
    setItems((prev) => prev.map((i) => (i.poId ? i : { ...i, awarded: priceOf(i, supplierId) !== null ? supplierId : i.awarded })));

  const pullFromSo = () => {
    const so = salesOrders.find((s) => s.id === form.soId);
    if (!so) return;
    const fresh: Item[] = so.items.map((i) => ({ key: newKey(), partNumber: i.partNumber || "", description: i.description, quantity: String(Number(i.quantity)), unit: i.unit || "pcs", awarded: "", quotes: {} }));
    setItems((prev) => {
      const kept = prev.filter((i) => i.id || i.description.trim());
      const next = [...kept, ...fresh];
      refreshHistory(next);
      return next;
    });
    if (!form.title) setForm((f) => ({ ...f, title: `Harga untuk ${so.soNumber} (${so.customer.name})` }));
  };

  const save = async (): Promise<boolean> => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      if (!form.title.trim()) throw new Error("Judul wajib diisi");
      const valid = items.filter((i) => i.description.trim() && (num(i.quantity) ?? 0) > 0);
      if (!valid.length) throw new Error("Isi minimal satu item dengan qty");

      const payload = {
        companyId,
        title: form.title,
        inquiryDate: form.inquiryDate,
        neededDate: form.neededDate || null,
        soId: form.soId || null,
        notes: form.notes,
        status: form.status,
        vendorIds,
        items: valid.map((i) => ({
          id: i.id,
          partNumber: i.partNumber,
          description: i.description,
          quantity: num(i.quantity),
          unit: i.unit,
          awardedSupplierId: i.awarded || null,
          quotes: Object.fromEntries(vendorIds.map((s) => [s, priceOf(i, s) === null ? null : { unitPrice: priceOf(i, s), leadTimeDays: num(i.quotes[s]?.lead ?? "") }])),
        })),
      };
      const res = await fetch(isNew ? "/api/price-inquiries" : `/api/price-inquiries/${inquiryId}`, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Gagal menyimpan");
      if (isNew) {
        router.push(`/supply-chain/price-inquiries/${body.id}`);
        return true;
      }
      await load();
      setNotice("Tersimpan.");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const createPos = async () => {
    setOrdering(true);
    setError(null);
    setNotice(null);
    try {
      if (!(await save())) return;
      const res = await fetch(`/api/price-inquiries/${inquiryId}/award`, { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Gagal membuat PO");
      setCreatedPos(body.purchaseOrders);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal membuat PO");
    } finally {
      setOrdering(false);
    }
  };

  if (loading) return <div className="py-8 text-center">Memuat…</div>;

  const unusedSuppliers = suppliers.filter((s) => !vendorIds.includes(s.id));
  const pendingAward = items.filter((i) => i.awarded && !i.poId).length;

  return (
    <div className="max-w-full space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={() => router.push("/supply-chain/price-inquiries")} className="text-sm text-slate-500 hover:text-slate-900">← Permintaan harga</button>
        <div className="flex gap-3">
          <button className={btnPrimary} disabled={saving || ordering} onClick={() => save()}>{saving ? "Menyimpan…" : "Simpan"}</button>
        </div>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Permintaan harga vendor</p>
        <h1 className="text-2xl font-semibold text-slate-900">{isNew ? "Permintaan harga baru" : number}</h1>
      </div>

      {error && <div className="border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
      {notice && <div className="border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}
      {createdPos.length > 0 && (
        <div className="border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-medium">{createdPos.length} PO draft dibuat. Harga dari vendor pemenang sudah terisi di tiap PO.</p>
          <ul className="mt-2 space-y-1">
            {createdPos.map((p) => (
              <li key={p.id}><Link className="underline" href={`/supply-chain/purchase-orders/${p.id}`}>{p.poNumber}</Link> · {p.supplierName} · {p.lines} item · {idr(p.total)}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="border border-slate-200 bg-white p-5">
        <div className="grid gap-4 md:grid-cols-4">
          <label className="text-sm text-slate-700 md:col-span-2">Judul
            <input className={`${field} mt-1`} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="mis. Sparepart mobil crane Waskita" />
          </label>
          <label className="text-sm text-slate-700">Tanggal
            <input type="date" className={`${field} mt-1`} value={form.inquiryDate} onChange={(e) => setForm({ ...form, inquiryDate: e.target.value })} />
          </label>
          <label className="text-sm text-slate-700">Butuh sebelum
            <input type="date" className={`${field} mt-1`} value={form.neededDate} onChange={(e) => setForm({ ...form, neededDate: e.target.value })} />
          </label>
          <label className="text-sm text-slate-700 md:col-span-2">Untuk Sales Order (opsional)
            <div className="mt-1 flex gap-2">
              <select className={field} value={form.soId} onChange={(e) => setForm({ ...form, soId: e.target.value })}>
                <option value="">Tidak terkait penjualan</option>
                {salesOrders.map((s) => <option key={s.id} value={s.id}>{s.soNumber} · {s.customer.name} · {s.poNumber}</option>)}
              </select>
              <button type="button" className={btn} disabled={!form.soId} onClick={pullFromSo}>Ambil item</button>
            </div>
            <span className="text-xs text-slate-400">PO yang dibuat dari sini otomatis terhubung ke SO ini, jadi masuk ke margin.</span>
          </label>
          {!isNew && (
            <label className="text-sm text-slate-700">Status
              <select className={`${field} mt-1`} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
          )}
          <label className="text-sm text-slate-700 md:col-span-4">Catatan
            <input className={`${field} mt-1`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
        </div>
      </section>

      <section className="border border-slate-200 bg-white p-5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Vendor yang dimintai harga</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {vendors.map((v) => (
            <span key={v.id} className="inline-flex items-center gap-2 border border-slate-300 px-2.5 py-1 text-sm text-slate-800">
              {v.name}
              <button type="button" className="text-slate-400 hover:text-red-600" onClick={() => setVendorIds((p) => p.filter((x) => x !== v.id))} aria-label={`Hapus ${v.name}`}>×</button>
            </span>
          ))}
          <select className="h-9 border border-slate-300 bg-white px-2 text-sm" value="" onChange={(e) => e.target.value && setVendorIds((p) => [...p, e.target.value])}>
            <option value="">{unusedSuppliers.length ? "Tambah vendor…" : "Semua vendor sudah dipilih"}</option>
            {unusedSuppliers.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
          </select>
          <Link href="/supply-chain/suppliers/new" className="text-xs text-slate-500 underline">Vendor belum ada? Tambah dulu</Link>
        </div>
        {isNew && <p className="mt-3 text-xs text-slate-400">Simpan dulu, lalu isi harga tiap vendor di tabel perbandingan.</p>}
      </section>

      <section className="border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{isNew ? "Item yang dibutuhkan" : "Perbandingan harga"}</h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn} onClick={() => refreshHistory(items)}>Cek harga terakhir</button>
            {!isNew && vendors.length > 0 && <button type="button" className={btn} onClick={awardLowest}>Pilih termurah per item</button>}
            <button type="button" className={btn} onClick={() => setItems((p) => [...p, blankItem()])}>Tambah item</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-slate-200">
                <th className={`${th} w-32`}>Part no.</th>
                <th className={th}>Deskripsi</th>
                <th className={`${th} w-20`}>Qty</th>
                <th className={`${th} w-16`}>Sat.</th>
                {!isNew && vendors.map((v) => (
                  <th key={v.id} className={`${th} min-w-40`}>
                    {v.name}
                    <button type="button" className="ml-2 normal-case tracking-normal text-slate-500 underline" onClick={() => awardVendor(v.id)}>pilih semua</button>
                  </th>
                ))}
                {!isNew && <th className={`${th} min-w-44`}>Dipilih</th>}
                <th className={`${th} min-w-56`}>Riwayat harga beli</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const low = lowest(i);
                const locked = !!i.poId;
                const hist = history[i.key] || [];
                const sell = sellPrice.get(i.partNumber.trim().toLowerCase());
                return (
                  <tr key={i.key} className={`border-b border-slate-100 align-top ${locked ? "bg-slate-50" : ""}`}>
                    <td className="p-1.5"><input className={field} disabled={locked} value={i.partNumber} onChange={(e) => setItem(i.key, { partNumber: e.target.value })} onBlur={() => i.partNumber && refreshHistory(items)} /></td>
                    <td className="p-1.5"><input className={field} disabled={locked} value={i.description} onChange={(e) => setItem(i.key, { description: e.target.value })} />{i.soNumber && <span className="mt-0.5 block text-[11px] text-slate-400">Untuk {i.soNumber}</span>}</td>
                    <td className="p-1.5"><input className={`${field} text-right`} disabled={locked} inputMode="decimal" value={i.quantity} onChange={(e) => setItem(i.key, { quantity: e.target.value })} /></td>
                    <td className="p-1.5"><input className={field} disabled={locked} value={i.unit} onChange={(e) => setItem(i.key, { unit: e.target.value })} /></td>
                    {!isNew && vendors.map((v) => {
                      const p = priceOf(i, v.id);
                      const best = p !== null && low !== null && p === low && vendors.filter((x) => priceOf(i, x.id) !== null).length > 1;
                      return (
                        <td key={v.id} className="p-1.5">
                          <input
                            className={`${field} text-right tabular-nums ${best ? "border-emerald-500 bg-emerald-50 font-semibold" : ""}`}
                            inputMode="decimal"
                            placeholder="Harga satuan"
                            value={i.quotes[v.id]?.price ?? ""}
                            onChange={(e) => setQuote(i.key, v.id, { price: e.target.value })}
                          />
                          <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
                            <input className="h-6 w-12 border border-slate-200 px-1 text-right" inputMode="numeric" placeholder="-" value={i.quotes[v.id]?.lead ?? ""} onChange={(e) => setQuote(i.key, v.id, { lead: e.target.value })} /> hari
                            {p !== null && low !== null && p > low && <span className="ml-auto text-slate-500">+{Math.round(((p - low) / low) * 100)}%</span>}
                          </div>
                        </td>
                      );
                    })}
                    {!isNew && (
                      <td className="p-1.5">
                        {locked ? (
                          <Link className="text-sm underline" href={`/supply-chain/purchase-orders/${i.poId}`}>{i.poNumber}</Link>
                        ) : (
                          <select className={field} value={i.awarded} onChange={(e) => setItem(i.key, { awarded: e.target.value })}>
                            <option value="">Belum dipilih</option>
                            {vendors.filter((v) => priceOf(i, v.id) !== null).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                          </select>
                        )}
                      </td>
                    )}
                    <td className="p-1.5 text-xs text-slate-500">
                      {i.partNumber.trim() ? (
                        hist.length ? (
                          <ul className="space-y-0.5">
                            {hist.slice(0, 3).map((h) => (
                              <li key={h.supplierId}>{h.supplierName}: <b className="font-semibold text-slate-700">{idr(h.last)}</b> <span className="text-slate-400">({dt(h.lastDate)}{h.count > 1 ? `, ${h.count}x` : ""})</span></li>
                            ))}
                            {sell && low !== null && sell > 0 && <li className="text-slate-400">Harga jual standar {idr(sell)}, margin {Math.round(((sell - low) / sell) * 100)}% di harga termurah</li>}
                          </ul>
                        ) : <span className="text-slate-300">belum pernah dibeli</span>
                      ) : <span className="text-slate-300">isi nomor part</span>}
                    </td>
                    <td className="p-1.5 text-center">
                      {!locked && items.length > 1 && <button type="button" className="text-slate-300 hover:text-red-600" onClick={() => setItems((p) => p.filter((x) => x.key !== i.key))} aria-label="Hapus baris">×</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {!isNew && vendors.length > 0 && (
              <tfoot>
                <tr className="border-t border-slate-300 bg-slate-50">
                  <td colSpan={4} className="px-2 py-2 text-sm font-semibold text-slate-700">Total per vendor (sebelum PPN)</td>
                  {totals.per.map((p) => (
                    <td key={p.id} className="px-2 py-2 text-right text-sm tabular-nums">
                      <b className={totals.cheapestSingle?.id === p.id ? "text-emerald-700" : "text-slate-900"}>{p.quoted ? idr(p.total) : "-"}</b>
                      <span className="block text-[11px] text-slate-400">{p.quoted}/{items.filter((x) => x.description.trim()).length} item{p.complete ? " · lengkap" : ""}</span>
                    </td>
                  ))}
                  <td colSpan={3} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {!isNew && vendors.length > 0 && (
        <section className="grid gap-4 md:grid-cols-3">
          <div className="border border-slate-200 bg-white p-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">Termurah per item</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{totals.splitCount ? idr(totals.split) : "-"}</p>
            <p className="mt-0.5 text-xs text-slate-500">{totals.splitCount ? `dari ${totals.splitVendors} vendor, ${totals.splitCount} item berharga` : "Isi harga vendor dulu"}</p>
          </div>
          <div className="border border-slate-200 bg-white p-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">Satu vendor termurah</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{totals.cheapestSingle ? idr(totals.cheapestSingle.total) : "-"}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {totals.cheapestSingle
                ? `${vendors.find((v) => v.id === totals.cheapestSingle!.id)?.name}${totals.dearestSingle && totals.dearestSingle.id !== totals.cheapestSingle.id ? `, hemat ${idr(totals.dearestSingle.total - totals.cheapestSingle.total)} dari yang termahal` : ""}`
                : "Belum ada vendor yang menghargai semua item"}
            </p>
          </div>
          <div className="border border-slate-200 bg-white p-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">Pilihan Anda</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{totals.awardedCount ? idr(totals.awardedTotal) : "-"}</p>
            <p className="mt-0.5 text-xs text-slate-500">{totals.awardedCount} item dipilih, {pendingAward} belum dibuat PO</p>
          </div>
        </section>
      )}

      {!isNew && (
        <div className="flex flex-wrap items-center gap-3">
          <button className={btnPrimary} disabled={saving || ordering || pendingAward === 0} onClick={createPos}>
            {ordering ? "Membuat PO…" : `Buat PO dari pilihan (${pendingAward} item)`}
          </button>
          <span className="text-xs text-slate-400">Satu PO draft per vendor pemenang. Harga terisi otomatis, PO ini terhubung ke SO di atas.</span>
        </div>
      )}

      {!isNew && <Attachments referenceType="PriceInquiry" referenceId={inquiryId!} />}
    </div>
  );
}
