"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Plus, Trash2, Download } from "lucide-react";
import { Attachments } from "@/components/attachments";
import { ApprovalPanel } from "@/components/approval-panel";
import { PartNumberField } from "@/components/part-number-field";

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
  specification: string;
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
  const searchParams = useSearchParams();
  const rfqId = searchParams.get("rfqId");
  const [loading, setLoading] = useState(!!quotationId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sourceRfqNumber, setSourceRfqNumber] = useState<string | null>(null);
  const [quotationStatus, setQuotationStatus] = useState<string>("draft");
  const [customerPos, setCustomerPos] = useState<
    {
      id: string; soNumber: string; poNumber: string; poDate: string; status: string;
      items: { quantity: string | number; unitPrice: string | number }[];
      invoices: { invoiceNumber: string; status: string }[];
    }[]
  >([]);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [items, setItems] = useState<LineItem[]>([
    { id: "", lineNumber: 1, partNumber: "", description: "", specification: "", quantity: 0, unit: "pcs", unitPrice: 0, subtotal: 0, notes: "" },
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
      } else if (rfqId) {
        fetchRfq(rfqId);
      } else {
        setLoading(false);
      }
    }
  }, [status]);

  // Prefill from an RFQ so a sales rep never re-types what the customer already asked for.
  const fetchRfq = async (id: string) => {
    try {
      const res = await fetch(`/api/rfqs/${id}`);
      if (res.ok) {
        const rfq = await res.json();
        setSourceRfqNumber(rfq.number);
        setFormData((prev) => ({ ...prev, customerId: rfq.customerId }));
        if (rfq.items?.length > 0) {
          setItems(
            rfq.items.map((item: any) => ({
              lineNumber: item.lineNumber,
              partNumber: "",
              description: item.description,
              specification: "",
              quantity: Number(item.quantity),
              unit: item.unit || "pcs",
              unitPrice: 0,
              subtotal: 0,
              notes: item.notes || "",
            }))
          );
        }
      }
    } catch (err) {
      console.error("Error fetching RFQ:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchQuotation = async () => {
    try {
      const res = await fetch(`/api/quotations/${quotationId}`);
      if (res.ok) {
        const data = await res.json();
        setQuotationStatus(data.status);
        setCustomerPos(data.salesOrders || []);
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
              specification: item.specification || "",
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
        specification: "",
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

      // New quotations get their number from the server (PT MDA's own
      // "NNN/MDA/roman-tahun" numbering, not a client-guessed placeholder).
      const url = quotationId ? `/api/quotations/${quotationId}` : "/api/quotations";
      const method = quotationId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          ...formData,
          rfqId: quotationId ? undefined : rfqId || undefined,
          items: items.map((item) => ({
            lineNumber: item.lineNumber,
            partNumber: item.partNumber,
            description: item.description,
            specification: item.specification || null,
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

  const changeStatus = async (nextStatus: string) => {
    if (!quotationId) return;
    setStatusBusy(true);
    setStatusError(null);
    try {
      const res = await fetch(`/api/quotations/${quotationId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          ...formData,
          status: nextStatus,
          items: items.map((item) => ({
            lineNumber: item.lineNumber,
            partNumber: item.partNumber,
            description: item.description,
            specification: item.specification || null,
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
        throw new Error(data.error || "Gagal mengubah status penawaran");
      }
      setQuotationStatus(nextStatus);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : "Gagal mengubah status penawaran");
    } finally {
      setStatusBusy(false);
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

  const poValue = (po: (typeof customerPos)[number]) =>
    po.items.reduce((sum, i) => sum + Number(i.quantity) * Number(i.unitPrice), 0);
  const poTotal = customerPos.reduce((sum, po) => sum + poValue(po), 0);

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="max-w-5xl">
      {quotationId && <ApprovalPanel referenceType="Quotation" referenceId={quotationId} />}
      {quotationId && (
        <div className="mb-6 border-l-2 border-slate-300 border-y border-r border-y-slate-200 border-r-slate-200 bg-white px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Status Penawaran</p>
          <p className="mt-1 text-sm text-slate-700">
            Status saat ini: <strong className="capitalize">{quotationStatus}</strong>
          </p>
          {quotationStatus === "draft" && (
            <p className="mt-1 text-xs text-slate-500">
              Tombol ini tidak mengirim email — ini menandai bahwa penawaran sudah diserahkan ke customer (manual/print/WA/email di luar sistem),
              dan otomatis menyimpan salinan PDF final sebagai arsip terkirim.
            </p>
          )}
          {statusError && <p className="mt-2 text-sm text-red-700">{statusError}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {quotationStatus === "draft" && (
              <Button type="button" disabled={statusBusy} onClick={() => changeStatus("sent")}>
                {statusBusy ? "Memproses..." : "Tandai Terkirim"}
              </Button>
            )}
            {quotationStatus === "sent" && (
              <>
                <Button type="button" disabled={statusBusy} onClick={() => changeStatus("accepted")}>
                  Tandai Diterima (PO Masuk)
                </Button>
                <Button type="button" variant="outline" disabled={statusBusy} onClick={() => changeStatus("rejected")}>
                  Tandai Ditolak
                </Button>
                <Button type="button" variant="outline" disabled={statusBusy} onClick={() => changeStatus("expired")}>
                  Tandai Kedaluwarsa
                </Button>
              </>
            )}
            {(quotationStatus === "draft" || quotationStatus === "sent") && (
              <Button type="button" variant="outline" disabled={statusBusy} onClick={() => changeStatus("cancelled")}>
                Batalkan
              </Button>
            )}
          </div>

          {(quotationStatus === "sent" || quotationStatus === "accepted") && (
            <div className="mt-4 border-t border-slate-200 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                PO Customer ({customerPos.length})
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Satu penawaran bisa menghasilkan beberapa PO. Setiap PO dicatat sebagai Sales Order sendiri (no. PO + screenshot/file PO) dan menjadi dasar invoice.
              </p>
              {customerPos.length > 0 && (
                <div className="mt-2 grid grid-cols-3 gap-3 bg-slate-50 p-3 text-sm">
                  <div>
                    <p className="text-xs text-slate-500">Nilai penawaran</p>
                    <p className="font-semibold">{formatPrice(subtotal)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Total {customerPos.length} PO</p>
                    <p className="font-semibold">{formatPrice(poTotal)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">{subtotal - poTotal >= 0 ? "Sisa belum di-PO-kan" : "Melebihi penawaran"}</p>
                    <p className="font-semibold">{formatPrice(Math.abs(subtotal - poTotal))}</p>
                  </div>
                  <p className="col-span-3 text-xs text-slate-400">Semua nilai sebelum PPN.</p>
                </div>
              )}
              {customerPos.length > 0 && (
                <ul className="mt-2 divide-y divide-slate-100 border border-slate-200">
                  {customerPos.map((po) => (
                    <li key={po.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span>
                        <strong>{po.poNumber}</strong>
                        <span className="ml-2 text-slate-500">
                          {new Date(po.poDate).toLocaleDateString("id-ID")} · {po.soNumber} · {po.status}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {formatPrice(poValue(po))} ·{" "}
                          {po.invoices.length
                            ? `Invoice: ${po.invoices.map((i) => `${i.invoiceNumber} (${i.status})`).join(", ")}`
                            : "Belum ada invoice"}
                        </span>
                      </span>
                      <a href={`/sales/orders/${po.id}`} className="text-sm text-slate-700 underline">
                        Buka / lampiran
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              <a href={`/sales/orders/new?quotationId=${quotationId}`} className="mt-3 inline-block">
                <Button type="button">{customerPos.length ? "Catat PO Customer Lagi" : "Catat PO Customer"}</Button>
              </a>
            </div>
          )}
        </div>
      )}
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
            {sourceRfqNumber && (
              <div className="rounded-md p-3 text-sm" style={{ background: "var(--primary-tint)", color: "var(--primary)" }}>
                Dibuat dari RFQ {sourceRfqNumber} — pelanggan dan item sudah diisi otomatis, tinggal lengkapi harga.
              </div>
            )}
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
                          <PartNumberField
                            value={item.partNumber}
                            onChange={(v) => handleItemChange(index, "partNumber", v)}
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
                          <textarea
                            value={item.specification}
                            onChange={(e) => handleItemChange(index, "specification", e.target.value)}
                            placeholder="Specification (optional — one line per spec, e.g. fabrication detail list)"
                            rows={2}
                            className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-600"
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
