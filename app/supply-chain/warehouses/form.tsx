"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

interface WarehouseFormProps {
  warehouseId?: string;
  companyId: string;
}

export function WarehouseForm({ warehouseId, companyId }: WarehouseFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(!!warehouseId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    code: "",
    name: "",
    type: "warehouse",
    description: "",
    address: "",
    isActive: true,
  });

  useEffect(() => {
    if (warehouseId) fetchWarehouse();
  }, [warehouseId]);

  const fetchWarehouse = async () => {
    try {
      const res = await fetch(`/api/warehouses/${warehouseId}`);
      if (res.ok) {
        const data = await res.json();
        setFormData({
          code: data.code,
          name: data.name,
          type: data.type,
          description: data.description || "",
          address: data.address || "",
          isActive: data.isActive,
        });
      }
    } catch (err) {
      console.error("Error fetching warehouse:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const url = warehouseId ? `/api/warehouses/${warehouseId}` : "/api/warehouses";
      const method = warehouseId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, ...formData }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save warehouse");
      }

      router.push("/supply-chain/warehouses");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving warehouse");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="max-w-xl">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 mb-6">
        <ArrowLeft size={16} />
        Back to Warehouses
      </button>

      <Card className="border-none">
        <CardHeader>
          <CardTitle>{warehouseId ? "Edit Warehouse" : "Add New Warehouse"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="code" className="text-xs text-slate-500">
                  Warehouse Code *
                </Label>
                <Input id="code" name="code" placeholder="WH-01" value={formData.code} onChange={handleChange} required disabled={!!warehouseId} className="rounded-lg font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="type" className="text-xs text-slate-500">
                  Type
                </Label>
                <select
                  id="type"
                  name="type"
                  value={formData.type}
                  onChange={handleChange}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                >
                  <option value="warehouse">Warehouse</option>
                  <option value="workshop">Workshop</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-xs text-slate-500">
                Warehouse Name *
              </Label>
              <Input id="name" name="name" placeholder="e.g., Gudang Utama Surabaya" value={formData.name} onChange={handleChange} required className="rounded-lg" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="address" className="text-xs text-slate-500">
                Address
              </Label>
              <Input id="address" name="address" value={formData.address} onChange={handleChange} className="rounded-lg" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description" className="text-xs text-slate-500">
                Description
              </Label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
              />
            </div>

            <div className="flex gap-3 border-t pt-6">
              <Button type="button" variant="outline" onClick={() => router.push("/supply-chain/warehouses")} className="rounded-lg">
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="rounded-lg">
                {submitting ? "Saving..." : warehouseId ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
