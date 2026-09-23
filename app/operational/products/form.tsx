"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

interface Unit {
  id: string;
  code: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
}

interface ProductFormProps {
  productId?: string;
  companyId: string;
}

export function ProductForm({ productId, companyId }: ProductFormProps) {
  const router = useRouter();
  const { status } = useSession();
  const [loading, setLoading] = useState(!!productId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [formData, setFormData] = useState({
    sku: "",
    name: "",
    description: "",
    unitId: "",
    categoryId: "",
    standardPrice: "",
  });

  useEffect(() => {
    fetchUnitsAndCategories();
    if (productId) {
      fetchProduct();
    }
  }, [productId]);

  const fetchUnitsAndCategories = async () => {
    try {
      const [unitsRes, categoriesRes] = await Promise.all([
        fetch("/api/units"),
        fetch("/api/categories"),
      ]);

      if (unitsRes.ok) {
        const data = await unitsRes.json();
        setUnits(data);
      }
      if (categoriesRes.ok) {
        const data = await categoriesRes.json();
        setCategories(data);
      }
    } catch (err) {
      console.error("Error fetching dropdowns:", err);
    }
  };

  const fetchProduct = async () => {
    try {
      const res = await fetch(`/api/products/${productId}`);
      if (!res.ok) throw new Error("Failed to fetch product");
      const data = await res.json();
      setFormData({
        sku: data.sku,
        name: data.name,
        description: data.description || "",
        unitId: data.unitId,
        categoryId: data.categoryId || "",
        standardPrice: data.standardPrice?.toString() || "0",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading product");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const url = productId ? `/api/products/${productId}` : "/api/products";
      const method = productId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          sku: formData.sku,
          name: formData.name,
          description: formData.description,
          unitId: formData.unitId,
          categoryId: formData.categoryId || null,
          standardPrice: parseFloat(formData.standardPrice) || 0,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save product");
      }

      router.push("/operational/products");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving product");
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="max-w-2xl">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6"
      >
        <ArrowLeft size={18} />
        Back to Products
      </button>

      <Card>
        <CardHeader>
          <CardTitle>
            {productId ? "Edit Product" : "Add New Product"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <h3 className="font-semibold text-slate-900">Product Information</h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sku">SKU (Stock Keeping Unit) *</Label>
                  <Input
                    id="sku"
                    name="sku"
                    placeholder="PROD-001"
                    value={formData.sku}
                    onChange={handleChange}
                    required
                    disabled={!!productId}
                  />
                  <p className="text-xs text-slate-500">
                    Unique identifier per company
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Product Name *</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="Product name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  name="description"
                  placeholder="Product description"
                  value={formData.description}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="space-y-4 border-t pt-4">
              <h3 className="font-semibold text-slate-900">Classification</h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="unitId">Unit of Measurement *</Label>
                  <select
                    id="unitId"
                    name="unitId"
                    value={formData.unitId}
                    onChange={handleChange}
                    required
                    className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  >
                    <option value="">Select unit...</option>
                    {units.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.code} - {unit.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="categoryId">Category</Label>
                  <select
                    id="categoryId"
                    name="categoryId"
                    value={formData.categoryId}
                    onChange={handleChange}
                    className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  >
                    <option value="">No category</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-4 border-t pt-4">
              <h3 className="font-semibold text-slate-900">Pricing</h3>

              <div className="space-y-2">
                <Label htmlFor="standardPrice">Standard Price (IDR)</Label>
                <Input
                  id="standardPrice"
                  name="standardPrice"
                  type="number"
                  placeholder="0"
                  value={formData.standardPrice}
                  onChange={handleChange}
                  min="0"
                  step="0.01"
                />
                <p className="text-xs text-slate-500">
                  Default price for this product
                </p>
              </div>
            </div>

            <div className="flex gap-3 border-t pt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/operational/products")}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : productId ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
