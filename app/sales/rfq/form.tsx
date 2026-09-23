"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, FileText } from "lucide-react";
import { Attachments } from "@/components/attachments";

interface Customer {
  id: string;
  code: string;
  name: string;
}

interface RfqFormProps {
  rfqId?: string;
  companyId: string;
}

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "quoted", label: "Quoted" },
  { value: "closed", label: "Closed" },
  { value: "cancelled", label: "Cancelled" },
];

export function RfqForm({ rfqId, companyId }: RfqFormProps) {
  const router = useRouter();
  const { status } = useSession();
  const [loading, setLoading] = useState(!!rfqId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [rfqNumber, setRfqNumber] = useState("");
  const [linkedQuotations, setLinkedQuotations] = useState<{ id: string; number: string }[]>([]);

  const [formData, setFormData] = useState({
    customerId: "",
    title: "",
    description: "",
    requestDate: new Date().toISOString().split("T")[0],
    targetDate: "",
    docStatus: "draft",
    notes: "",
  });

  useEffect(() => {
    if (status === "authenticated") {
      fetchCustomers();
      if (rfqId) {
        fetchRfq();
      } else {
        setLoading(false);
      }
    }
  }, [status]);

  const fetchCustomers = async () => {
    try {
      const res = await fetch("/api/customers");
      if (res.ok) setCustomers(await res.json());
    } catch (err) {
      console.error("Error fetching customers:", err);
    }
  };

  const fetchRfq = async () => {
    try {
      const res = await fetch(`/api/rfqs/${rfqId}`);
      if (res.ok) {
        const data = await res.json();
        setRfqNumber(data.number);
        setLinkedQuotations(data.quotations || []);
        setFormData({
          customerId: data.customerId,
          title: data.title || "",
          description: data.description || "",
          requestDate: data.requestDate.split("T")[0],
          targetDate: data.targetDate ? data.targetDate.split("T")[0] : "",
          docStatus: data.status,
          notes: data.notes || "",
        });
      }
    } catch (err) {
      console.error("Error fetching RFQ:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (!formData.customerId) throw new Error("Customer is required");

      const url = rfqId ? `/api/rfqs/${rfqId}` : "/api/rfqs";
      const method = rfqId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          customerId: formData.customerId,
          title: formData.title,
          description: formData.description,
          requestDate: formData.requestDate,
          targetDate: formData.targetDate || null,
          status: formData.docStatus,
          notes: formData.notes,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save RFQ");
      }

      router.push("/sales/rfq");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving RFQ");
    } finally {
      setSubmitting(false);
    }
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
        Back to RFQs
      </button>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText size={20} className="text-slate-600" />
            {rfqId ? `Edit RFQ ${rfqNumber}` : "Create New RFQ"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">
                {error}
              </div>
            )}

            {linkedQuotations.length > 0 && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-slate-700 text-sm">
                Quoted via: {linkedQuotations.map((q) => q.number).join(", ")}
              </div>
            )}

            <div className="space-y-4">
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

              {rfqId && (
                <div className="space-y-2">
                  <Label htmlFor="docStatus">Status</Label>
                  <select
                    id="docStatus"
                    name="docStatus"
                    value={formData.docStatus}
                    onChange={handleChange}
                    className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white capitalize"
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

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
                {submitting ? "Saving..." : rfqId ? "Update RFQ" : "Create RFQ"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      {rfqId && <Attachments referenceType="RFQ" referenceId={rfqId} />}
    </div>
  );
}
