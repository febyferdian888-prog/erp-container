"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Search, Boxes, AlertTriangle, History } from "lucide-react";

interface StockRow {
  id: string;
  quantity: string;
  minimumStock: string;
  warehouse: { id: string; code: string; name: string };
  product: { id: string; sku: string; name: string; unit: { code: string } };
}

export default function StockPage() {
  const { status } = useSession();
  const router = useRouter();
  const [stocks, setStocks] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
    if (status === "authenticated") fetchStock();
  }, [status, router]);

  const fetchStock = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/stock");
      if (!res.ok) throw new Error("Failed to fetch stock");
      setStocks(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading stock");
      setStocks([]);
    } finally {
      setLoading(false);
    }
  };

  const filtered = stocks.filter(
    (s) =>
      s.product.name.toLowerCase().includes(search.toLowerCase()) ||
      s.product.sku.toLowerCase().includes(search.toLowerCase()) ||
      s.warehouse.name.toLowerCase().includes(search.toLowerCase())
  );

  const lowStockCount = stocks.filter((s) => Number(s.quantity) <= Number(s.minimumStock)).length;

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
              <Boxes className="text-teal-600" size={28} />
              Stock Levels
            </h1>
            <p className="text-slate-600 mt-1">Current quantity on hand per warehouse</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => router.push("/supply-chain/stock/movements")}
              className="gap-2 rounded-lg"
            >
              <History size={18} />
              Movement History
            </Button>
            <Button
              onClick={() => router.push("/supply-chain/stock/movements/new")}
              className="gap-2"
            >
              <Plus size={18} />
              Record Movement
            </Button>
          </div>
        </div>

        {lowStockCount > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 flex items-center gap-2">
            <AlertTriangle size={16} />
            {lowStockCount} item{lowStockCount !== 1 ? "s are" : " is"} at or below its minimum stock level.
          </div>
        )}

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Search size={20} className="text-slate-400" />
              <Input
                placeholder="Search by SKU, product, or warehouse..."
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
              <p className="text-slate-500">No stock recorded yet</p>
              <Button variant="link" onClick={() => router.push("/supply-chain/stock/movements/new")} className="mt-2">
                Record first stock movement
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/60 text-xs uppercase tracking-wide text-slate-400">
                    <th className="text-left px-5 py-3 font-medium">SKU</th>
                    <th className="text-left px-5 py-3 font-medium">Product</th>
                    <th className="text-left px-5 py-3 font-medium">Warehouse</th>
                    <th className="text-right px-5 py-3 font-medium">On Hand</th>
                    <th className="text-right px-5 py-3 font-medium">Minimum</th>
                    <th className="text-left px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => {
                    const qty = Number(s.quantity);
                    const min = Number(s.minimumStock);
                    const low = qty <= min;
                    return (
                      <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                        <td className="px-5 py-3 font-mono text-sm text-slate-700">{s.product.sku}</td>
                        <td className="px-5 py-3 font-medium text-slate-900">{s.product.name}</td>
                        <td className="px-5 py-3 text-slate-500">{s.warehouse.name}</td>
                        <td className="px-5 py-3 text-right font-semibold tabular-nums text-slate-900">
                          {qty} {s.product.unit.code}
                        </td>
                        <td className="px-5 py-3 text-right text-slate-500 tabular-nums">{min}</td>
                        <td className="px-5 py-3">
                          <span
                            className={`px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${
                              low ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"
                            }`}
                          >
                            {low ? "Low Stock" : "OK"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
