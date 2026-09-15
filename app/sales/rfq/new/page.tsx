"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

interface Customer {
  id: string;
  code: string;
  name: string;
}

export default function NewRFQPage() {
  const { status } = useSession();
  const router = useRouter();
  const [companyId, setCompanyId] = useState<string>("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    customerId: "",
    title: "",
    description: "",
    requestDate: new Date().toISOString().split("T")[0],
    targetDate: "",
    notes: "",
  });

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      const getCompanyAndCustomers = async () => {
        try {
          const [compRes, custRes] = await Promise.all([
            fetch("/api/companies"),
            fetch("/api/customers"),
          ]);

          if (compRes.ok) {
            const companies = await compRes.json();
            if (companies.length > 0) {
              setCompanyId(companies[0].id);
            }
          }

          if (custRes.ok) {
            const custs = await custRes.json();
            setCustomers(custs);
          }
        } catch (err) {
          console.error("Error fetching data:", err);
        }
      };
      getCompanyAndCustomers();
    }
  }, [status]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      // Generate RFQ number
      const rfqNumber = `RFQ-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;

      const res = await fetch("/api/rfqs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          ...formData,
          number: rfqNumber,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create RFQ");
      }

      router.push("/sales/rfq");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creating RFQ");
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  if (!companyId) {
    return (
      <DashboardLayout>
        <div className="text-center py-8">Loading...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-2xl py-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6"
        >
          <ArrowLeft size={18} />
          Back to RFQs
        </button>

        <Card>
          <CardHeader>
            <CardTitle>Create New RFQ</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <h3 className="font-semibold text-slate-900">RFQ Details</h3>

                <div className="space-y-2">
                  <Label htmlFor="customerId">Customer *</Label>
                  <select
                    id="customerId"
                    name="customerId"
                    value={formData.customerId}
                    onChange={handleChange}
                    required
                    className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white"
                  >
                    <option value="">Select customer...</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} - {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    name="title"
                    placeholder="RFQ title"
                    value={formData.title}
                    onChange={handleChange}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <textarea
                    id="description"
                    name="description"
                    placeholder="Detailed description of requirements"
                    value={formData.description}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md"
                    rows={4}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="requestDate">Request Date *</Label>
                    <Input
                      id="requestDate"
                      name="requestDate"
                      type="date"
                      value={formData.requestDate}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="targetDate">Target Response Date</Label>
                    <Input
                      id="targetDate"
                      name="targetDate"
                      type="date"
                      value={formData.targetDate}
                      onChange={handleChange}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <textarea
                    id="notes"
                    name="notes"
                    placeholder="Additional notes"
                    value={formData.notes}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md"
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex gap-3 border-t pt-6">
                <Button type="button" variant="outline" onClick={() => router.push("/sales/rfq")}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Creating..." : "Create RFQ"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
