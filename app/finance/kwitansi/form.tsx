"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Download, Receipt } from "lucide-react";
import { Attachments } from "@/components/attachments";

interface Customer {
  id: string;
  code: string;
  name: string;
}

interface InvoiceOption {
  id: string;
  invoiceNumber: string;
  customerId: string;
  grandTotal: number;
  paidAmount: number;
}

interface KwitansiFormProps {
  paymentId?: string;
  companyId: string;
}

export function KwitansiForm({ paymentId, companyId }: KwitansiFormProps) {
  const router = useRouter();
  const { status } = useSession();
  const [loading, setLoading] = useState(!!paymentId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<InvoiceOption[]>([]);

  const [formData, setFormData] = useState({
    customerId: "",
    referenceId: "",
    paymentDate: new Date().toISOString().split("T")[0],
    amount: 0,
    method: "transfer",
    bankAccount: "",
    description: "",
    notes: "",
  });

  useEffect(() => {
    if (status === "authenticated") {
      fetchCustomers();
      fetchInvoices();
      if (paymentId) {
        fetchPayment();
      } else {
        setLoading(false);
      }
    }
  }, [status]);

  const fetchPayment = async () => {
    try {
      const res = await fetch(`/api/payments/${paymentId}`);
      if (res.ok) {
        const data = await res.json();
        setFormData({
          customerId: data.customerId || "",
          referenceId: data.referenceId || "",
          paymentDate: data.paymentDate.split("T")[0],
          amount: Number(data.amount),
          method: data.method || "transfer",
          bankAccount: data.bankAccount || "",
          description: data.description || "",
          notes: data.notes || "",
        });
      }
    } catch (err) {
      console.error("Error fetching payment:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      const res = await fetch("/api/customers");
      if (res.ok) setCustomers(await res.json());
    } catch (err) {
      console.error("Error fetching customers:", err);
    }
  };

  const fetchInvoices = async () => {
    try {
      const res = await fetch("/api/invoices");
      if (res.ok) setInvoices(await res.json());
    } catch (err) {
      console.error("Error fetching invoices:", err);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: name === "amount" ? parseFloat(value) || 0 : value }));
  };

  const handleInvoicePick = (invoiceId: string) => {
    const invoice = invoices.find((i) => i.id === invoiceId);
    if (invoice) {
      const outstanding = Number(invoice.grandTotal) - Number(invoice.paidAmount);
      setFormData((prev) => ({
        ...prev,
        referenceId: invoiceId,
        customerId: invoice.customerId,
        amount: outstanding,
        description: `Pembayaran Invoice ${invoice.invoiceNumber}`,
      }));
    } else {
      setFormData((prev) => ({ ...prev, referenceId: "" }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (!formData.customerId) throw new Error("Customer is required");
      if (!formData.amount || formData.amount <= 0) throw new Error("Amount must be greater than 0");

      const url = paymentId ? `/api/payments/${paymentId}` : "/api/payments";
      const method = paymentId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          customerId: formData.customerId,
          referenceType: formData.referenceId ? "Invoice" : null,
          referenceId: formData.referenceId || null,
          paymentDate: formData.paymentDate,
          amount: formData.amount,
          method: formData.method,
          bankAccount: formData.bankAccount,
          description: formData.description,
          notes: formData.notes,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save kwitansi");
      }

      router.push("/finance/kwitansi");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving kwitansi");
    } finally {
      setSubmitting(false);
    }
  };

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(price);

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  const customerInvoices = invoices.filter((i) => !formData.customerId || i.customerId === formData.customerId);

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-slate-600 hover:text-slate-900">
          <ArrowLeft size={18} />
          Back to Kwitansi
        </button>
        {paymentId && (
          <a href={`/api/payments/${paymentId}/pdf`} target="_blank" rel="noopener noreferrer">
            <Button type="button" variant="outline" className="gap-2">
              <Download size={16} />
              Download PDF
            </Button>
          </a>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt size={20} className="text-amber-700" />
            {paymentId ? "Edit Kwitansi" : "Create New Kwitansi"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">{error}</div>
            )}

            <div className="space-y-2">
              <Label htmlFor="customerId">Received From (Customer) *</Label>
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
              <Label htmlFor="referenceId">Link to Invoice (optional)</Label>
              <select
                id="referenceId"
                name="referenceId"
                value={formData.referenceId}
                onChange={(e) => handleInvoicePick(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white"
              >
                <option value="">No invoice — standalone receipt / DP</option>
                {customerInvoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoiceNumber} — outstanding {formatPrice(Number(inv.grandTotal) - Number(inv.paidAmount))}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-400">Selecting an invoice auto-fills the amount and description.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="paymentDate">Payment Date *</Label>
                <Input id="paymentDate" name="paymentDate" type="date" value={formData.paymentDate} onChange={handleChange} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount (IDR) *</Label>
                <Input id="amount" name="amount" type="number" min="0" step="0.01" value={formData.amount} onChange={handleChange} required />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="method">Method</Label>
                <select
                  id="method"
                  name="method"
                  value={formData.method}
                  onChange={handleChange}
                  className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white capitalize"
                >
                  <option value="cash">Cash</option>
                  <option value="transfer">Transfer</option>
                  <option value="check">Check</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bankAccount">Bank Account (if transfer)</Label>
                <Input id="bankAccount" name="bankAccount" placeholder="Account / reference number" value={formData.bankAccount} onChange={handleChange} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">For Payment Of (printed on kwitansi) *</Label>
              <Input id="description" name="description" placeholder="e.g., Pembayaran DP Quotation QT-2026-0001" value={formData.description} onChange={handleChange} required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Internal Notes</Label>
              <textarea
                id="notes"
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-slate-300 rounded-md"
                rows={2}
              />
            </div>

            <div className="bg-amber-50 rounded-lg p-4 flex justify-between items-center">
              <span className="text-slate-600 text-sm">Amount to print on Kwitansi:</span>
              <span className="font-bold text-lg text-amber-700">{formatPrice(formData.amount)}</span>
            </div>

            <div className="flex gap-3 border-t pt-6">
              <Button type="button" variant="outline" onClick={() => router.push("/finance/kwitansi")}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : paymentId ? "Update Kwitansi" : "Create Kwitansi"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      {paymentId && <Attachments referenceType="Payment" referenceId={paymentId} />}
    </div>
  );
}
