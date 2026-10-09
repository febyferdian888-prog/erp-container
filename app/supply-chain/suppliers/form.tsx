"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

interface SupplierFormProps {
  supplierId?: string;
  companyId: string;
}

export function SupplierForm({ supplierId, companyId }: SupplierFormProps) {
  const router = useRouter();
  const { status: _status } = useSession();
  const [loading, setLoading] = useState(!!supplierId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    code: "",
    name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    province: "",
    country: "Indonesia",
    postalCode: "",
    npwp: "",
    bankAccount: "",
    bankName: "",
    picName: "",
  });

  useEffect(() => {
    if (supplierId) {
      fetchSupplier();
    }
  }, [supplierId]);

  const fetchSupplier = async () => {
    try {
      const res = await fetch(`/api/suppliers/${supplierId}`);
      if (!res.ok) throw new Error("Failed to fetch supplier");
      const data = await res.json();
      setFormData({
        code: data.code,
        name: data.name,
        email: data.email || "",
        phone: data.phone || "",
        address: data.address || "",
        city: data.city || "",
        province: data.province || "",
        country: data.country || "Indonesia",
        postalCode: data.postalCode || "",
        npwp: data.npwp || "",
        bankAccount: data.bankAccount || "",
        bankName: data.bankName || "",
        picName: data.picName || "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading supplier");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const url = supplierId ? `/api/suppliers/${supplierId}` : "/api/suppliers";
      const method = supplierId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          ...formData,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save supplier");
      }

      router.push("/supply-chain/suppliers");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving supplier");
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
        Back to Suppliers
      </button>

      <Card>
        <CardHeader>
          <CardTitle>
            {supplierId ? "Edit Supplier" : "Add New Supplier"}
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
              <h3 className="font-semibold text-slate-900">Basic Information</h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Supplier Code *</Label>
                  <Input
                    id="code"
                    name="code"
                    placeholder="SUPP-001"
                    value={formData.code}
                    onChange={handleChange}
                    required
                    disabled={!!supplierId}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Supplier Name *</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="Company name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="contact@supplier.com"
                    value={formData.email}
                    onChange={handleChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    name="phone"
                    placeholder="+62-21-1234567"
                    value={formData.phone}
                    onChange={handleChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="picName">PIC (Contact Person)</Label>
                  <Input
                    id="picName"
                    name="picName"
                    placeholder="Nama kontak vendor"
                    value={formData.picName}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="npwp">NPWP (Tax ID)</Label>
                <Input
                  id="npwp"
                  name="npwp"
                  placeholder="12.345.678.9-012.345"
                  value={formData.npwp}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="space-y-4 border-t pt-4">
              <h3 className="font-semibold text-slate-900">Address</h3>

              <div className="space-y-2">
                <Label htmlFor="address">Street Address</Label>
                <Input
                  id="address"
                  name="address"
                  placeholder="Street address"
                  value={formData.address}
                  onChange={handleChange}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    name="city"
                    placeholder="Jakarta"
                    value={formData.city}
                    onChange={handleChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="province">Province</Label>
                  <Input
                    id="province"
                    name="province"
                    placeholder="DKI Jakarta"
                    value={formData.province}
                    onChange={handleChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="postalCode">Postal Code</Label>
                  <Input
                    id="postalCode"
                    name="postalCode"
                    placeholder="12345"
                    value={formData.postalCode}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  name="country"
                  placeholder="Indonesia"
                  value={formData.country}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="space-y-4 border-t pt-4">
              <h3 className="font-semibold text-slate-900">Banking Information</h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bankName">Bank Name</Label>
                  <Input
                    id="bankName"
                    name="bankName"
                    placeholder="BCA, Mandiri, etc."
                    value={formData.bankName}
                    onChange={handleChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bankAccount">Bank Account</Label>
                  <Input
                    id="bankAccount"
                    name="bankAccount"
                    placeholder="Account number"
                    value={formData.bankAccount}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 border-t pt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/supply-chain/suppliers")}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : supplierId ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
