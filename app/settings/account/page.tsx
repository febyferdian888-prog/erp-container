"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { usePermissions } from "@/components/permissions";

const field = "mt-1 h-10 w-full border border-slate-300 bg-white px-3 text-sm";

export default function AccountPage() {
  const { status } = useSession();
  const router = useRouter();
  const { me } = usePermissions();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/login");
  }, [status, router]);

  const mismatch = confirm !== "" && next !== confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next !== confirm) return setError("Konfirmasi password baru tidak sama");
    setBusy(true);
    const res = await fetch("/api/account/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    });
    const body = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setError(body?.error || "Gagal mengganti password");
    setCurrent("");
    setNext("");
    setConfirm("");
    setDone(true);
  };

  return (
    <DashboardLayout>
      <div className="max-w-xl space-y-6">
        <div>
          <Link href="/settings" className="text-sm text-slate-500 hover:text-slate-900">← Pengaturan</Link>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Akun dan password</h1>
        </div>

        <section className="border border-slate-200 bg-white p-5">
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[120px_1fr]">
            <dt className="text-slate-400">Nama</dt><dd className="text-slate-900">{me?.name || "-"}</dd>
            <dt className="text-slate-400">Email</dt><dd className="text-slate-900">{me?.email || "-"}</dd>
            <dt className="text-slate-400">Peran</dt><dd className="text-slate-900">{me?.roles.join(", ") || "-"}</dd>
          </dl>
        </section>

        <section className="border border-slate-200 bg-white p-5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Ganti password</h2>

          {done ? (
            <div className="mt-4 space-y-3">
              <p className="border-l-2 border-emerald-500 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                Password sudah diganti. Gunakan password baru saat login berikutnya.
              </p>
              <div className="flex gap-3">
                <button className="border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={() => setDone(false)}>Selesai</button>
                <button className="border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={() => signOut({ callbackUrl: "/auth/login" })}>Keluar sekarang</button>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-4 space-y-4">
              {error && <div className="border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
              <label className="block text-sm text-slate-700" htmlFor="current">Password lama
                <input id="current" type="password" autoComplete="current-password" required className={field} value={current} onChange={(e) => setCurrent(e.target.value)} />
              </label>
              <label className="block text-sm text-slate-700" htmlFor="next">Password baru
                <input id="next" type="password" autoComplete="new-password" required minLength={8} className={field} value={next} onChange={(e) => setNext(e.target.value)} />
                <span className="text-xs text-slate-400">Minimal 8 karakter, mengandung huruf dan angka.</span>
              </label>
              <label className="block text-sm text-slate-700" htmlFor="confirm">Ulangi password baru
                <input id="confirm" type="password" autoComplete="new-password" required className={`${field} ${mismatch ? "border-red-400" : ""}`} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                {mismatch && <span className="text-xs text-brand">Tidak sama dengan password baru.</span>}
              </label>
              <button type="submit" disabled={busy || mismatch} className="bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                {busy ? "Menyimpan…" : "Ganti password"}
              </button>
            </form>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}
