"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Search, Edit, Trash2, Layers } from "lucide-react";

interface Bom {
  id: string;
  bomNumber: string;
  version: number;
  title: string;
  status: string;
  project: { projectNumber: string; projectName: string };
  items: { quantity: string; unitPrice: string }[];
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 ring-slate-200",
  active: "bg-cyan-100 text-cyan-700 ring-cyan-200",
  superseded: "bg-amber-100 text-amber-700 ring-amber-200",
};

export default function BomsPage() {
  const { status } = useSession();
  const router = useRouter();
  const [boms, setBoms] = useState<Bom[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
    if (status === "authenticated") {
      fetchBoms();
    }
  }, [status, router]);

  const fetchBoms = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/boms");
      if (!res.ok) throw new Error("Failed to fetch BOMs");
      const data = await res.json();
      setBoms(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading BOMs");
      setBoms([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, number: string) => {
    if (confirm(`Delete BOM "${number}"?`)) {
      try {
        const res = await fetch(`/api/boms/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to delete");
        setBoms(boms.filter((b) => b.id !== id));
      } catch (err) {
        alert(err instanceof Error ? err.message : "Error deleting BOM");
      }
    }
  };

  const filtered = boms.filter(
    (b) =>
      b.bomNumber.toLowerCase().includes(search.toLowerCase()) ||
      b.title.toLowerCase().includes(search.toLowerCase()) ||
      b.project.projectName.toLowerCase().includes(search.toLowerCase())
  );

  const bomTotal = (b: Bom) => b.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0);
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
              <Layers className="text-cyan-600" size={28} />
              Bill of Materials
            </h1>
            <p className="text-slate-600 mt-1">Material requirements per project</p>
          </div>
          <Button
            onClick={() => router.push("/operational/boms/new")}
            className="gap-2"
          >
            <Plus size={18} />
            New BOM
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Search size={20} className="text-slate-400" />
              <Input
                placeholder="Search by BOM number, title, or project..."
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
              <p className="text-slate-500">No BOMs found</p>
              <Button variant="link" onClick={() => router.push("/operational/boms/new")} className="mt-2">
                Create first BOM
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/60 text-xs uppercase tracking-wide text-slate-400">
                    <th className="text-left px-5 py-3 font-medium">BOM Number</th>
                    <th className="text-left px-5 py-3 font-medium">Title</th>
                    <th className="text-left px-5 py-3 font-medium">Project</th>
                    <th className="text-right px-5 py-3 font-medium">Material Cost</th>
                    <th className="text-left px-5 py-3 font-medium">Status</th>
                    <th className="text-right px-5 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((b) => (
                    <tr key={b.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                      <td className="px-5 py-3 font-mono text-sm text-slate-700">
                        {b.bomNumber} <span className="text-slate-400">v{b.version}</span>
                      </td>
                      <td className="px-5 py-3 font-medium text-slate-900">{b.title}</td>
                      <td className="px-5 py-3 text-slate-500">{b.project.projectName}</td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums text-slate-900">
                        {formatPrice(bomTotal(b))}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${
                            STATUS_STYLES[b.status] || "bg-slate-100 text-slate-700 ring-slate-200"
                          }`}
                        >
                          {b.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right space-x-1">
                        <Button variant="ghost" size="sm" onClick={() => router.push(`/operational/boms/${b.id}`)}>
                          <Edit size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleDelete(b.id, b.bomNumber)}
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
