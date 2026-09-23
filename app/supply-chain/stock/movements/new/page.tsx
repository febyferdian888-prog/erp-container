"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, ArrowDownToLine, ArrowUpFromLine, SlidersHorizontal, Boxes } from "lucide-react";

interface WarehouseOption {
  id: string;
  code: string;
  name: string;
}

interface ProductOption {
  id: string;
  sku: string;
  name: string;
  unit: { code: string };
}

const MOVEMENT_TYPES = [
  { value: "IN", label: "Stock In", icon: ArrowDownToLine, hint: "Goods received, returned, or found", color: "text-green-600 bg-green-50 border-green-200" },
  { value: "OUT", label: "Stock Out", icon: ArrowUpFromLine, hint: "Goods used, shipped, or scrapped", color: "text-red-600 bg-red-50 border-red-200" },
  { value: "ADJUSTMENT", label: "Adjustment", icon: SlidersHorizontal, hint: "Stock count correction (+/-)", color: "text-amber-600 bg-amber-50 border-amber-200" },
];

export default function NewStockMovementPage() {
  const { status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [currentStock, setCurrentStock] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    warehouseId: "",
    productId: "",
    type: "IN",
    quantity: 0,
    reason: "",
    notes: "",
  });

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
    if (status === "authenticated") {
      Promise.all([
        fetch("/api/warehouses").then((r) => (r.ok ? r.json() : [])),
        fetch("/api/products").then((r) => (r.ok ? r.json() : [])),
      ])
        .then(([w, p]) => {
          setWarehouses(w);
          setProducts(p);
        })
        .finally(() => setLoading(false));
    }
  }, [status, router]);

  useEffect(() => {
    if (formData.warehouseId && formData.productId) {
      fetch("/api/stock")
        .then((r) => r.json())
        .then((stocks: any[]) => {
          const match = stocks.find(
            (s) => s.warehouse.id === formData.warehouseId && s.product.id === formData.productId
          );
          setCurrentStock(match ? Number(match.quantity) : 0);
        });
    } else {
      setCurrentStock(null);
    }
  }, [formData.warehouseId, formData.productId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: name === "quantity" ? parseFloat(value) || 0 : value }));
  };

  const selectedProduct = products.find((p) => p.id === formData.productId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (!formData.warehouseId) throw new Error("Warehouse is required");
      if (!formData.productId) throw new Error("Product is required");
      if (!formData.quantity) throw new Error("Quantity is required");

      const res = await fetch("/api/stock-movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to record stock movement");
      }

      router.push("/supply-chain/stock");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error recording stock movement");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="text-center py-8">Loading...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="py-6 max-w-xl">
        <button onClick={() => router.push("/supply-chain/stock")} className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 mb-6">
          <ArrowLeft size={16} />
          Back to Stock Levels
        </button>

        <Card className="border-teal-200">
          <CardHeader className="bg-teal-50 border-b border-teal-100 ">
            <CardTitle className="flex items-center gap-2 text-teal-900">
              <Boxes size={20} />
              Record Stock Movement
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
              )}

              <div className="space-y-2">
                <Label className="text-xs text-slate-500">Movement Type *</Label>
                <div className="grid grid-cols-3 gap-2">
                  {MOVEMENT_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, type: t.value }))}
                      className={`flex flex-col items-center gap-1 rounded-lg border-2 px-2 py-3 text-xs font-medium transition-colors ${
                        formData.type === t.value ? t.color : "border-slate-200 text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      <t.icon size={18} />
                      {t.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-400">
                  {MOVEMENT_TYPES.find((t) => t.value === formData.type)?.hint}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="warehouseId" className="text-xs text-slate-500">
                  Warehouse *
                </Label>
                <select
                  id="warehouseId"
                  name="warehouseId"
                  value={formData.warehouseId}
                  onChange={handleChange}
                  required
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">Select warehouse...</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} — {w.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="productId" className="text-xs text-slate-500">
                  Product *
                </Label>
                <select
                  id="productId"
                  name="productId"
                  value={formData.productId}
                  onChange={handleChange}
                  required
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">Select product...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} — {p.name}
                    </option>
                  ))}
                </select>
                {currentStock !== null && (
                  <p className="text-xs text-slate-400">
                    Current stock: <span className="font-semibold text-slate-600">{currentStock} {selectedProduct?.unit.code}</span>
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="quantity" className="text-xs text-slate-500">
                  Quantity {formData.type === "ADJUSTMENT" ? "(use negative for a downward correction)" : ""} *
                </Label>
                <Input
                  id="quantity"
                  name="quantity"
                  type="number"
                  step="0.01"
                  value={formData.quantity}
                  onChange={handleChange}
                  required
                  className="rounded-lg"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reason" className="text-xs text-slate-500">
                  Reason
                </Label>
                <Input
                  id="reason"
                  name="reason"
                  placeholder="e.g., Penerimaan manual, Pemakaian proyek, Stock opname"
                  value={formData.reason}
                  onChange={handleChange}
                  className="rounded-lg"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="notes" className="text-xs text-slate-500">
                  Notes
                </Label>
                <textarea
                  id="notes"
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="flex gap-3 border-t pt-6">
                <Button type="button" variant="outline" onClick={() => router.push("/supply-chain/stock")} className="rounded-lg">
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting} className="rounded-lg">
                  {submitting ? "Saving..." : "Record Movement"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
