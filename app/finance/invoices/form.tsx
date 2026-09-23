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

interface Customer {
  id: string;
  code: string;
  name: string;
}

interface SalesOrderOption {
  id: string;
  soNumber: string;
  customerId: string;
  status: string;
  customer: { name: string };
  items: { partNumber: string | null; description: string; quantity: string; unit: string | null; unitPrice: string; subtotal: string }[];
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
}

interface InvoiceFormProps {
  invoiceId?: string;
  companyId: string;
}

const STATUS_OPTIONS = ["draft", "sent", "partial_paid", "paid", "overdue", "cancelled"];

export function InvoiceForm({ invoiceId, companyId }: InvoiceFormProps) {
  const router = useRouter();
  const { status } = useSession();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(!!invoiceId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [paidAmount, setPaidAmount] = useState(0); // cash received + PPh withheld, as stored
  const [pph, setPph] = useState(0);
  const [origPph, setOrigPph] = useState(0);
  const [proofNo, setProofNo] = useState("");
  const [proofDate, setProofDate] = useState("");
  const [salesOrders, setSalesOrders] = useState<SalesOrderOption[]>([]);
  const [soId, setSoId] = useState("");
  const [items, setItems] = useState<LineItem[]>([
    { id: "", lineNumber: 1, partNumber: "", description: "", quantity: 0, unit: "pcs", unitPrice: 0, subtotal: 0 },
  ]);

  const [formData, setFormData] = useState(() => {
    const today = new Date();
    const due = new Date(today);
    due.setDate(today.getDate() + 30);

    return {
      customerId: "",
      invoiceDate: today.toISOString().split("T")[0],
      dueDate: due.toISOString().split("T")[0],
      paymentTerms: "",
      ppnPercent: 11,
      docStatus: "draft",
      notes: "",
    };
  });

  useEffect(() => {
    if (status === "authenticated") {
      fetchCustomers();
      if (!invoiceId) fetchSalesOrders();
      if (invoiceId) {
        fetchInvoice();
      } else {
        setLoading(false);
      }
    }
  }, [status]);

  const fetchInvoice = async () => {
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`);
      if (res.ok) {
        const data = await res.json();
        setFormData({
          customerId: data.customerId,
          invoiceDate: data.invoiceDate.split("T")[0],
          dueDate: data.dueDate ? data.dueDate.split("T")[0] : "",
          paymentTerms: data.paymentTerms || "",
          ppnPercent: Number(data.ppnPercent ?? 11),
          docStatus: data.status || "draft",
          notes: data.notes || "",
        });
        setPaidAmount(Number(data.paidAmount || 0));
        setPph(Number(data.pphAmount || 0));
        setOrigPph(Number(data.pphAmount || 0));
        setProofNo(data.pphProofNumber || "");
        setProofDate(data.pphProofDate ? data.pphProofDate.split("T")[0] : "");
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
            }))
          );
        }
      }
    } catch (err) {
      console.error("Error fetching invoice:", err);
    } finally {
      setLoading(false);
    }
  };

  const applySo = (so: SalesOrderOption) => {
    setSoId(so.id);
    setFormData((prev) => ({ ...prev, customerId: so.customerId }));
    setItems(
      so.items.map((item, index) => ({
        lineNumber: index + 1,
        partNumber: item.partNumber || "",
        description: item.description,
        quantity: Number(item.quantity),
        unit: item.unit || "pcs",
        unitPrice: Number(item.unitPrice),
        subtotal: Number(item.subtotal),
      }))
    );
  };

  const handleSoPick = (id: string) => {
    const so = salesOrders.find((s) => s.id === id);
    if (so) applySo(so);
    else setSoId("");
  };

  const fetchSalesOrders = async () => {
    try {
      const res = await fetch("/api/sales-orders");
      if (res.ok) {
        const data: SalesOrderOption[] = (await res.json()).filter((s: SalesOrderOption) => s.status !== "cancelled");
        setSalesOrders(data);
        const preselect = searchParams.get("soId");
        const so = preselect ? data.find((s) => s.id === preselect) : null;
        if (so) applySo(so);
      }
    } catch (err) {
      console.error("Error fetching sales orders:", err);
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    const numericFields = ["ppnPercent"];
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
    setItems([...items, { lineNumber: newLineNumber, partNumber: "", description: "", quantity: 0, unit: "pcs", unitPrice: 0, subtotal: 0 }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) setItems(items.filter((_, i) => i !== index));
  };

  const calculateTotals = () => {
    const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
    const tax = (subtotal * formData.ppnPercent) / 100;
    return { subtotal, tax, total: subtotal + tax };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (!items.length || !items[0].description) {
        throw new Error("At least one line item is required");
      }

      const url = invoiceId ? `/api/invoices/${invoiceId}` : "/api/invoices";
      const method = invoiceId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          customerId: formData.customerId,
          soId: soId || undefined,
          invoiceDate: formData.invoiceDate,
          dueDate: formData.dueDate,
          paymentTerms: formData.paymentTerms,
          ppnPercent: formData.ppnPercent,
          pphAmount: pph,
          pphProofNumber: proofNo,
          pphProofDate: proofDate || null,
          status: formData.docStatus,
          notes: formData.notes,
          items: items.map((item) => ({
            lineNumber: item.lineNumber,
            partNumber: item.partNumber,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            subtotal: item.subtotal,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save invoice");
      }

      router.push("/finance/invoices");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving invoice");
    } finally {
      setSubmitting(false);
    }
  };

  const { subtotal, tax, total } = calculateTotals();
  const cashPaid = paidAmount - origPph;
  const balanceDue = total - pph - cashPaid;
  const formatPrice = (price: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(price);

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-slate-600 hover:text-slate-900">
          <ArrowLeft size={18} />
          Back to Invoices
        </button>
        {invoiceId && (
          <a href={`/api/invoices/${invoiceId}/pdf`} target="_blank" rel="noopener noreferrer">
            <Button type="button" variant="outline" className="gap-2">
              <Download size={16} />
              Download PDF
            </Button>
          </a>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{invoiceId ? "Edit Invoice" : "Create New Invoice"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">{error}</div>
            )}

            <div className="space-y-4 bg-blue-50 p-4 rounded-lg">
              <h3 className="font-semibold text-slate-900">Invoice Information</h3>

              {!invoiceId && (
                <div className="space-y-2">
                  <Label htmlFor="soPick">From Sales Order (optional)</Label>
                  <select
                    id="soPick"
                    value={soId}
                    onChange={(e) => handleSoPick(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white"
                  >
                    <option value="">No order — manual entry</option>
                    {salesOrders.map((so) => (
                      <option key={so.id} value={so.id}>
                        {so.soNumber} — {so.customer.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-400">Copies the order's customer and items. Saving the invoice marks the order as invoiced.</p>
                </div>
              )}

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
                  <Label htmlFor="invoiceDate">Invoice Date *</Label>
                  <Input id="invoiceDate" name="invoiceDate" type="date" value={formData.invoiceDate} onChange={handleChange} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dueDate">Due Date</Label>
                  <Input id="dueDate" name="dueDate" type="date" value={formData.dueDate} onChange={handleChange} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="paymentTerms">Payment Terms</Label>
                  <Input id="paymentTerms" name="paymentTerms" placeholder="e.g., Net 30" value={formData.paymentTerms} onChange={handleChange} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ppnPercent">PPN (%)</Label>
                  <Input id="ppnPercent" name="ppnPercent" type="number" min="0" step="0.01" value={formData.ppnPercent} onChange={handleChange} />
                </div>
                {invoiceId && (
                  <div className="space-y-2">
                    <Label htmlFor="docStatus">Status</Label>
                    <select
                      id="docStatus"
                      name="docStatus"
                      value={formData.docStatus}
                      onChange={handleChange}
                      className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white capitalize"
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s.replace("_", " ")}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <textarea
                  id="notes"
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                  rows={2}
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
                      <th className="text-center p-2 w-20">Unit</th>
                      <th className="text-right p-2 w-32">Unit Price</th>
                      <th className="text-right p-2 w-32">Subtotal</th>
                      <th className="text-center p-2 w-12">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => (
                      <tr key={index} className="border-b border-slate-200">
                        <td className="p-2">
                          <Input value={item.partNumber} onChange={(e) => handleItemChange(index, "partNumber", e.target.value)} placeholder="Part no." className="border-0" />
                        </td>
                        <td className="p-2">
                          <Input value={item.description} onChange={(e) => handleItemChange(index, "description", e.target.value)} placeholder="Item description" className="border-0" required />
                        </td>
                        <td className="p-2">
                          <Input type="number" value={item.quantity} onChange={(e) => handleItemChange(index, "quantity", parseFloat(e.target.value) || 0)} className="border-0 text-right" min="0" step="0.01" />
                        </td>
                        <td className="p-2">
                          <Input value={item.unit} onChange={(e) => handleItemChange(index, "unit", e.target.value)} placeholder="pcs" className="border-0 text-center" />
                        </td>
                        <td className="p-2">
                          <Input type="number" value={item.unitPrice} onChange={(e) => handleItemChange(index, "unitPrice", parseFloat(e.target.value) || 0)} className="border-0 text-right" min="0" step="0.01" />
                        </td>
                        <td className="p-2 text-right font-semibold">{formatPrice(item.subtotal)}</td>
                        <td className="p-2 text-center">
                          {items.length > 1 && (
                            <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(index)} className="text-red-600 hover:bg-red-50">
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

            <div className="space-y-3 border border-slate-200 p-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-2">
                  <Label htmlFor="pph">PPh 23 dipotong customer (Rp)</Label>
                  <Input id="pph" type="number" min="0" step="0.01" value={pph} onChange={(e) => setPph(Math.max(parseFloat(e.target.value) || 0, 0))} className="w-48" />
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setPph(Math.round(subtotal * 0.02 * 100) / 100)}>
                  Isi 2% dari subtotal
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setPph(0)}>Tanpa PPh</Button>
              </div>
              {pph > 0 && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="proofNo">No. bukti potong dari customer</Label>
                    <Input id="proofNo" value={proofNo} onChange={(e) => setProofNo(e.target.value)} placeholder="Belum diterima bila kosong" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="proofDate">Tanggal bukti potong</Label>
                    <Input id="proofDate" type="date" value={proofDate} onChange={(e) => setProofDate(e.target.value)} />
                  </div>
                </div>
              )}
              <p className="text-xs text-slate-400">Customer yang memotong PPh 23 hanya mentransfer sisanya. Nilai PPh dicatat sebagai pajak dibayar dimuka dan mengurangi piutang.</p>
            </div>

            <div className="flex justify-end">
              <div className="w-80 space-y-2 bg-blue-50 p-4 rounded-lg">
                <div className="flex justify-between">
                  <span className="text-slate-600">Subtotal:</span>
                  <span className="font-semibold">{formatPrice(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">PPN ({formData.ppnPercent}%):</span>
                  <span className="font-semibold">{formatPrice(tax)}</span>
                </div>
                {pph > 0 && (
                  <div className="flex justify-between text-amber-700">
                    <span>PPh 23 dipotong:</span>
                    <span className="font-semibold">-{formatPrice(pph)}</span>
                  </div>
                )}
                {cashPaid > 0 && (
                  <div className="flex justify-between text-green-700">
                    <span>Paid:</span>
                    <span className="font-semibold">-{formatPrice(cashPaid)}</span>
                  </div>
                )}
                <div className="border-t border-slate-300 pt-2 flex justify-between">
                  <span className="font-bold">{cashPaid > 0 || pph > 0 ? "Balance Due:" : "Total Due:"}</span>
                  <span className="font-bold text-lg text-blue-700">{formatPrice(balanceDue)}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 border-t pt-6">
              <Button type="button" variant="outline" onClick={() => router.push("/finance/invoices")}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : invoiceId ? "Update Invoice" : "Create Invoice"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      {invoiceId && <Attachments referenceType="Invoice" referenceId={invoiceId} />}
    </div>
  );
}
