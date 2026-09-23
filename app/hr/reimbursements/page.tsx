"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Search, Edit, Trash2, Wallet } from "lucide-react";

interface Reimbursement {
  id: string;
  reimbursementNumber: string;
  submissionDate: string;
  category: string | null;
  amount: string;
  status: string;
  employee: { employeeNumber: string; name: string; department: string | null };
  project: { projectNumber: string } | null;
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 ring-amber-200",
  approved: "bg-pink-100 text-pink-700 ring-pink-200",
  rejected: "bg-red-100 text-red-700 ring-red-200",
  paid: "bg-green-100 text-green-700 ring-green-200",
};

export default function ReimbursementsPage() {
  const { status } = useSession();
  const router = useRouter();
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
    if (status === "authenticated") fetchReimbursements();
  }, [status, router]);

  const fetchReimbursements = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/reimbursements");
      if (!res.ok) throw new Error("Failed to fetch reimbursements");
      setReimbursements(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading reimbursements");
      setReimbursements([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, number: string) => {
    if (confirm(`Delete reimbursement "${number}"?`)) {
      try {
        const res = await fetch(`/api/reimbursements/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to delete");
        setReimbursements(reimbursements.filter((r) => r.id !== id));
      } catch (err) {
        alert(err instanceof Error ? err.message : "Error deleting reimbursement");
      }
    }
  };

  const filtered = reimbursements.filter(
    (r) =>
      r.employee.name.toLowerCase().includes(search.toLowerCase()) ||
      r.reimbursementNumber.toLowerCase().includes(search.toLowerCase())
  );

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
              <Wallet className="text-pink-600" size={28} />
              Reimbursements
            </h1>
            <p className="text-slate-600 mt-1">Employee expense reimbursement requests</p>
          </div>
          <Button onClick={() => router.push("/hr/reimbursements/new")} className="gap-2">
            <Plus size={18} />
            New Reimbursement
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Search size={20} className="text-slate-400" />
              <Input
                placeholder="Search by employee or number..."
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
              <p className="text-slate-500">No reimbursements found</p>
              <Button variant="link" onClick={() => router.push("/hr/reimbursements/new")} className="mt-2">
                Create first request
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/60 text-xs uppercase tracking-wide text-slate-400">
                    <th className="text-left px-5 py-3 font-medium">Number</th>
                    <th className="text-left px-5 py-3 font-medium">Employee</th>
                    <th className="text-left px-5 py-3 font-medium">Category</th>
                    <th className="text-left px-5 py-3 font-medium">Project</th>
                    <th className="text-right px-5 py-3 font-medium">Amount</th>
                    <th className="text-left px-5 py-3 font-medium">Status</th>
                    <th className="text-right px-5 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                      <td className="px-5 py-3 font-mono text-sm text-slate-700">{r.reimbursementNumber}</td>
                      <td className="px-5 py-3 font-medium text-slate-900">{r.employee.name}</td>
                      <td className="px-5 py-3 text-slate-500">{r.category || "-"}</td>
                      <td className="px-5 py-3 text-slate-500">{r.project?.projectNumber || "-"}</td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums text-slate-900">
                        {formatPrice(Number(r.amount))}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${
                            STATUS_STYLES[r.status] || "bg-slate-100 text-slate-700 ring-slate-200"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right space-x-1">
                        <Button variant="ghost" size="sm" onClick={() => router.push(`/hr/reimbursements/${r.id}`)}>
                          <Edit size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleDelete(r.id, r.reimbursementNumber)}
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
