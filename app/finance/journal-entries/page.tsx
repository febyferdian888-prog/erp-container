"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Search, Edit, Trash2, BookText } from "lucide-react";

interface JournalEntry {
  id: string;
  entryNumber: string;
  sourceType?: string | null;
  entryDate: string;
  description: string | null;
  status: string;
  lines: { debitAmount: string; creditAmount: string }[];
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 ring-slate-200",
  posted: "bg-fuchsia-100 text-fuchsia-700 ring-fuchsia-200",
  reversed: "bg-red-100 text-red-700 ring-red-200",
};

export default function JournalEntriesPage() {
  const { status } = useSession();
  const router = useRouter();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
    if (status === "authenticated") fetchEntries();
  }, [status, router]);

  const fetchEntries = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/journal-entries");
      if (!res.ok) throw new Error("Failed to fetch journal entries");
      setEntries(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading journal entries");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, number: string) => {
    if (confirm(`Delete journal entry "${number}"?`)) {
      try {
        const res = await fetch(`/api/journal-entries/${id}`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to delete");
        }
        setEntries(entries.filter((e) => e.id !== id));
      } catch (err) {
        alert(err instanceof Error ? err.message : "Error deleting journal entry");
      }
    }
  };

  const filtered = entries.filter(
    (e) =>
      e.entryNumber.toLowerCase().includes(search.toLowerCase()) ||
      (e.description || "").toLowerCase().includes(search.toLowerCase())
  );

  const entryTotal = (e: JournalEntry) => e.lines.reduce((sum, l) => sum + Number(l.debitAmount), 0);
  const formatPrice = (value: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(value);

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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              <BookText className="text-fuchsia-600" size={28} />
              Journal Entries
            </h1>
            <p className="text-slate-600 mt-1">Manual general ledger postings</p>
          </div>
          <Button onClick={() => router.push("/finance/journal-entries/new")} className="gap-2">
            <Plus size={18} />
            New Journal Entry
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Search size={20} className="text-slate-400" />
              <Input
                placeholder="Search by entry number or description..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="border-0"
              />
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">{error}</div>
        )}

        <div className="border border-slate-200 bg-white overflow-hidden">
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-500">No journal entries found</p>
              <Button variant="link" onClick={() => router.push("/finance/journal-entries/new")} className="mt-2">
                Create first entry
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/60 text-xs uppercase tracking-wide text-slate-400">
                    <th className="text-left px-5 py-3 font-medium">Entry Number</th>
                    <th className="text-left px-5 py-3 font-medium">Date</th>
                    <th className="text-left px-5 py-3 font-medium">Description</th>
                    <th className="text-right px-5 py-3 font-medium">Amount</th>
                    <th className="text-left px-5 py-3 font-medium">Status</th>
                    <th className="text-right px-5 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => (
                    <tr key={e.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                      <td className="px-5 py-3 font-mono text-sm text-slate-700">
                        {e.entryNumber}
                        {e.sourceType && <span className="ml-2 text-[10px] font-sans uppercase tracking-wide text-slate-400">otomatis · {e.sourceType}</span>}
                      </td>
                      <td className="px-5 py-3 text-slate-500">{new Date(e.entryDate).toLocaleDateString("id-ID")}</td>
                      <td className="px-5 py-3 text-slate-700">{e.description || "-"}</td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums text-slate-900">
                        {formatPrice(entryTotal(e))}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${
                            STATUS_STYLES[e.status] || "bg-slate-100 text-slate-700 ring-slate-200"
                          }`}
                        >
                          {e.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right space-x-1">
                        <Button variant="ghost" size="sm" onClick={() => router.push(`/finance/journal-entries/${e.id}`)}>
                          <Edit size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleDelete(e.id, e.entryNumber)}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
