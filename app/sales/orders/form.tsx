"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DocumentHeader, StatusLabel } from "@/components/ui/document-form";
import { Attachments } from "@/components/attachments";
import { PartNumberField } from "@/components/part-number-field";
import {
  ArrowLeft,
  Plus,
  Trash2,
  FileText,
  Building2,
  Truck,
  Receipt,
  CalendarDays,
} from "lucide-react";

interface Customer {
  id: string;
  code: string;
  name: string;
  address?: string | null;
  city?: string | null;
}

interface QuotationOption {
  id: string;
  number: string;
  customerId: string;
  customer: { name: string };
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

interface SalesOrderFormProps {
  soId?: string;
  companyId: string;
}

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "confirmed", label: "Confirmed" },
  { value: "partially_delivered", label: "Partially Delivered" },
  { value: "delivered", label: "Delivered" },
  { value: "invoiced", label: "Invoiced" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_TONE: Record<string, "slate" | "green" | "amber" | "red" | "blue"> = {
  draft: "slate",
  confirmed: "blue",
  partially_delivered: "amber",
  delivered: "blue",
  invoiced: "green",
  cancelled: "red",
};

function SectionCard({
  icon: Icon,
  title,
  children,
  className = "",
}: {
  icon: any;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`border border-slate-200 bg-white ${className}`}>
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/50 px-5 py-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export function SalesOrderForm({ soId, companyId }: SalesOrderFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillQuotationId = searchParams.get("quotationId");
  const { status } = useSession();
  const [loading, setLoading] = useState(!!soId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [acceptedQuotations, setAcceptedQuotations] = useState<QuotationOption[]>([]);
  const [quotationId, setQuotationId] = useState("");
  const [soNumber, setSoNumber] = useState("");
  const [linked, setLinked] = useState<{
    quotation?: { number: string } | null;
    deliveries: { deliveryNumber: string; status?: string }[];
    invoices: { invoiceNumber: string; status?: string }[];
  } | null>(null);
  const [progress, setProgress] = useState<{ label: string; tone: string } | null>(null);
  const [items, setItems] = useState<LineItem[]>([
    { lineNumber: 1, partNumber: "", description: "", quantity: 0, unit: "pcs", unitPrice: 0, subtotal: 0, notes: "" },
  ]);

  const [formData, setFormData] = useState({
    customerId: "",
    poNumber: "",
    poDate: new Date().toISOString().split("T")[0],
    deliveryDate: "",
    status: "draft",
    notes: "",
  });

  useEffect(() => {
    if (status === "authenticated") {
      fetchCustomers();
      fetchAcceptedQuotations();
      if (soId) {
        fetchSalesOrder();
      } else {
        setLoading(false);
        if (prefillQuotationId) {
          handleQuotationPick(prefillQuotationId);
        }
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

  const fetchAcceptedQuotations = async () => {
    try {
      const res = await fetch("/api/quotations");
      if (res.ok) {
        const data = await res.json();
        setAcceptedQuotations(data.filter((q: any) => q.status === "accepted"));
      }
    } catch (err) {
      console.error("Error fetching quotations:", err);
    }
  };

  const fetchSalesOrder = async () => {
    try {
      const res = await fetch(`/api/sales-orders/${soId}`);
      if (res.ok) {
        const data = await res.json();
        setSoNumber(data.soNumber);
        setProgress(data.progress || null);
        setLinked({
          quotation: data.quotation,
          deliveries: data.deliveries || [],
          invoices: data.invoices || [],
        });
        setFormData({
          customerId: data.customerId,
          poNumber: data.poNumber,
          poDate: data.poDate.split("T")[0],
          deliveryDate: data.deliveryDate ? data.deliveryDate.split("T")[0] : "",
          status: data.status,
          notes: data.notes || "",
        });
        if (data.items?.length > 0) {
          setItems(
            data.items.map((item: any) => ({
              id: item.id,
              lineNumber: item.lineNumber,
              partNumber: item.partNumber || "",
              description: item.description,
              quantity: Number(item.quantity),
              unit: item.unit || "pcs",
              unitPrice: Number(item.unitPrice),
              subtotal: Number(item.subtotal),
              notes: item.notes || "",
            }))
          );
        }
      }
    } catch (err) {
      console.error("Error fetching sales order:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleQuotationPick = async (id: string) => {
    setQuotationId(id);
    if (!id) return;
    try {
      const res = await fetch(`/api/quotations/${id}`);
      if (res.ok) {
        const q = await res.json();
        setFormData((prev) => ({ ...prev, customerId: q.customerId }));
        setItems(
          q.items.map((item: any, index: number) => ({
            lineNumber: index + 1,
            partNumber: item.partNumber || "",
            description: item.description,
            quantity: Number(item.quantity),
            unit: item.unit || "pcs",
            unitPrice: Number(item.unitPrice),
            subtotal: Number(item.quantity) * Number(item.unitPrice),
            notes: "",
          }))
        );
      }
    } catch (err) {
      console.error("Error fetching quotation detail:", err);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
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
      { lineNumber: newLineNumber, partNumber: "", description: "", quantity: 0, unit: "pcs", unitPrice: 0, subtotal: 0, notes: "" },
    ]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) setItems(items.filter((_, i) => i !== index));
  };

  const total = items.reduce((sum, item) => sum + item.subtotal, 0);
  const formatPrice = (price: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(price);

  const selectedCustomer = customers.find((c) => c.id === formData.customerId);

  const closeNonPkp = async () => {
    if (
      !window.confirm(
        "Tandai order ini selesai tanpa surat jalan/invoice? Gunakan ini hanya untuk pelanggan non-PKP yang sudah membayar penuh di luar alur dokumen normal."
      )
    ) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales-orders/${soId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          ...formData,
          status: "invoiced",
          items: items.map((item) => ({
            partNumber: item.partNumber,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            notes: item.notes,
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Gagal menandai order selesai");
      }
      router.push("/sales/orders");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menandai order selesai");
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (!formData.customerId) throw new Error("Customer is required");
      if (!items.length || !items[0].description) {
        throw new Error("At least one line item is required");
      }

      const url = soId ? `/api/sales-orders/${soId}` : "/api/sales-orders";
      const method = soId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          quotationId: quotationId || null,
          ...formData,
          items: items.map((item) => ({
            partNumber: item.partNumber,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            notes: item.notes,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save sales order");
      }

      if (!soId) {
        const created = await res.json();
        router.push(`/sales/orders/${created.id}`);
        return;
      }
      router.push("/sales/orders");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving sales order");
    } finally {
      setSubmitting(false);
    }
  };

  const hasActiveDelivery = !!linked?.deliveries.some((d) => d.status !== "cancelled");
  const hasActiveInvoice = !!linked?.invoices.some((i) => i.status !== "cancelled");

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft size={16} />
          Back to Sales Orders
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <DocumentHeader
          eyebrow="Sales Order"
          title={soId ? soNumber : "New Sales Order"}
          gradient="indigo"
          badge={soId && <StatusLabel label={progress?.label || formData.status.replace(/_/g, " ")} tone={progress ? (progress.tone === "indigo" ? "blue" : (progress.tone as "slate" | "green" | "amber" | "red" | "blue")) : STATUS_TONE[formData.status] || "slate"} />}
          actions={
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : soId ? "Update Order" : "Confirm Order"}
            </Button>
          }
        />

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main column */}
          <div className="lg:col-span-2 space-y-6">
            <SectionCard icon={Building2} title="Order Information">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {!soId && (
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="quotationPick" className="text-xs text-slate-500">
                      Convert from Accepted Quotation (optional)
                    </Label>
                    <select
                      id="quotationPick"
                      value={quotationId}
                      onChange={(e) => handleQuotationPick(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">No quotation — manual entry</option>
                      {acceptedQuotations.map((q) => (
                        <option key={q.id} value={q.id}>
                          {q.number} — {q.customer.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="customerId" className="text-xs text-slate-500">
                    Customer *
                  </Label>
                  <select
                    id="customerId"
                    name="customerId"
                    value={formData.customerId}
                    onChange={handleChange}
                    required
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select customer...</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} - {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="poNumber" className="text-xs text-slate-500">
                    Customer PO Number *
                  </Label>
                  <Input
                    id="poNumber"
                    name="poNumber"
                    placeholder="e.g., PO/CUST/2026/001"
                    value={formData.poNumber}
                    onChange={handleChange}
                    required
                    className="rounded-lg"
                  />
                  {!soId && (
                    <p className="text-xs text-slate-400">
                      Setelah disimpan, Anda diarahkan ke halaman order ini untuk mengunggah screenshot/file PO customer.
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="poDate" className="text-xs text-slate-500">
                    Customer PO Date *
                  </Label>
                  <Input
                    id="poDate"
                    name="poDate"
                    type="date"
                    value={formData.poDate}
                    onChange={handleChange}
                    required
                    className="rounded-lg"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="deliveryDate" className="text-xs text-slate-500">
                    Requested Delivery Date
                  </Label>
                  <Input
                    id="deliveryDate"
                    name="deliveryDate"
                    type="date"
                    value={formData.deliveryDate}
                    onChange={handleChange}
                    className="rounded-lg"
                  />
                </div>

                {soId && (
                  <div className="space-y-1.5">
                    <Label htmlFor="status" className="text-xs text-slate-500">
                      Order Status (dokumen)
                    </Label>
                    <select
                      id="status"
                      name="status"
                      value={formData.status}
                      onChange={handleChange}
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-slate-400">
                      Beda dari progres di atas: ini status dokumen (dipakai untuk Batalkan atau tandai selesai manual), bukan tahapan pengerjaan aktual.
                    </p>
                  </div>
                )}

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="notes" className="text-xs text-slate-500">
                    Notes
                  </Label>
                  <textarea
                    id="notes"
                    name="notes"
                    value={formData.notes}
                    onChange={handleChange}
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </SectionCard>

            <SectionCard icon={FileText} title="Order Items">
              <div className="flex justify-end mb-3 -mt-2">
                <Button type="button" variant="outline" size="sm" onClick={addItem} className="gap-1.5 rounded-lg">
                  <Plus size={14} />
                  Add Item
                </Button>
              </div>
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                      <th className="text-left px-2 py-2 font-medium w-36">Part No.</th>
                      <th className="text-left px-2 py-2 font-medium">Description</th>
                      <th className="text-right px-2 py-2 font-medium w-20">Qty</th>
                      <th className="text-center px-2 py-2 font-medium w-16">Unit</th>
                      <th className="text-right px-2 py-2 font-medium w-32">Unit Price</th>
                      <th className="text-right px-2 py-2 font-medium w-32">Subtotal</th>
                      <th className="text-center px-2 py-2 font-medium w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => (
                      <tr key={index} className="border-b border-slate-100 hover:bg-slate-50/60">
                        <td className="px-2 py-1.5">
                          <PartNumberField
                            value={item.partNumber}
                            onChange={(v) => handleItemChange(index, "partNumber", v)}
                            placeholder="-"
                            className="border-0 shadow-none focus-visible:ring-1"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            value={item.description}
                            onChange={(e) => handleItemChange(index, "description", e.target.value)}
                            placeholder="Item description"
                            className="border-0 shadow-none focus-visible:ring-1"
                            required
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => handleItemChange(index, "quantity", parseFloat(e.target.value) || 0)}
                            className="border-0 shadow-none text-right tabular-nums focus-visible:ring-1"
                            min="0"
                            step="0.01"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            value={item.unit}
                            onChange={(e) => handleItemChange(index, "unit", e.target.value)}
                            className="border-0 shadow-none text-center focus-visible:ring-1"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            type="number"
                            value={item.unitPrice}
                            onChange={(e) => handleItemChange(index, "unitPrice", parseFloat(e.target.value) || 0)}
                            className="border-0 shadow-none text-right tabular-nums focus-visible:ring-1"
                            min="0"
                            step="0.01"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-slate-800">
                          {formatPrice(item.subtotal)}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          {items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeItem(index)}
                              className="text-slate-400 hover:text-red-600"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end mt-4 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-500">Order Total</span>
                  <span className="text-xl font-bold tabular-nums text-indigo-900">{formatPrice(total)}</span>
                </div>
              </div>
            </SectionCard>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <div className="border border-slate-200 bg-white p-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">Bill To</h3>
              {selectedCustomer ? (
                <div className="space-y-1">
                  <p className="font-semibold text-slate-900">{selectedCustomer.name}</p>
                  <p className="text-xs text-slate-400 font-mono">{selectedCustomer.code}</p>
                  {selectedCustomer.address && (
                    <p className="text-sm text-slate-500 mt-2">{selectedCustomer.address}</p>
                  )}
                  {selectedCustomer.city && <p className="text-sm text-slate-500">{selectedCustomer.city}</p>}
                </div>
              ) : (
                <p className="text-sm text-slate-400">Select a customer to see their details here.</p>
              )}
            </div>

            <div className="border border-slate-200 bg-white p-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
                <CalendarDays size={14} className="text-indigo-600" />
                Order Summary
              </h3>
              <dl className="space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Line Items</dt>
                  <dd className="font-medium text-slate-900">{items.length}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Total Quantity</dt>
                  <dd className="font-medium text-slate-900 tabular-nums">
                    {items.reduce((sum, i) => sum + Number(i.quantity || 0), 0)}
                  </dd>
                </div>
                <div className="flex justify-between border-t border-slate-100 pt-2.5">
                  <dt className="font-semibold text-slate-700">Order Total</dt>
                  <dd className="font-bold text-indigo-900 tabular-nums">{formatPrice(total)}</dd>
                </div>
              </dl>
            </div>

            {(linked?.quotation || linked?.deliveries.length || linked?.invoices.length) && (
              <div className="border border-slate-200 bg-white p-6">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">
                  Linked Documents
                </h3>
                <ul className="space-y-2.5 text-sm">
                  {linked?.quotation && (
                    <li className="flex items-center gap-2 text-slate-600">
                      <FileText size={14} className="text-slate-400" />
                      Quotation {linked.quotation.number}
                    </li>
                  )}
                  {linked?.deliveries.map((d) => (
                    <li key={d.deliveryNumber} className="flex items-center gap-2 text-slate-600">
                      <Truck size={14} className="text-slate-400" />
                      Surat Jalan {d.deliveryNumber}
                    </li>
                  ))}
                  {linked?.invoices.map((inv) => (
                    <li key={inv.invoiceNumber} className="flex items-center gap-2 text-slate-600">
                      <Receipt size={14} className="text-slate-400" />
                      Invoice {inv.invoiceNumber}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 justify-end mt-6">
          {soId && (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={hasActiveDelivery || formData.status === "cancelled"}
              title={hasActiveDelivery ? "Surat jalan sudah dibuat untuk order ini" : undefined}
              onClick={() => router.push(`/sales/delivery/new?soId=${soId}`)}
              className="rounded-lg"
            >
              {hasActiveDelivery ? "Surat Jalan sudah dibuat" : "Create Surat Jalan"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={hasActiveInvoice || formData.status === "cancelled"}
              title={hasActiveInvoice ? "Invoice sudah dibuat untuk order ini" : undefined}
              onClick={() => router.push(`/finance/invoices/new?soId=${soId}`)}
              className="rounded-lg"
            >
              {hasActiveInvoice ? "Invoice sudah dibuat" : "Create Invoice"}
            </Button>
            {!linked?.deliveries.length && !linked?.invoices.length && formData.status !== "invoiced" && formData.status !== "cancelled" && (
              <Button
                type="button"
                variant="outline"
                onClick={closeNonPkp}
                disabled={submitting}
                className="rounded-lg border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                title="Untuk pelanggan non-PKP yang sudah dibayar tanpa surat jalan/invoice"
              >
                Tandai Selesai (Non-PKP)
              </Button>
            )}
          </>
        )}
        <Button type="button" variant="outline" onClick={() => router.push("/sales/orders")} className="rounded-lg">
            Cancel
          </Button>
          <Button type="submit" disabled={submitting} className="rounded-lg">
            {submitting ? "Saving..." : soId ? "Update Order" : "Confirm Order"}
          </Button>
        </div>
      </form>
      {soId && <Attachments referenceType="SalesOrder" referenceId={soId} />}
    </div>
  );
}
