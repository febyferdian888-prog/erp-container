"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/ui/document-form";
import { ArrowLeft, Building2, MapPin, Landmark } from "lucide-react";

export default function CompanyProfilePage() {
  const { status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [companyCode, setCompanyCode] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    address: "",
    city: "",
    province: "",
    country: "Indonesia",
    postalCode: "",
    npwp: "",
    phone: "",
    email: "",
    bankAccount: "",
    bankName: "",
    currency: "IDR",
  });

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
    if (status === "authenticated") fetchCompany();
  }, [status, router]);

  const fetchCompany = async () => {
    try {
      const listRes = await fetch("/api/companies");
      if (!listRes.ok) throw new Error("Failed to fetch company");
      const companies = await listRes.json();
      if (!companies.length) throw new Error("No company found");
      const id = companies[0].id;
      setCompanyId(id);

      const res = await fetch(`/api/companies/${id}`);
      if (res.ok) {
        const data = await res.json();
        setCompanyCode(data.code);
        setFormData({
          name: data.name || "",
          description: data.description || "",
          address: data.address || "",
          city: data.city || "",
          province: data.province || "",
          country: data.country || "Indonesia",
          postalCode: data.postalCode || "",
          npwp: data.npwp || "",
          phone: data.phone || "",
          email: data.email || "",
          bankAccount: data.bankAccount || "",
          bankName: data.bankName || "",
          currency: data.currency || "IDR",
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading company");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setSaved(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSaved(false);

    try {
      const res = await fetch(`/api/companies/${companyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save company profile");
      }

      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving company profile");
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
      <div className="py-6 max-w-4xl">
        <button
          onClick={() => router.push("/settings")}
          className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 mb-6"
        >
          <ArrowLeft size={16} />
          Back to Settings
        </button>

        <form onSubmit={handleSubmit}>
          <div className="border-b border-slate-200 pb-6 mb-8">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div className="flex items-center gap-3">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400" aria-hidden />
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                    {companyCode}
                  </p>
                  <h1 className="text-[26px] font-semibold tracking-tight text-slate-900 leading-tight">{formData.name || "Company Profile"}</h1>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {saved && <span className="text-sm text-emerald-600">Saved</span>}
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectionCard icon={Building2} title="Company Details" accentColor="text-slate-700">
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-xs text-slate-500">
                    Company Name *
                  </Label>
                  <Input id="name" name="name" value={formData.name} onChange={handleChange} required className="rounded-lg" />
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
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="phone" className="text-xs text-slate-500">
                      Phone
                    </Label>
                    <Input id="phone" name="phone" value={formData.phone} onChange={handleChange} className="rounded-lg" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-xs text-slate-500">
                      Email
                    </Label>
                    <Input id="email" name="email" type="email" value={formData.email} onChange={handleChange} className="rounded-lg" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="npwp" className="text-xs text-slate-500">
                      NPWP (Tax ID)
                    </Label>
                    <Input id="npwp" name="npwp" value={formData.npwp} onChange={handleChange} className="rounded-lg" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="currency" className="text-xs text-slate-500">
                      Currency
                    </Label>
                    <Input id="currency" name="currency" value={formData.currency} onChange={handleChange} className="rounded-lg" />
                  </div>
                </div>
              </div>
            </SectionCard>

            <div className="space-y-6">
              <SectionCard icon={MapPin} title="Address" accentColor="text-slate-700">
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="address" className="text-xs text-slate-500">
                      Street Address
                    </Label>
                    <Input id="address" name="address" value={formData.address} onChange={handleChange} className="rounded-lg" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="city" className="text-xs text-slate-500">
                        City
                      </Label>
                      <Input id="city" name="city" value={formData.city} onChange={handleChange} className="rounded-lg" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="province" className="text-xs text-slate-500">
                        Province
                      </Label>
                      <Input id="province" name="province" value={formData.province} onChange={handleChange} className="rounded-lg" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="postalCode" className="text-xs text-slate-500">
                        Postal Code
                      </Label>
                      <Input id="postalCode" name="postalCode" value={formData.postalCode} onChange={handleChange} className="rounded-lg" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="country" className="text-xs text-slate-500">
                        Country
                      </Label>
                      <Input id="country" name="country" value={formData.country} onChange={handleChange} className="rounded-lg" />
                    </div>
                  </div>
                </div>
              </SectionCard>

              <SectionCard icon={Landmark} title="Banking Information" accentColor="text-slate-700">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="bankName" className="text-xs text-slate-500">
                      Bank Name
                    </Label>
                    <Input id="bankName" name="bankName" value={formData.bankName} onChange={handleChange} className="rounded-lg" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bankAccount" className="text-xs text-slate-500">
                      Bank Account
                    </Label>
                    <Input id="bankAccount" name="bankAccount" value={formData.bankAccount} onChange={handleChange} className="rounded-lg" />
                  </div>
                </div>
              </SectionCard>
            </div>
          </div>

          <div className="flex gap-3 justify-end mt-6">
            <Button type="submit" disabled={submitting} className="rounded-lg">
              {submitting ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
