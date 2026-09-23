"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Search, Edit, Trash2, Wrench } from "lucide-react";

interface WorkOrder {
  id: string;
  orderNumber: string;
  title: string | null;
  status: string;
  targetEndDate: string | null;
  project: { projectNumber: string; projectName: string };
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 ring-slate-200",
  released: "bg-violet-100 text-violet-700 ring-violet-200",
  in_progress: "bg-amber-100 text-amber-700 ring-amber-200",
  completed: "bg-green-100 text-green-700 ring-green-200",
  cancelled: "bg-red-100 text-red-700 ring-red-200",
};

export default function WorkOrdersPage() {
  const { status } = useSession();
  const router = useRouter();
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
    if (status === "authenticated") {
      fetchOrders();
    }
  }, [status, router]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/work-orders");
      if (!res.ok) throw new Error("Failed to fetch work orders");
      const data = await res.json();
      setOrders(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading work orders");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, number: string) => {
    if (confirm(`Delete work order "${number}"?`)) {
      try {
        const res = await fetch(`/api/work-orders/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to delete");
        setOrders(orders.filter((o) => o.id !== id));
      } catch (err) {
        alert(err instanceof Error ? err.message : "Error deleting work order");
      }
    }
  };

  const filtered = orders.filter(
    (o) =>
      o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
      (o.title || "").toLowerCase().includes(search.toLowerCase()) ||
      o.project.projectName.toLowerCase().includes(search.toLowerCase())
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
              <Wrench className="text-violet-600" size={28} />
              Work Orders (SPK)
            </h1>
            <p className="text-slate-600 mt-1">Shop-floor work instructions tied to a project</p>
          </div>
          <Button
            onClick={() => router.push("/operational/work-orders/new")}
            className="gap-2"
          >
            <Plus size={18} />
            New Work Order
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Search size={20} className="text-slate-400" />
              <Input
                placeholder="Search by SPK number, title, or project..."
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
              <p className="text-slate-500">No work orders found</p>
              <Button variant="link" onClick={() => router.push("/operational/work-orders/new")} className="mt-2">
                Create first work order
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/60 text-xs uppercase tracking-wide text-slate-400">
                    <th className="text-left px-5 py-3 font-medium">SPK Number</th>
                    <th className="text-left px-5 py-3 font-medium">Title</th>
                    <th className="text-left px-5 py-3 font-medium">Project</th>
                    <th className="text-left px-5 py-3 font-medium">Target Completion</th>
                    <th className="text-left px-5 py-3 font-medium">Status</th>
                    <th className="text-right px-5 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((o) => (
                    <tr key={o.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                      <td className="px-5 py-3 font-mono text-sm text-slate-700">{o.orderNumber}</td>
                      <td className="px-5 py-3 font-medium text-slate-900">{o.title || "-"}</td>
                      <td className="px-5 py-3 text-slate-500">{o.project.projectName}</td>
                      <td className="px-5 py-3 text-slate-500">
                        {o.targetEndDate ? new Date(o.targetEndDate).toLocaleDateString("id-ID") : "-"}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${
                            STATUS_STYLES[o.status] || "bg-slate-100 text-slate-700 ring-slate-200"
                          }`}
                        >
                          {o.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right space-x-1">
                        <Button variant="ghost" size="sm" onClick={() => router.push(`/operational/work-orders/${o.id}`)}>
                          <Edit size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleDelete(o.id, o.orderNumber)}
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
