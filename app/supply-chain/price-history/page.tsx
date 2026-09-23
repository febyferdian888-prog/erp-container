"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard-layout";

interface VendorPrice { supplierId: string; supplierName: string; last: number; lastDate: string; lastRef: string; min: number; max: number; avg: number; count: number }
interface Group { key: string; partNumber: string; description: string; vendors: VendorPrice[] }

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
const th = "px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400";
const thr = th.replace("text-left", "text-right");
const td = "px-4 py-2 text-sm text-slate-700";
const tdr = `${td} text-right tabular-nums`;

export default function PriceHistoryPage() {
  const { status } = useSession();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/login");
  }, [status, router]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setGroups(null);
      return;
    }
    const t = setTimeout(async () => {
      setBusy(true);
      setError(null);
      const res = await fetch(`/api/price-history?q=${encodeURIComponent(q.trim())}`);
      if (res.ok) setGroups((await res.json()).groups);
      else setError("Gagal memuat riwayat harga");
      setBusy(false);
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <Link href="/supply-chain/price-inquiries" className="text-sm text-slate-500 hover:text-slate-900">← Perbandingan harga vendor</Link>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Riwayat harga beli</h1>
          <p className="mt-1 text-slate-600">Harga yang pernah dibayar ke tiap vendor, dari bill dan PO. Harga sebelum PPN.</p>
        </div>

        <input
          autoFocus
          className="h-11 w-full max-w-xl border border-slate-300 bg-white px-3 text-sm"
          placeholder="Ketik nomor part atau nama barang (min. 2 huruf)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {error && <div className="border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
        {busy && <p className="text-sm text-slate-400">Mencari…</p>}

        {groups && groups.length === 0 && !busy && (
          <p className="text-sm text-slate-500">Tidak ada riwayat pembelian untuk &ldquo;{q}&rdquo;. Riwayat terbentuk dari bill vendor dan PO yang sudah diinput.</p>
        )}

        {groups?.map((g) => {
          const cheapest = g.vendors[0];
          return (
            <section key={g.key} className="border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-5 py-3">
                <p className="text-sm font-medium text-slate-900">{g.description}</p>
                <p className="font-mono text-xs text-slate-400">{g.partNumber || "tanpa nomor part"}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className={th}>Vendor</th><th className={thr}>Harga terakhir</th><th className={th}>Tanggal</th><th className={th}>Dokumen</th>
                      <th className={thr}>Terendah</th><th className={thr}>Tertinggi</th><th className={thr}>Rata-rata</th><th className={thr}>Kali beli</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.vendors.map((v) => (
                      <tr key={v.supplierId} className="border-b border-slate-100">
                        <td className={td}>{v.supplierName}{v === cheapest && g.vendors.length > 1 && <span className="ml-2 text-xs text-emerald-700">termurah</span>}</td>
                        <td className={`${tdr} font-semibold`}>{idr(v.last)}</td>
                        <td className={td}>{new Date(v.lastDate + "T00:00:00").toLocaleDateString("id-ID")}</td>
                        <td className={`${td} font-mono text-xs`}>{v.lastRef}</td>
                        <td className={tdr}>{idr(v.min)}</td>
                        <td className={tdr}>{idr(v.max)}</td>
                        <td className={tdr}>{idr(v.avg)}</td>
                        <td className={tdr}>{v.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </DashboardLayout>
  );
}
