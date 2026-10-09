"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard-layout";

interface LinkedPo {
  id: string;
  poNumber: string;
  status: string;
}

interface SoDetail {
  soNumber: string;
  poNumber: string;
  poDate: string;
  deliveryDate: string | null;
  notes: string | null;
  customer: { name: string };
  progress?: { label: string };
  items: { id: string; lineNumber: number; partNumber: string | null; description: string; quantity: string; unit: string | null; notes: string | null }[];
  purchaseOrders: LinkedPo[];
  poSources: { purchaseOrder: LinkedPo & { deletedAt: string | null } }[];
}

interface CoverageItem {
  id: string;
  quantity: number;
  outstandingQty: number;
  orders: { poId: string; poNumber: string; supplierName: string; quantity: number | null }[];
}

const th = "px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400";
const td = "px-4 py-2 text-sm text-slate-700";

export default function SalesOrderProcurementPage() {
  const { status } = useSession();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [so, setSo] = useState<SoDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [coverage, setCoverage] = useState<Record<string, CoverageItem>>({});

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/login");
    if (status !== "authenticated") return;
    fetch(`/api/sales-orders/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setSo)
      .catch(() => setFailed(true));
    fetch(`/api/sales-orders/${id}/coverage`)
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => c && setCoverage(Object.fromEntries((c.items as CoverageItem[]).map((i) => [i.id, i]))))
      .catch(() => {});
  }, [status, id, router]);

  const linked = new Map<string, LinkedPo>();
  so?.purchaseOrders.forEach((p) => linked.set(p.id, p));
  so?.poSources.forEach((s) => {
    if (!s.purchaseOrder.deletedAt) linked.set(s.purchaseOrder.id, s.purchaseOrder);
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <Link href="/supply-chain" className="text-sm text-slate-500 hover:text-slate-900">← Pembelian & Persediaan</Link>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">{so ? so.soNumber : "Kebutuhan pengadaan"}</h1>
          <p className="mt-1 text-slate-600">Rincian barang yang perlu dibeli untuk pesanan ini. Harga jual tidak ditampilkan.</p>
        </div>

        {failed && <div className="border border-red-200 bg-red-50 p-4 text-sm text-red-800">Pesanan tidak ditemukan atau Anda tidak punya akses.</div>}
        {!so && !failed && <p className="text-sm text-slate-500">Memuat…</p>}

        {so && (
          <>
            <dl className="grid gap-4 border border-slate-200 bg-white p-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div><dt className="text-xs text-slate-400">Customer</dt><dd className="mt-1 font-medium text-slate-900">{so.customer.name}</dd></div>
              <div><dt className="text-xs text-slate-400">PO customer</dt><dd className="mt-1 font-medium text-slate-900">{so.poNumber}<span className="block text-xs font-normal text-slate-500">{new Date(so.poDate).toLocaleDateString("id-ID")}</span></dd></div>
              <div><dt className="text-xs text-slate-400">Tanggal kirim</dt><dd className="mt-1 font-medium text-slate-900">{so.deliveryDate ? new Date(so.deliveryDate).toLocaleDateString("id-ID") : "-"}</dd></div>
              <div><dt className="text-xs text-slate-400">Progres</dt><dd className="mt-1 font-medium text-slate-900">{so.progress?.label ?? "-"}</dd></div>
            </dl>

            {so.notes && (
              <div className="border border-slate-200 bg-white p-5">
                <p className="text-xs text-slate-400">Catatan pesanan</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{so.notes}</p>
              </div>
            )}

            <div className="overflow-x-auto border border-slate-200 bg-white">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className={th}>No</th>
                    <th className={th}>Part number</th>
                    <th className={th}>Deskripsi</th>
                    <th className={`${th} text-right`}>Qty</th>
                    <th className={th}>Satuan</th>
                    <th className={th}>Catatan</th>
                    <th className={th}>Pengadaan</th>
                  </tr>
                </thead>
                <tbody>
                  {so.items.map((it) => (
                    <tr key={it.id} className="border-b border-slate-100 align-top">
                      <td className={td}>{it.lineNumber}</td>
                      <td className={`${td} font-mono text-xs`}>{it.partNumber || "-"}</td>
                      <td className={td}>{it.description}</td>
                      <td className={`${td} text-right tabular-nums`}>{Number(it.quantity)}</td>
                      <td className={td}>{it.unit || "-"}</td>
                      <td className={td}>{it.notes || "-"}</td>
                      <td className={td}>
                        {(() => {
                          const c = coverage[it.id];
                          if (!c) return <span className="text-slate-400">-</span>;
                          return (
                            <div className="space-y-0.5 text-xs">
                              {c.outstandingQty > 0 && (
                                <p className="font-medium text-amber-700">
                                  {c.outstandingQty < c.quantity ? `Sisa ${c.outstandingQty} belum di-PO` : "Belum di-PO"}
                                </p>
                              )}
                              {c.orders.map((o) => (
                                <p key={o.poId} className="text-slate-600">
                                  <Link href={`/supply-chain/purchase-orders/${o.poId}`} className="font-mono hover:underline">{o.poNumber}</Link>
                                  {" "}· {o.supplierName}
                                  {o.quantity !== null ? ` · ${o.quantity}` : ""}
                                </p>
                              ))}
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border border-slate-200 bg-white p-5 text-sm">
              <p className="text-xs text-slate-400">Purchase Order terkait</p>
              {linked.size === 0 ? (
                <p className="mt-1 text-slate-500">Belum ada PO untuk pesanan ini.</p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {[...linked.values()].map((p) => (
                    <li key={p.id}>
                      <Link href={`/supply-chain/purchase-orders/${p.id}`} className="font-mono text-xs hover:underline">{p.poNumber}</Link>
                      <span className="ml-2 text-xs uppercase text-slate-500">{p.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
