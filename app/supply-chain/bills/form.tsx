"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Plus, Trash2, Receipt } from "lucide-react";
import { Attachments } from "@/components/attachments";

interface Supplier {
  id: string;
  code: string;
  name: string;
}

interface PurchaseOrderOption {
  id: string;
  poNumber: string;
  supplierId: string;
  items: { description: string; quantity: string; unit: string | null; unitPrice: string }[];
}

interface LineItem {
  partNumber?: string;
  soId?: string;
  id?: string;
  lineNumber: number;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  subtotal: number;
  notes: string;
}

interface BillFormProps {
  billId?: string;
  companyId: string;
}

const STATUS_OPTIONS = ["draft", "received", "partial_paid", "paid", "overdue", "cancelled"];

export function BillForm({ billId, companyId }: BillFormProps) {
  const router = useRouter();
  const { status } = useSession();
  const [loading, setLoading] = useState(!!billId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderOption[]>([]);
  const [billNumber, setBillNumber] = useState("");
  const [sourcePoNumber, setSourcePoNumber] = useState("");
  const [poId, setPoId] = useState("");
  const [soId, setSoId] = useState("");
  const [salesOrders, setSalesOrders] = useState<{ id: string; soNumber: string; customer: { name: string } }[]>([]);
  const [paidAmount, setPaidAmount] = useState(0); // cash paid + PPh withheld, as stored
  const [pph, setPph] = useState(0);
  const [origPph, setOrigPph] = useState(0);
  const [proofNo, setProofNo] = useState("");
  const [proofDate, setProofDate] = useState("");
  const [remittedAt, setRemittedAt] = useState("");
  const [items, setItems] = useState<LineItem[]>([
    { lineNumber: 1, description: "", quantity: 0, unit: "pcs", unitPrice: 0, subtotal: 0, notes: "" },
  ]);

  const [formData, setFormData] = useState(() => {
    const today = new Date();
    const due = new Date(today);
    due.setDate(today.getDate() + 30);

    return {
      supplierId: "",
      billDate: today.toISOString().split("T")[0],
      dueDate: due.toISOString().split("T")[0],
      paymentTerms: "",
      ppnPercent: 11,
      docStatus: "received",
      vendorInvoiceNumber: "",
      notes: "",
    };
  });

  useEffect(() => {
    if (status === "authenticated") {
      fetchSuppliers();
      fetchPurchaseOrders();
      fetchSalesOrders();
      if (billId) {
        fetchBill();
      } else {
        setLoading(false);
      }
    }
  }, [status]);

  const fetchSuppliers = async () => {
    try {
      const res = await fetch("/api/suppliers");
      if (res.ok) setSuppliers(await res.json());
    } catch (err) {
      console.error("Error fetching suppliers:", err);
    }
  };

  const fetchSalesOrders = async () => {
    try {
      const res = await fetch("/api/sales-orders");
      if (res.ok) setSalesOrders(await res.json());
    } catch (err) {
      console.error("Error fetching sales orders:", err);
    }
  };

  const fetchPurchaseOrders = async () => {
    try {
      const res = await fetch("/api/purchase-orders");
      if (res.ok) setPurchaseOrders(await res.json());
    } catch (err) {
      console.error("Error fetching purchase orders:", err);
    }
  };

  const fetchBill = async () => {
    try {
      const res = await fetch(`/api/bills/${billId}`);
      if (res.ok) {
        const data = await res.json();
        setBillNumber(data.billNumber);
        setSourcePoNumber(data.purchaseOrder?.poNumber || "");
        setSoId(data.soId || "");
        setPaidAmount(Number(data.paidAmount || 0));
        setPph(Number(data.pphAmount || 0));
        setOrigPph(Number(data.pphAmount || 0));
        setProofNo(data.pphProofNumber || "");
        setProofDate(data.pphProofDate ? data.pphProofDate.split("T")[0] : "");
        setRemittedAt(data.pphRemittedAt ? data.pphRemittedAt.split("T")[0] : "");
        setFormData({
          supplierId: data.supplierId,
          billDate: data.billDate.split("T")[0],
          dueDate: data.dueDate ? data.dueDate.split("T")[0] : "",
          paymentTerms: data.paymentTerms || "",
          ppnPercent: Number(data.ppnPercent ?? 11),
          docStatus: data.status || "draft",
          vendorInvoiceNumber: data.vendorInvoiceNumber || "",
          notes: data.notes || "",
        });
        if (data.items?.length > 0) {
          setItems(
            data.items.map((item: any) => ({
              id: item.id,
              lineNumber: item.lineNumber,
              partNumber: item.partNumber || "",
              soId: item.soId || "",
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
      console.error("Error fetching bill:", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePoPick = (id: string) => {
    setPoId(id);
    const po = purchaseOrders.find((p) => p.id === id);
    if (po) {
      setFormData((prev) => ({ ...prev, supplierId: po.supplierId }));
      setItems(
        po.items.map((item, index) => ({
          lineNumber: index + 1,
          description: item.description,
          quantity: Number(item.quantity),
          unit: item.unit || "pcs",
          unitPrice: Number(item.unitPrice),
          subtotal: Number(item.quantity) * Number(item.unitPrice),
          notes: "",
        }))
      );
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
    setItems([
      ...items,
      { lineNumber: newLineNumber, description: "", quantity: 0, unit: "pcs", unitPrice: 0, subtotal: 0, notes: "" },
    ]);
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
      if (!formData.supplierId) throw new Error("Vendor is required");
      if (!items.length || !items[0].description) {
        throw new Error("At least one line item is required");
      }

      const url = billId ? `/api/bills/${billId}` : "/api/bills";
      const method = billId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          supplierId: formData.supplierId,
          poId: poId || null,
          soId: soId || null,
          vendorInvoiceNumber: formData.vendorInvoiceNumber,
          pphAmount: pph,
          pphProofNumber: proofNo,
          pphProofDate: proofDate || null,
          pphRemittedAt: remittedAt || null,
          billDate: formData.billDate,
          dueDate: formData.dueDate,
          paymentTerms: formData.paymentTerms,
          ppnPercent: formData.ppnPercent,
          status: formData.docStatus,
          notes: formData.notes,
          items: items.map((item) => ({
            partNumber: item.partNumber || null,
            soId: item.soId || null,
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
        throw new Error(data.error || "Failed to save bill");
      }

      router.push("/supply-chain/bills");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving bill");
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
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6"
      >
        <ArrowLeft size={18} />
        Back to Bills
      </button>

      <Card className="border-rose-200">
        <CardHeader className="bg-rose-50 border-b border-rose-100">
          <CardTitle className="flex items-center gap-2 text-rose-900">
            <Receipt size={20} />
            {billId ? `Edit Bill ${billNumber}` : "Record New Vendor Bill"}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">{error}</div>
            )}

            {sourcePoNumber && (
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 text-rose-800 text-sm">
                Billed against Purchase Order {sourcePoNumber}
              </div>
            )}

            <div className="space-y-4 bg-slate-50 p-4 rounded-lg">
              <h3 className="font-semibold text-slate-900">Bill Information</h3>

              <div className="grid grid-cols-3 gap-4">
                {!billId && (
                  <div className="space-y-2">
                    <Label htmlFor="poPick">From Purchase Order (optional)</Label>
                    <select
                      id="poPick"
                      value={poId}
                      onChange={(e) => handlePoPick(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white"
                    >
                      <option value="">No PO — manual entry</option>
                      {purchaseOrders.map((po) => (
                        <option key={po.id} value={po.id}>
                          {po.poNumber}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-400">Copies the PO's vendor and items into this bill.</p>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="supplierId">Vendor *</Label>
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
                  <Label htmlFor="billDate">Bill Date *</Label>
                  <Input id="billDate" name="billDate" type="date" value={formData.billDate} onChange={handleChange} required />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="vendorInvoiceNumber">No. Invoice Vendor</Label>
                  <Input
                    id="vendorInvoiceNumber"
                    name="vendorInvoiceNumber"
                    placeholder="Nomor invoice dari vendor"
                    value={formData.vendorInvoiceNumber}
                    onChange={handleChange}
                  />
                  <p className="text-xs text-slate-400">Dipakai untuk mencegah input ganda.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="soPick">Untuk Sales Order (opsional)</Label>
                  <select
                    id="soPick"
                    value={soId}
                    onChange={(e) => setSoId(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white"
                  >
                    <option value="">Tidak terkait penjualan</option>
                    {salesOrders.map((so) => (
                      <option key={so.id} value={so.id}>
                        {so.soNumber} — {so.customer.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-400">Biaya bill ini masuk ke margin Sales Order tersebut (jika bill tidak lewat PO).</p>
                </div>
                {!billId && (
                  <div className="space-y-2">
                    <Label htmlFor="docStatus">Status</Label>
                    <select
                      id="docStatus"
                      name="docStatus"
                      value={formData.docStatus}
                      onChange={handleChange}
                      className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white"
                    >
                      <option value="received">Received (masuk jurnal)</option>
                      <option value="draft">Draft (belum masuk jurnal)</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dueDate">Due Date</Label>
                  <Input id="dueDate" name="dueDate" type="date" value={formData.dueDate} onChange={handleChange} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="paymentTerms">Payment Terms</Label>
                  <Input id="paymentTerms" name="paymentTerms" placeholder="e.g., Net 30" value={formData.paymentTerms} onChange={handleChange} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ppnPercent">PPN (%)</Label>
                  <Input id="ppnPercent" name="ppnPercent" type="number" min="0" step="0.01" value={formData.ppnPercent} onChange={handleChange} />
                </div>
              </div>

              {billId && (
                <div className="grid grid-cols-3 gap-4">
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
                  {paidAmount - origPph > 0 && (
                    <div className="space-y-2">
                      <Label>Paid Amount (from payments)</Label>
                      <Input value={formatPrice(paidAmount - origPph)} disabled />
                    </div>
                  )}
                </div>
              )}

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
                <h3 className="font-semibold text-slate-900">Bill Items</h3>
                <Button type="button" variant="outline" size="sm" onClick={addItem} className="gap-2">
                  <Plus size={16} />
                  Add Item
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="text-left p-2 w-32">Part No.</th>
                      <th className="text-left p-2">Description</th>
                      <th className="text-right p-2 w-24">Qty</th>
                      <th className="text-center p-2 w-20">Unit</th>
                      <th className="text-right p-2 w-32">Unit Price</th>
                      <th className="text-right p-2 w-32">Subtotal</th>
                      <th className="text-left p-2 w-40">Untuk SO</th>
                      <th className="text-left p-2 w-28">Notes</th>
                      <th className="text-center p-2 w-12">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => (
                      <tr key={index} className="border-b border-slate-200">
                        <td className="p-2">
                          <Input value={item.partNumber || ""} onChange={(e) => handleItemChange(index, "partNumber", e.target.value)} placeholder="-" className="border-0" />
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
                        <td className="p-2">
                          <select
                            value={item.soId || ""}
                            onChange={(e) => handleItemChange(index, "soId", e.target.value)}
                            className="w-full h-9 px-2 rounded border-0 bg-transparent text-sm"
                          >
                            <option value="">{soId ? "Sama dengan bill" : "-"}</option>
                            {salesOrders.map((so) => (
                              <option key={so.id} value={so.id}>{so.soNumber}</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2">
                          <Input value={item.notes} onChange={(e) => handleItemChange(index, "notes", e.target.value)} placeholder="-" className="border-0" />
                        </td>
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
                  <Label htmlFor="pph">PPh 23 yang kita potong dari vendor (Rp)</Label>
                  <Input id="pph" type="number" min="0" step="0.01" value={pph} onChange={(e) => setPph(Math.max(parseFloat(e.target.value) || 0, 0))} className="w-48" />
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setPph(Math.round(subtotal * 0.02 * 100) / 100)}>
                  Isi 2% dari subtotal
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setPph(0)}>Tanpa PPh</Button>
              </div>
              {pph > 0 && (
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="proofNo">No. bukti potong yang kita terbitkan</Label>
                    <Input id="proofNo" value={proofNo} onChange={(e) => setProofNo(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="proofDate">Tanggal bukti potong</Label>
                    <Input id="proofDate" type="date" value={proofDate} onChange={(e) => setProofDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="remittedAt">Tanggal disetor ke kas negara</Label>
                    <Input id="remittedAt" type="date" value={remittedAt} onChange={(e) => setRemittedAt(e.target.value)} />
                  </div>
                </div>
              )}
              <p className="text-xs text-slate-400">Vendor hanya dibayar sisanya. PPh yang dipotong menjadi utang pajak sampai disetor (paling lambat tanggal 10 bulan berikutnya).</p>
            </div>

            <div className="flex justify-end">
              <div className="w-80 space-y-2 bg-rose-50 p-4 rounded-lg">
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
                  <span className="font-bold text-lg text-rose-700">{formatPrice(balanceDue)}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 border-t pt-6">
              <Button type="button" variant="outline" onClick={() => router.push("/supply-chain/bills")}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : billId ? "Update Bill" : "Create Bill"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      {billId && <Attachments referenceType="Bill" referenceId={billId} />}
    </div>
  );
}
