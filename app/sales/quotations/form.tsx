"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Plus, Trash2, Download } from "lucide-react";
import { Attachments } from "@/components/attachments";
import { ApprovalPanel } from "@/components/approval-panel";

interface Customer {
  id: string;
  code: string;
  name: string;
}

interface LineItem {
  id?: string;
  lineNumber: number;
  partNumber: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  subtotal: number;
  notes: string;
}

interface QuotationFormProps {
  quotationId?: string;
  companyId: string;
}

export function QuotationForm({ quotationId, companyId }: QuotationFormProps) {
  const router = useRouter();
  const { status } = useSession();
  const [loading, setLoading] = useState(!!quotationId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<LineItem[]>([
    { id: "", lineNumber: 1, partNumber: "", description: "", quantity: 0, unit: "pcs", unitPrice: 0, subtotal: 0, notes: "" },
  ]);

  const [formData, setFormData] = useState(() => {
    const today = new Date();
    const expiry = new Date(today);
    expiry.setDate(today.getDate() + 14);

    return {
      customerId: "",
      number: "",
      quotationDate: today.toISOString().split("T")[0],
      expiryDate: expiry.toISOString().split("T")[0],
      paymentTerms: "",
      validityDays: 14,
      pic: "",
      ppnPercent: 11,
      pphPercent: 0,
      notes: "",
    };
  });

  useEffect(() => {
    if (status === "authenticated") {
      fetchCustomers();
      if (quotationId) {
        fetchQuotation();
      } else {
        setLoading(false);
      }
    }
  }, [status]);

  const fetchQuotation = async () => {
    try {
      const res = await fetch(`/api/quotations/${quotationId}`);
      if (res.ok) {
        const data = await res.json();
        setFormData({
          customerId: data.customerId,
          number: data.number,
          quotationDate: data.quotationDate.split("T")[0],
          expiryDate: data.expiryDate.split("T")[0],
          paymentTerms: data.paymentTerms || "",
          validityDays: data.validityDays ?? 14,
          pic: data.pic || "",
          ppnPercent: Number(data.ppnPercent ?? 11),
          pphPercent: Number(data.pphPercent ?? 0),
          notes: data.notes || "",
        });
        if (data.items && data.items.length > 0) {
          setItems(
            data.items.map((item: any) => ({
              id: item.id,
              lineNumber: item.lineNumber,
              partNumber: item.partNumber || "",
              description: item.description,
              quantity: Number(item.quantity),
              unit: item.unit,
              unitPrice: Number(item.unitPrice),
              subtotal: Number(item.subtotal),
              notes: item.notes || "",
            }))
          );
        }
      }
    } catch (err) {
      console.error("Error fetching quotation:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      const res = await fetch("/api/customers");
      if (res.ok) {
        const data = await res.json();
        setCustomers(data);
      }
    } catch (err) {
      console.error("Error fetching customers:", err);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    const numericFields = ["validityDays", "ppnPercent", "pphPercent"];
    setFormData((prev) => ({
      ...prev,
      [name]: numericFields.includes(name) ? parseFloat(value) || 0 : value,
    }));
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };

    if (field === "quantity" || field === "unitPrice") {
      newItems[index].subtotal = newItems[index].quantity * newItems[index].unitPrice;
    }

    setItems(newItems);
  };

  const addItem = () => {
    const newLineNumber = Math.max(...items.map((i) => i.lineNumber), 0) + 1;
    setItems([
      ...items,
      {
        lineNumber: newLineNumber,
        partNumber: "",
        description: "",
        quantity: 0,
        unit: "pcs",
        unitPrice: 0,
        subtotal: 0,
        notes: "",
      },
    ]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const calculateTotals = () => {
    const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
    const ppn = (subtotal * formData.ppnPercent) / 100;
    const pph = (subtotal * formData.pphPercent) / 100;
    return { subtotal, ppn, pph, total: subtotal + ppn - pph };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (!items.length || !items[0].description) {
        throw new Error("At least one line item is required");
      }

      const quotationNumber = quotationId
        ? formData.number
        : `QT-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;

      const url = quotationId ? `/api/quotations/${quotationId}` : "/api/quotations";
      const method = quotationId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          ...formData,
          number: quotationNumber,
          items: items.map((item) => ({
            lineNumber: item.lineNumber,
            partNumber: item.partNumber,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            subtotal: item.subtotal,
            notes: item.notes,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save quotation");
      }

      router.push("/sales/quotations");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving quotation");
    } finally {
      setSubmitting(false);
    }
  };

  const { subtotal, ppn, pph, total } = calculateTotals();
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(price);
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="max-w-5xl">
      {quotationId && <ApprovalPanel referenceType="Quotation" referenceId={quotationId} />}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft size={18} />
          Back to Quotations
        </button>
        {quotationId && (
          <a
            href={`/api/quotations/${quotationId}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button type="button" variant="outline" className="gap-2">
              <Download size={16} />
              Download PDF
            </Button>
          </a>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{quotationId ? "Edit Quotation" : "Create New Quotation"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4 bg-slate-50 p-4 rounded-lg">
              <h3 className="font-semibold text-slate-900">Quotation Information</h3>

              <div className="grid grid-cols-3 gap-4">
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
                  <Label htmlFor="pic">PIC (Attn)</Label>
                  <Input
                    id="pic"
                    name="pic"
                    placeholder="Customer contact person"
                    value={formData.pic}
                    onChange={handleChange}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="quotationDate">Quotation Date *</Label>
                  <Input
                    id="quotationDate"
                    name="quotationDate"
                    type="date"
                    value={formData.quotationDate}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="expiryDate">Expiry Date *</Label>
                  <Input
                    id="expiryDate"
                    name="expiryDate"
                    type="date"
                    value={formData.expiryDate}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="paymentTerms">Term of Payment</Label>
                  <Input
                    id="paymentTerms"
                    name="paymentTerms"
                    placeholder="e.g., Cash Before Delivery"
                    value={formData.paymentTerms}
                    onChange={handleChange}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="validityDays">Validation (Days)</Label>
                  <Input
                    id="validityDays"
                    name="validityDays"
                    type="number"
                    min="0"
                    value={formData.validityDays}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ppnPercent">PPN (%)</Label>
                  <Input
                    id="ppnPercent"
                    name="ppnPercent"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.ppnPercent}
                    onChange={handleChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pphPercent">PPH (%)</Label>
                  <Input
                    id="pphPercent"
                    name="pphPercent"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.pphPercent}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Special Notes</Label>
                <textarea
                  id="notes"
                  name="notes"
                  placeholder="Additional notes or terms"
                  value={formData.notes}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                  rows={3}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-900">Line Items</h3>
                <Button type="button" variant="outline" size="sm" onClick={addItem} className="gap-2">
                  <Plus size={16} />
                  Add Item
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="text-left p-2 w-28">Part Number</th>
                      <th className="text-left p-2">Description</th>
                      <th className="text-right p-2 w-24">Qty</th>
                      <th className="text-center p-2 w-20">UOM</th>
                      <th className="text-right p-2 w-32">Unit Price</th>
                      <th className="text-right p-2 w-32">Subtotal</th>
                      <th className="text-left p-2 w-28">Remark</th>
                      <th className="text-center p-2 w-12">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => (
                      <tr key={index} className="border-b border-slate-200">
                        <td className="p-2">
                          <Input
                            value={item.partNumber}
                            onChange={(e) => handleItemChange(index, "partNumber", e.target.value)}
                            placeholder="Part no."
                            className="border-0"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            value={item.description}
                            onChange={(e) => handleItemChange(index, "description", e.target.value)}
                            placeholder="Item description"
                            className="border-0"
                            required
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            value={item.quantity}
                            onChange={(e) =>
                              handleItemChange(index, "quantity", parseFloat(e.target.value) || 0)
                            }
                            className="border-0 text-right"
                            min="0"
                            step="0.01"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            value={item.unit}
                            onChange={(e) => handleItemChange(index, "unit", e.target.value)}
                            placeholder="pcs"
                            className="border-0 text-center"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            value={item.unitPrice}
                            onChange={(e) =>
                              handleItemChange(index, "unitPrice", parseFloat(e.target.value) || 0)
                            }
                            className="border-0 text-right"
                            min="0"
                            step="0.01"
                          />
                        </td>
                        <td className="p-2 text-right font-semibold">
                          {formatPrice(item.subtotal)}
                        </td>
                        <td className="p-2">
                          <Input
                            value={item.notes}
                            onChange={(e) => handleItemChange(index, "notes", e.target.value)}
                            placeholder="-"
                            className="border-0"
                          />
                        </td>
                        <td className="p-2 text-center">
                          {items.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeItem(index)}
                              className="text-red-600 hover:bg-red-50"
                            >
                              <Trash2 size={16} />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end">
              <div className="w-80 space-y-2 bg-slate-50 p-4 rounded-lg">
                <div className="flex justify-between">
                  <span className="text-slate-600">Subtotal:</span>
                  <span className="font-semibold">{formatPrice(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">PPN ({formData.ppnPercent}%):</span>
                  <span className="font-semibold">{formatPrice(ppn)}</span>
                </div>
                {formData.pphPercent > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">PPH ({formData.pphPercent}%):</span>
                    <span className="font-semibold">-{formatPrice(pph)}</span>
                  </div>
                )}
                <div className="border-t border-slate-200 pt-2 flex justify-between">
                  <span className="font-bold">Total:</span>
                  <span className="font-bold text-lg text-blue-600">{formatPrice(total)}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 border-t pt-6">
              <Button type="button" variant="outline" onClick={() => router.push("/sales/quotations")}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : quotationId ? "Update Quotation" : "Create Quotation"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      {quotationId && <Attachments referenceType="Quotation" referenceId={quotationId} />}
    </div>
  );
}
