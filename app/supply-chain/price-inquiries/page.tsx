"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard-layout";

interface Row {
  id: string; number: string; title: string; inquiryDate: string; neededDate: string | null; status: string;
  soNumber: string | null; vendorCount: number; itemCount: number; quotedCount: number; awardedCount: number; poCount: number;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", open: "Menunggu penawaran", awarded: "Vendor dipilih", closed: "Selesai", cancelled: "Dibatalkan",
};
const th = "px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400";
const td = "px-4 py-2.5 text-sm text-slate-700";

export default function PriceInquiriesPage() {
  const { status } = useSession();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/login");
    if (status === "authenticated") {
      fetch("/api/price-inquiries")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Gagal memuat"))))
        .then(setRows)
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }
  }, [status, router]);

  const remove = async (r: Row) => {
    if (!confirm(`Hapus permintaan harga ${r.number}? PO yang sudah dibuat tidak ikut terhapus.`)) return;
    const res = await fetch(`/api/price-inquiries/${r.id}`, { method: "DELETE" });
    if (res.ok) setRows((p) => p.filter((x) => x.id !== r.id));
  };

  const shown = rows.filter((r) => `${r.number} ${r.title} ${r.soNumber ?? ""}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Perbandingan harga vendor</h1>
            <p className="mt-1 text-slate-600">Minta harga ke beberapa vendor, bandingkan, lalu buat PO dari yang terpilih.</p>
          </div>
          <div className="flex gap-3">
            <Link href="/supply-chain/price-history" className="border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Riwayat harga beli</Link>
            <Link href="/supply-chain/price-inquiries/new" className="bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Permintaan harga baru</Link>
          </div>
        </div>

        <input className="h-10 w-full max-w-md border border-slate-300 bg-white px-3 text-sm" placeholder="Cari nomor, judul, atau SO" value={search} onChange={(e) => setSearch(e.target.value)} />
        {error && <div className="border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}

        <div className="overflow-x-auto border border-slate-200 bg-white">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className={th}>Nomor</th><th className={th}>Judul</th><th className={th}>Tanggal</th><th className={th}>Untuk SO</th>
                <th className={th}>Vendor</th><th className={th}>Sudah dihargai</th><th className={th}>Dipilih</th><th className={th}>PO</th><th className={th}>Status</th><th className={th} />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className={`${td} font-mono text-xs`}><Link href={`/supply-chain/price-inquiries/${r.id}`} className="hover:underline">{r.number}</Link></td>
                  <td className={td}>{r.title}</td>
                  <td className={td}>{new Date(r.inquiryDate).toLocaleDateString("id-ID")}</td>
                  <td className={td}>{r.soNumber ?? "-"}</td>
                  <td className={`${td} tabular-nums`}>{r.vendorCount}</td>
                  <td className={`${td} tabular-nums`}>{r.quotedCount}/{r.itemCount}</td>
                  <td className={`${td} tabular-nums`}>{r.awardedCount}/{r.itemCount}</td>
                  <td className={`${td} tabular-nums`}>{r.poCount || "-"}</td>
                  <td className={td}>{STATUS_LABEL[r.status] || r.status}</td>
                  <td className={`${td} text-right`}>
                    <button className="text-xs text-slate-400 hover:text-red-600" onClick={() => remove(r)}>Hapus</button>
                  </td>
                </tr>
              ))}
              {!loading && shown.length === 0 && (
                <tr><td colSpan={10} className="px-5 py-10 text-center text-sm text-slate-400">Belum ada permintaan harga.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}
