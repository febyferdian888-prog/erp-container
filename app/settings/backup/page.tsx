"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard-layout";

interface Listing {
  canBackup: boolean;
  lastBackup: { at: string; by: string } | null;
  datasets: { key: string; label: string; group: string; dated: boolean }[];
}

const btn = "border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const field = "h-9 border border-slate-300 bg-white px-2 text-sm";

export default function BackupPage() {
  const { status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [now, setNow] = useState<number | null>(null);

  const load = () =>
    fetch("/api/export?list=1")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((listing: Listing) => {
        setData(listing);
        setNow(Date.now());
      })
      .catch(() => setError("Gagal memuat daftar data"));

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/login");
    if (status === "authenticated") load();
  }, [status, router]);

  const download = async (key: string, dated: boolean) => {
    setBusy(key);
    setError(null);
    try {
      const p = new URLSearchParams({ dataset: key });
      if (dated && from) p.set("from", from);
      if (dated && to) p.set("to", to);
      const res = await fetch(`/api/export?${p}`);
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Gagal mengunduh");
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] || `${key}.xlsx`;
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      if (key === "all") load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengunduh");
    } finally {
      setBusy(null);
    }
  };

  const groups = data ? [...new Set(data.datasets.map((d) => d.group))] : [];
  const daysSince = data?.lastBackup && now !== null ? Math.floor((now - new Date(data.lastBackup.at).getTime()) / 86400000) : null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <Link href="/settings" className="text-sm text-slate-500 hover:text-slate-900">← Pengaturan</Link>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Backup dan ekspor data</h1>
          <p className="mt-1 text-slate-600">Salinan data Anda dalam Excel, di luar Supabase.</p>
        </div>

        {error && <div className="border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}

        {data?.canBackup && (
          <section className="border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-xl">
                <h2 className="text-lg font-semibold text-slate-900">Backup lengkap</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Satu file Excel berisi semua data bisnis: customer, vendor, sparepart dan stok, seluruh dokumen penjualan dan pembelian
                  beserta itemnya, invoice, pembayaran, jurnal, proyek, HR, audit log, dan daftar tim. Satu lembar per jenis data.
                </p>
                <p className={`mt-2 text-sm ${daysSince === null || daysSince > 30 ? "text-brand" : "text-slate-500"}`}>
                  {data.lastBackup
                    ? `Backup terakhir: ${new Date(data.lastBackup.at).toLocaleString("id-ID")} oleh ${data.lastBackup.by} (${daysSince === 0 ? "hari ini" : `${daysSince} hari lalu`}).`
                    : "Belum pernah ada backup lengkap dari aplikasi ini."}
                  {(daysSince === null || daysSince > 30) && " Disarankan sebulan sekali."}
                </p>
              </div>
              <button className="bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50" disabled={busy !== null} onClick={() => download("all", false)}>
                {busy === "all" ? "Menyiapkan file…" : "Unduh backup (.xlsx)"}
              </button>
            </div>
            <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-slate-500">
              <li>File ini untuk arsip dan dibaca ulang di Excel. Bukan untuk dipulihkan otomatis ke ERP.</li>
              <li>Isi file lampiran (PDF, foto) dan password pengguna tidak ikut. Lampiran hanya tercatat sebagai daftar.</li>
              <li>Simpan di tempat terpisah dari komputer kerja, dan perlakukan sebagai dokumen rahasia karena berisi data keuangan dan HR.</li>
            </ul>
          </section>
        )}

        <section className="border border-slate-200 bg-white">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 px-5 py-3">
            <div>
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Ekspor per jenis data</h2>
              <p className="mt-0.5 text-xs text-slate-400">Yang tampil sesuai peran Anda. Periode berlaku untuk dokumen bertanda tanggal.</p>
            </div>
            <div className="flex gap-3">
              <label className="text-xs text-slate-500">Dari <input type="date" className={`${field} ml-1`} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
              <label className="text-xs text-slate-500">Sampai <input type="date" className={`${field} ml-1`} value={to} onChange={(e) => setTo(e.target.value)} /></label>
            </div>
          </div>
          {!data && !error && <p className="px-5 py-6 text-sm text-slate-400">Memuat…</p>}
          {groups.map((g) => (
            <div key={g} className="border-b border-slate-100 last:border-0">
              <p className="bg-slate-50 px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{g}</p>
              <ul className="divide-y divide-slate-100">
                {data!.datasets.filter((d) => d.group === g).map((d) => (
                  <li key={d.key} className="flex items-center justify-between gap-4 px-5 py-2.5">
                    <span className="text-sm text-slate-800">
                      {d.label}
                      {d.dated && (from || to) && <span className="ml-2 text-xs text-slate-400">dengan periode</span>}
                    </span>
                    <button className={btn} disabled={busy !== null} onClick={() => download(d.key, d.dated)}>
                      {busy === d.key ? "Menyiapkan…" : "Unduh"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      </div>
    </DashboardLayout>
  );
}
