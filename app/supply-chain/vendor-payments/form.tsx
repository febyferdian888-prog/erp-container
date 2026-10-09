"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Landmark } from "lucide-react";

interface Supplier {
  id: string;
  code: string;
  name: string;
}

interface BillOption {
  id: string;
  billNumber: string;
  supplierId: string;
  grandTotal: number;
  paidAmount: number;
}

interface VendorPaymentFormProps {
  paymentId?: string;
  companyId: string;
}

export function VendorPaymentForm({ paymentId, companyId }: VendorPaymentFormProps) {
  const router = useRouter();
  const { status } = useSession();
  const [loading, setLoading] = useState(!!paymentId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [bills, setBills] = useState<BillOption[]>([]);
  const [paymentNumber, setPaymentNumber] = useState("");

  const [formData, setFormData] = useState({
    supplierId: "",
    referenceId: "",
    paymentDate: new Date().toISOString().split("T")[0],
    amount: 0,
    method: "transfer",
    bankAccount: "",
    description: "",
    notes: "",
  });

  const prefillBillId = useSearchParams().get("billId");

  useEffect(() => {
    if (paymentId || !prefillBillId || !bills.length || formData.referenceId) return;
    handleBillPick(prefillBillId);
  }, [bills]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchSuppliers();
      fetchBills();
      if (paymentId) {
        fetchPayment();
      } else {
        setLoading(false);
      }
    }
  }, [status]);

  const fetchPayment = async () => {
    try {
      const res = await fetch(`/api/vendor-payments/${paymentId}`);
      if (res.ok) {
        const data = await res.json();
        setPaymentNumber(data.paymentNumber);
        setFormData({
          supplierId: data.supplierId || "",
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

  const fetchSuppliers = async () => {
    try {
      const res = await fetch("/api/suppliers");
      if (res.ok) setSuppliers(await res.json());
    } catch (err) {
      console.error("Error fetching suppliers:", err);
    }
  };

  const fetchBills = async () => {
    try {
      const res = await fetch("/api/bills");
      if (res.ok) {
        const data = await res.json();
        setBills(
          data.map((b: any) => ({
            id: b.id,
            billNumber: b.billNumber,
            supplierId: b.supplierId,
            grandTotal: Number(b.grandTotal),
            paidAmount: Number(b.paidAmount),
          }))
        );
      }
    } catch (err) {
      console.error("Error fetching bills:", err);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: name === "amount" ? parseFloat(value) || 0 : value }));
  };

  const handleBillPick = (billId: string) => {
    const bill = bills.find((b) => b.id === billId);
    if (bill) {
      const outstanding = bill.grandTotal - bill.paidAmount;
      setFormData((prev) => ({
        ...prev,
        referenceId: billId,
        supplierId: bill.supplierId,
        amount: outstanding,
        description: `Pembayaran Bill ${bill.billNumber}`,
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
      if (!formData.supplierId) throw new Error("Vendor is required");
      if (!formData.amount || formData.amount <= 0) throw new Error("Amount must be greater than 0");

      const url = paymentId ? `/api/vendor-payments/${paymentId}` : "/api/vendor-payments";
      const method = paymentId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          supplierId: formData.supplierId,
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
        throw new Error(data.error || "Failed to save vendor payment");
      }

      router.push("/supply-chain/vendor-payments");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving vendor payment");
    } finally {
      setSubmitting(false);
    }
  };

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(price);

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  const supplierBills = bills.filter((b) => !formData.supplierId || b.supplierId === formData.supplierId);

  return (
    <div className="max-w-2xl">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6">
        <ArrowLeft size={18} />
        Back to Vendor Payments
      </button>

      <Card className="border-yellow-300">
        <CardHeader className="bg-yellow-50 border-b border-yellow-200">
          <CardTitle className="flex items-center gap-2 text-yellow-900">
            <Landmark size={20} />
            {paymentId ? `Edit Vendor Payment ${paymentNumber}` : "Record New Vendor Payment"}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">{error}</div>
            )}

            <div className="space-y-2">
              <Label htmlFor="supplierId">Pay To (Vendor) *</Label>
              <select
                id="supplierId"
                name="supplierId"
                value={formData.supplierId}
                onChange={handleChange}
                required
                className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white"
              >
                <option value="">Select vendor...</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} - {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="referenceId">Link to Bill (optional)</Label>
              <select
                id="referenceId"
                name="referenceId"
                value={formData.referenceId}
                onChange={(e) => handleBillPick(e.target.value)}
                disabled={!!paymentId}
                className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white disabled:bg-slate-100"
              >
                <option value="">No bill — standalone payment</option>
                {supplierBills.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.billNumber} — outstanding {formatPrice(b.grandTotal - b.paidAmount)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-400">Selecting a bill auto-fills the vendor and outstanding amount.</p>
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
                <Label htmlFor="bankAccount">Bank Account / Reference</Label>
                <Input id="bankAccount" name="bankAccount" placeholder="Account / reference number" value={formData.bankAccount} onChange={handleChange} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">For Payment Of *</Label>
              <Input id="description" name="description" placeholder="e.g., Pembayaran Bill BILL-2026-0001" value={formData.description} onChange={handleChange} required />
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

            <div className="bg-yellow-50 rounded-lg p-4 flex justify-between items-center">
              <span className="text-slate-600 text-sm">Amount to pay:</span>
              <span className="font-bold text-lg text-yellow-800">{formatPrice(formData.amount)}</span>
            </div>

            <div className="flex gap-3 border-t pt-6">
              <Button type="button" variant="outline" onClick={() => router.push("/supply-chain/vendor-payments")}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : paymentId ? "Update Payment" : "Record Payment"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
