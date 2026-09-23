"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Plus, ArrowDownToLine, ArrowUpFromLine, SlidersHorizontal } from "lucide-react";

interface Movement {
  id: string;
  type: string;
  quantity: string;
  reason: string | null;
  createdAt: string;
  warehouse: { code: string; name: string };
  product: { sku: string; name: string };
  unit: { code: string };
}

const TYPE_STYLES: Record<string, { badge: string; icon: any }> = {
  IN: { badge: "bg-green-100 text-green-800", icon: ArrowDownToLine },
  OUT: { badge: "bg-red-100 text-red-800", icon: ArrowUpFromLine },
  ADJUSTMENT: { badge: "bg-amber-100 text-amber-800", icon: SlidersHorizontal },
};

export default function StockMovementsPage() {
  const { status } = useSession();
  const router = useRouter();
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
    if (status === "authenticated") fetchMovements();
  }, [status, router]);

  const fetchMovements = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/stock-movements");
      if (!res.ok) throw new Error("Failed to fetch stock movements");
      setMovements(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading stock movements");
    } finally {
      setLoading(false);
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
        <button onClick={() => router.push("/supply-chain/stock")} className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900">
          <ArrowLeft size={16} />
          Back to Stock Levels
        </button>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Stock Movement History</h1>
            <p className="text-slate-600 mt-1">Every stock in, out, and adjustment recorded</p>
          </div>
          <Button onClick={() => router.push("/supply-chain/stock/movements/new")} className="gap-2">
            <Plus size={18} />
            Record Movement
          </Button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">{error}</div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{movements.length} Movement(s)</CardTitle>
          </CardHeader>
          <CardContent>
            {movements.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-slate-500">No stock movements recorded yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                      <th className="text-left px-2 py-2 font-medium">Date</th>
                      <th className="text-left px-2 py-2 font-medium">Product</th>
                      <th className="text-left px-2 py-2 font-medium">Warehouse</th>
                      <th className="text-left px-2 py-2 font-medium">Type</th>
                      <th className="text-right px-2 py-2 font-medium">Quantity</th>
                      <th className="text-left px-2 py-2 font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((m) => {
                      const style = TYPE_STYLES[m.type] || TYPE_STYLES.ADJUSTMENT;
                      const Icon = style.icon;
                      return (
                        <tr key={m.id} className="border-b border-slate-100">
                          <td className="px-2 py-2 text-slate-500">{new Date(m.createdAt).toLocaleString("id-ID")}</td>
                          <td className="px-2 py-2">
                            <span className="font-medium text-slate-900">{m.product.name}</span>
                            <span className="text-slate-400 font-mono text-xs ml-1">{m.product.sku}</span>
                          </td>
                          <td className="px-2 py-2 text-slate-500">{m.warehouse.name}</td>
                          <td className="px-2 py-2">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${style.badge}`}>
                              <Icon size={12} />
                              {m.type}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-right font-semibold tabular-nums">
                            {m.quantity} {m.unit.code}
                          </td>
                          <td className="px-2 py-2 text-slate-500">{m.reason || "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
