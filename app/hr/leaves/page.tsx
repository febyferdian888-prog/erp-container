"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Search, Edit, Trash2, CalendarDays } from "lucide-react";

interface LeaveRequest {
  id: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  status: string;
  employee: { employeeNumber: string; name: string; department: string | null };
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 ring-amber-200",
  approved: "bg-lime-100 text-lime-700 ring-lime-200",
  rejected: "bg-red-100 text-red-700 ring-red-200",
  cancelled: "bg-slate-100 text-slate-700 ring-slate-200",
};

export default function LeavesPage() {
  const { status } = useSession();
  const router = useRouter();
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
    if (status === "authenticated") fetchLeaves();
  }, [status, router]);

  const fetchLeaves = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/leaves");
      if (!res.ok) throw new Error("Failed to fetch leave requests");
      setLeaves(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading leave requests");
      setLeaves([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Delete leave request for "${name}"?`)) {
      try {
        const res = await fetch(`/api/leaves/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to delete");
        setLeaves(leaves.filter((l) => l.id !== id));
      } catch (err) {
        alert(err instanceof Error ? err.message : "Error deleting leave request");
      }
    }
  };

  const filtered = leaves.filter(
    (l) =>
      l.employee.name.toLowerCase().includes(search.toLowerCase()) ||
      l.leaveType.toLowerCase().includes(search.toLowerCase())
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
              <CalendarDays className="text-lime-700" size={28} />
              Leave Requests
            </h1>
            <p className="text-slate-600 mt-1">Employee time-off requests and approvals</p>
          </div>
          <Button onClick={() => router.push("/hr/leaves/new")} className="gap-2">
            <Plus size={18} />
            New Leave Request
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Search size={20} className="text-slate-400" />
              <Input
                placeholder="Search by employee or leave type..."
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
              <p className="text-slate-500">No leave requests found</p>
              <Button variant="link" onClick={() => router.push("/hr/leaves/new")} className="mt-2">
                Create first request
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/60 text-xs uppercase tracking-wide text-slate-400">
                    <th className="text-left px-5 py-3 font-medium">Employee</th>
                    <th className="text-left px-5 py-3 font-medium">Type</th>
                    <th className="text-left px-5 py-3 font-medium">Period</th>
                    <th className="text-right px-5 py-3 font-medium">Days</th>
                    <th className="text-left px-5 py-3 font-medium">Status</th>
                    <th className="text-right px-5 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((l) => (
                    <tr key={l.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                      <td className="px-5 py-3">
                        <div className="font-medium text-slate-900">{l.employee.name}</div>
                        <div className="text-xs text-slate-400">{l.employee.department || "-"}</div>
                      </td>
                      <td className="px-5 py-3 text-slate-700">{l.leaveType}</td>
                      <td className="px-5 py-3 text-slate-500">
                        {new Date(l.startDate).toLocaleDateString("id-ID")} – {new Date(l.endDate).toLocaleDateString("id-ID")}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums text-slate-900">{l.days}</td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${
                            STATUS_STYLES[l.status] || "bg-slate-100 text-slate-700 ring-slate-200"
                          }`}
                        >
                          {l.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right space-x-1">
                        <Button variant="ghost" size="sm" onClick={() => router.push(`/hr/leaves/${l.id}`)}>
                          <Edit size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleDelete(l.id, l.employee.name)}
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
