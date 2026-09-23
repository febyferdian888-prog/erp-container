"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Search, Edit, Trash2, Warehouse as WarehouseIcon } from "lucide-react";

interface Warehouse {
  id: string;
  code: string;
  name: string;
  type: string;
  address: string | null;
  isActive: boolean;
  stocks: { id: string }[];
}

export default function WarehousesPage() {
  const { status } = useSession();
  const router = useRouter();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
    if (status === "authenticated") fetchWarehouses();
  }, [status, router]);

  const fetchWarehouses = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/warehouses");
      if (!res.ok) throw new Error("Failed to fetch warehouses");
      setWarehouses(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading warehouses");
      setWarehouses([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Delete warehouse "${name}"?`)) {
      try {
        const res = await fetch(`/api/warehouses/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to delete");
        setWarehouses(warehouses.filter((w) => w.id !== id));
      } catch (err) {
        alert(err instanceof Error ? err.message : "Error deleting warehouse");
      }
    }
  };

  const filtered = warehouses.filter(
    (w) => w.name.toLowerCase().includes(search.toLowerCase()) || w.code.toLowerCase().includes(search.toLowerCase())
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
              <WarehouseIcon className="text-slate-700" size={28} />
              Warehouses
            </h1>
            <p className="text-slate-600 mt-1">Physical locations that hold sparepart and material stock</p>
          </div>
          <Button onClick={() => router.push("/supply-chain/warehouses/new")} className="gap-2">
            <Plus size={18} />
            Add Warehouse
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
              <p className="text-slate-500">No warehouses found</p>
              <Button variant="link" onClick={() => router.push("/supply-chain/warehouses/new")} className="mt-2">
                Add first warehouse
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/60 text-xs uppercase tracking-wide text-slate-400">
                    <th className="text-left px-5 py-3 font-medium">Code</th>
                    <th className="text-left px-5 py-3 font-medium">Name</th>
                    <th className="text-left px-5 py-3 font-medium">Type</th>
                    <th className="text-left px-5 py-3 font-medium">Address</th>
                    <th className="text-left px-5 py-3 font-medium">SKUs Stocked</th>
                    <th className="text-left px-5 py-3 font-medium">Status</th>
                    <th className="text-right px-5 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((w) => (
                    <tr key={w.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                      <td className="px-5 py-3 font-mono text-sm text-slate-700">{w.code}</td>
                      <td className="px-5 py-3 font-medium text-slate-900">{w.name}</td>
                      <td className="px-5 py-3 text-slate-500 capitalize">{w.type}</td>
                      <td className="px-5 py-3 text-slate-500">{w.address || "-"}</td>
                      <td className="px-5 py-3 text-slate-500">{w.stocks.length}</td>
                      <td className="px-5 py-3">
                        <span className={`px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${w.isActive ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-800"}`}>
                          {w.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right space-x-1">
                        <Button variant="ghost" size="sm" onClick={() => router.push(`/supply-chain/warehouses/${w.id}`)}>
                          <Edit size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleDelete(w.id, w.name)}
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
