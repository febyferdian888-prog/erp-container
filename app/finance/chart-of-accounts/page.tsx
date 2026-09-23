"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Search, Edit, Trash2, BookOpen } from "lucide-react";

interface Account {
  id: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  isActive: boolean;
}

const TYPE_STYLES: Record<string, string> = {
  Asset: "bg-blue-100 text-blue-700 ring-blue-200",
  Liability: "bg-red-100 text-red-700 ring-red-200",
  Equity: "bg-purple-100 text-purple-700 ring-purple-200",
  Revenue: "bg-green-100 text-green-700 ring-green-200",
  Expense: "bg-amber-100 text-amber-700 ring-amber-200",
};

export default function ChartOfAccountsPage() {
  const { status } = useSession();
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
    if (status === "authenticated") fetchAccounts();
  }, [status, router]);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/chart-of-accounts");
      if (!res.ok) throw new Error("Failed to fetch accounts");
      setAccounts(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading accounts");
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Delete account "${name}"?`)) {
      try {
        const res = await fetch(`/api/chart-of-accounts/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to delete");
        setAccounts(accounts.filter((a) => a.id !== id));
      } catch (err) {
        alert(err instanceof Error ? err.message : "Error deleting account");
      }
    }
  };

  const filtered = accounts.filter(
    (a) =>
      a.accountName.toLowerCase().includes(search.toLowerCase()) ||
      a.accountCode.toLowerCase().includes(search.toLowerCase())
  );

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
              <BookOpen className="text-slate-700" size={28} />
              Chart of Accounts
            </h1>
            <p className="text-slate-600 mt-1">Master list of accounts used in the general ledger</p>
          </div>
          <Button onClick={() => router.push("/finance/chart-of-accounts/new")} className="gap-2">
            <Plus size={18} />
            Add Account
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Search size={20} className="text-slate-400" />
              <Input
                placeholder="Search by code or name..."
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
              <p className="text-slate-500">No accounts found</p>
              <Button variant="link" onClick={() => router.push("/finance/chart-of-accounts/new")} className="mt-2">
                Create first account
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/60 text-xs uppercase tracking-wide text-slate-400">
                    <th className="text-left px-5 py-3 font-medium">Code</th>
                    <th className="text-left px-5 py-3 font-medium">Account Name</th>
                    <th className="text-left px-5 py-3 font-medium">Type</th>
                    <th className="text-left px-5 py-3 font-medium">Status</th>
                    <th className="text-right px-5 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => (
                    <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                      <td className="px-5 py-3 font-mono text-sm text-slate-700">{a.accountCode}</td>
                      <td className="px-5 py-3 font-medium text-slate-900">{a.accountName}</td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                            TYPE_STYLES[a.accountType] || "bg-slate-100 text-slate-700 ring-slate-200"
                          }`}
                        >
                          {a.accountType}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${
                            a.isActive ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-800"
                          }`}
                        >
                          {a.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right space-x-1">
                        <Button variant="ghost" size="sm" onClick={() => router.push(`/finance/chart-of-accounts/${a.id}`)}>
                          <Edit size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleDelete(a.id, a.accountName)}
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
