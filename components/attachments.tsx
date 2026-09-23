"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Item {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string | null;
  uploadedAt: string;
  uploadedByName: string | null;
}

const size = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function Attachments({ referenceType, referenceId }: { referenceType: string; referenceId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/attachments?referenceType=${referenceType}&referenceId=${referenceId}`);
    if (res.ok) setItems(await res.json());
  }, [referenceType, referenceId]);

  useEffect(() => {
    load();
  }, [load]);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("referenceType", referenceType);
      fd.append("referenceId", referenceId);
      fd.append("file", file);
      const res = await fetch("/api/attachments", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Gagal mengunggah file");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengunggah file");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const remove = async (a: Item) => {
    if (!confirm(`Hapus lampiran "${a.fileName}"?`)) return;
    const res = await fetch(`/api/attachments/${a.id}`, { method: "DELETE" });
    if (res.ok) setItems((prev) => prev.filter((x) => x.id !== a.id));
  };

  return (
    <section className="mt-8 border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Lampiran</h3>
          <p className="mt-0.5 text-xs text-slate-400">PDF, gambar, Word, Excel, CSV, TXT, ZIP. Maksimal 4 MB per file.</p>
        </div>
        <div>
          <input
            ref={input}
            type="file"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {busy ? "Mengunggah…" : "Tambah lampiran"}
          </button>
        </div>
      </div>
      {error && <p className="border-b border-red-200 bg-red-50 px-5 py-2 text-sm text-red-800">{error}</p>}
      {items.length === 0 ? (
        <p className="px-5 py-5 text-sm text-slate-400">Belum ada lampiran.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-4 px-5 py-2.5">
              <div className="min-w-0">
                <a
                  href={`/api/attachments/${a.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-sm font-medium text-slate-900 hover:underline"
                >
                  {a.fileName}
                </a>
                <span className="text-xs text-slate-400">
                  {size(a.fileSize)} · {new Date(a.uploadedAt).toLocaleDateString("id-ID")}
                  {a.uploadedByName ? ` · ${a.uploadedByName}` : ""}
                </span>
              </div>
              <button
                type="button"
                onClick={() => remove(a)}
                className="shrink-0 text-xs text-slate-400 hover:text-red-600"
              >
                Hapus
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
