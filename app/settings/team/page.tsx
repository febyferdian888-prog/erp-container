"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Users2 } from "lucide-react";
import { AREAS, type Permissions } from "@/lib/rbac-shared";

interface RoleInfo { id: string; name: string; description: string; perms: Permissions }
const LEVEL_LABEL = { none: "—", view: "Lihat", edit: "Ubah" } as const;

interface Membership {
  id: string;
  isActive: boolean;
  user: { id: string; name: string | null; email: string; isActive: boolean; lastLogin: string | null };
  role: { id: string; name: string };
}

function initialsOf(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

const ROLE_STYLES: Record<string, string> = {
  Owner: "bg-slate-800 text-white",
  Admin: "bg-slate-800 text-white",
};

export default function TeamMembersPage() {
  const { status, data: session } = useSession();
  const router = useRouter();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState("");
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [editFor, setEditFor] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "", roleId: "" });

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
    if (status === "authenticated") {
      fetchMemberships();
      fetch("/api/roles").then((r) => (r.ok ? r.json() : [])).then(setRoles).catch(() => {});
    }
  }, [status, router]);

  const fetchMemberships = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/memberships");
      if (!res.ok) throw new Error("Failed to fetch team members");
      setMemberships(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading team members");
    } finally {
      setLoading(false);
    }
  };

  const changeRole = async (m: Membership, roleId: string) => {
    setError(null);
    const res = await fetch(`/api/memberships/${m.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roleId }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) return setError(body?.error || "Gagal mengubah peran");
    setMemberships((prev) => prev.map((item) => (item.id === m.id ? { ...item, role: body.role } : item)));
  };

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/memberships", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const body = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) return setError(body?.error || "Gagal menambah anggota");
    setMemberships((prev) => [...prev, body]);
    setForm({ name: "", email: "", password: "", roleId: "" });
    setAdding(false);
  };

  const resetPassword = async (m: Membership) => {
    setError(null);
    setResetMsg(null);
    const res = await fetch(`/api/memberships/${m.id}/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: resetPw }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) return setError(body?.error || "Gagal mengatur ulang password");
    setResetMsg(`Password ${m.user.email} sudah diatur ulang. Sampaikan langsung ke yang bersangkutan dan minta diganti setelah login.`);
    setResetFor(null);
    setResetPw("");
  };

  const startEdit = (m: Membership) => {
    setEditFor(m.id);
    setEditName(m.user.name || "");
    setEditEmail(m.user.email);
    setError(null);
  };

  const saveEdit = async (m: Membership) => {
    setError(null);
    const res = await fetch(`/api/memberships/${m.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, email: editEmail }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) return setError(body?.error || "Gagal menyimpan perubahan");
    setMemberships((prev) => prev.map((item) => (item.id === m.id ? { ...item, user: { ...item.user, name: body.user.name, email: body.user.email } } : item)));
    setEditFor(null);
  };

  const removeMember = async (m: Membership) => {
    if (!confirm(`Hapus ${m.user.name || m.user.email} dari daftar anggota? Aksi ini tidak bisa dibatalkan.`)) return;
    setError(null);
    const res = await fetch(`/api/memberships/${m.id}`, { method: "DELETE" });
    const body = await res.json().catch(() => null);
    if (!res.ok) return setError(body?.error || "Gagal menghapus anggota");
    setMemberships((prev) => prev.filter((item) => item.id !== m.id));
  };

  const toggleActive = async (m: Membership) => {
    try {
      const res = await fetch(`/api/memberships/${m.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !m.isActive }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Failed to update member");
      const updated = await res.json();
      setMemberships((prev) => prev.map((item) => (item.id === m.id ? { ...item, isActive: updated.isActive } : item)));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error updating member");
    }
  };

  if (status === "loading" || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <p className="text-slate-500">Loading...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <button
          onClick={() => router.push("/settings")}
          className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft size={16} />
          Back to Settings
        </button>

        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <Users2 className="text-slate-700" size={28} />
            Team Members
          </h1>
          <p className="text-slate-600 mt-1">Everyone with access to this company and their role</p>
        </div>

        {resetMsg && <div className="border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{resetMsg}</div>}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">{error}</div>
        )}

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => setAdding((v) => !v)}>{adding ? "Batal" : "Tambah anggota"}</Button>
        </div>

        {adding && (
          <form onSubmit={addMember} className="grid gap-4 border border-slate-200 bg-white p-5 sm:grid-cols-2">
            <label className="text-sm text-slate-700">Nama
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 h-10 w-full border border-slate-300 px-3" />
            </label>
            <label className="text-sm text-slate-700">Email
              <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1 h-10 w-full border border-slate-300 px-3" />
            </label>
            <label className="text-sm text-slate-700">Password awal (min. 8 karakter)
              <input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="mt-1 h-10 w-full border border-slate-300 px-3" />
              <span className="text-xs text-slate-400">Kosongkan bila email sudah terdaftar sebagai pengguna.</span>
            </label>
            <label className="text-sm text-slate-700">Peran
              <select required value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })} className="mt-1 h-10 w-full border border-slate-300 bg-white px-2">
                <option value="">Pilih peran…</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}. {r.description}</option>)}
              </select>
            </label>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={saving}>{saving ? "Menyimpan…" : "Tambahkan"}</Button>
            </div>
          </form>
        )}

        <div className="border border-slate-200 bg-white overflow-hidden">
          {memberships.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-500">No team members found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/60 text-xs uppercase tracking-wide text-slate-400">
                    <th className="text-left px-5 py-3 font-medium">Member</th>
                    <th className="text-left px-5 py-3 font-medium">Email</th>
                    <th className="text-left px-5 py-3 font-medium">Role</th>
                    <th className="text-left px-5 py-3 font-medium">Last Login</th>
                    <th className="text-left px-5 py-3 font-medium">Access</th>
                    <th className="text-right px-5 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {memberships.map((m) => {
                    const isSelf = m.user.email === session?.user?.email;
                    return (
                      <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                              {initialsOf(m.user.name || m.user.email)}
                            </div>
                            {editFor === m.id ? (
                              <div className="flex flex-col gap-1.5">
                                <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nama" className="h-8 w-40 border border-slate-300 px-2 text-sm" />
                                <input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="Email" className="h-8 w-52 border border-slate-300 px-2 text-sm" />
                                <div className="flex gap-2">
                                  <Button size="sm" onClick={() => saveEdit(m)}>Simpan</Button>
                                  <Button variant="ghost" size="sm" onClick={() => setEditFor(null)}>Batal</Button>
                                </div>
                              </div>
                            ) : (
                              <div>
                                <div className="font-medium text-slate-900">{m.user.name || "-"}</div>
                                {isSelf && <div className="text-xs text-slate-400">You</div>}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-slate-500">{m.user.email}</td>
                        <td className="px-5 py-3">
                          {roles.length > 0 && !isSelf ? (
                            <select
                              value={m.role.id}
                              onChange={(e) => changeRole(m, e.target.value)}
                              className="h-9 border border-slate-300 bg-white px-2 text-sm"
                            >
                              {roles.map((r) => (
                                <option key={r.id} value={r.id}>{r.name}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-sm font-medium text-slate-700">{m.role.name}</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-slate-500">
                          {m.user.lastLogin ? new Date(m.user.lastLogin).toLocaleDateString("id-ID") : "Never"}
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={`px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${
                              m.isActive ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {m.isActive ? "Active" : "Suspended"}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Button variant="ghost" size="sm" disabled={isSelf} onClick={() => startEdit(m)}>
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isSelf}
                            title={isSelf ? "You cannot change your own access" : undefined}
                            className={m.isActive ? "text-red-600 hover:text-red-700 hover:bg-red-50" : "text-green-700 hover:bg-green-50"}
                            onClick={() => toggleActive(m)}
                          >
                            {m.isActive ? "Suspend" : "Reactivate"}
                          </Button>
                          {!isSelf && (
                            <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => removeMember(m)}>
                              Hapus
                            </Button>
                          )}
                          {!isSelf && (
                            <Button variant="ghost" size="sm" onClick={() => { setResetFor(resetFor === m.id ? null : m.id); setResetPw(""); setResetMsg(null); }}>
                              Reset password
                            </Button>
                          )}
                          {resetFor === m.id && (
                            <div className="mt-2 flex items-center justify-end gap-2">
                              <input
                                type="password"
                                autoComplete="new-password"
                                placeholder="Password baru"
                                value={resetPw}
                                onChange={(e) => setResetPw(e.target.value)}
                                className="h-9 w-44 border border-slate-300 px-2 text-sm"
                              />
                              <Button size="sm" disabled={resetPw.length < 8} onClick={() => resetPassword(m)}>Simpan</Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {roles.length > 0 && (
          <section className="border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Hak akses tiap peran</h3>
              <p className="mt-0.5 text-xs text-slate-400">Lihat = boleh membuka data. Ubah = boleh membuat, mengedit, dan menghapus. Pengguna dengan beberapa peran mendapat gabungan tertinggi.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-2 text-left font-medium">Peran</th>
                    {AREAS.map((a) => <th key={a.key} className="px-4 py-2 text-left font-medium">{a.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {roles.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100">
                      <td className="px-4 py-2 font-medium text-slate-900">{r.name}</td>
                      {AREAS.map((a) => (
                        <td key={a.key} className={`px-4 py-2 ${r.perms[a.key] === "edit" ? "text-slate-900" : r.perms[a.key] === "view" ? "text-slate-500" : "text-slate-300"}`}>
                          {LEVEL_LABEL[r.perms[a.key]]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
