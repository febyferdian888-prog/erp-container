"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Plus, Trash2, Truck, Download } from "lucide-react";
import { Attachments } from "@/components/attachments";
import { ApprovalPanel } from "@/components/approval-panel";

interface Supplier {
  id: string;
  code: string;
  name: string;
}

interface PurchaseRequestOption {
  id: string;
  requestNumber: string;
  status: string;
  items: { description: string; quantity: string; unit: string | null; estimatedPrice: string }[];
}

interface SalesOrderOption {
  id: string;
  soNumber: string;
  poNumber: string;
  customer: { name: string };
  items: { description: string; quantity: string; unit: string | null }[];
}

interface LineItem {
  id?: string;
  lineNumber: number;
  productId: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  subtotal: number;
  notes: string;
}

interface ProductOption {
  id: string;
  sku: string;
  name: string;
  standardPrice: number;
  unit: { code: string };
}

interface PurchaseOrderFormProps {
  poId?: string;
  companyId: string;
}

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent to Vendor" },
  { value: "confirmed", label: "Confirmed by Vendor" },
  { value: "partial_received", label: "Partially Received" },
  { value: "received", label: "Fully Received" },
  { value: "invoiced", label: "Invoiced" },
  { value: "cancelled", label: "Cancelled" },
];

export function PurchaseOrderForm({ poId, companyId }: PurchaseOrderFormProps) {
  const router = useRouter();
  const { status } = useSession();
  const [loading, setLoading] = useState(!!poId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [approvedRequests, setApprovedRequests] = useState<PurchaseRequestOption[]>([]);
  const [salesOrders, setSalesOrders] = useState<SalesOrderOption[]>([]);
  const [poNumber, setPoNumber] = useState("");
  const [sourcePrNumber, setSourcePrNumber] = useState("");
  const [sourceSoNumber, setSourceSoNumber] = useState("");
  const [prId, setPrId] = useState("");
  const [soId, setSoId] = useState("");
  const [items, setItems] = useState<LineItem[]>([
    { lineNumber: 1, productId: "", description: "", quantity: 0, unit: "pcs", unitPrice: 0, subtotal: 0, notes: "" },
  ]);

  const [formData, setFormData] = useState({
    supplierId: "",
    poDate: new Date().toISOString().split("T")[0],
    deliveryDate: "",
    paymentTerms: "",
    status: "draft",
    notes: "",
  });

  useEffect(() => {
    if (status === "authenticated") {
      fetchSuppliers();
      fetchProducts();
      fetchApprovedRequests();
      fetchSalesOrders();
      if (poId) {
        fetchPurchaseOrder();
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

  const fetchProducts = async () => {
    try {
      const res = await fetch("/api/products");
      if (res.ok) {
        const data = await res.json();
        setProducts(
          data.map((p: any) => ({
            id: p.id,
            sku: p.sku,
            name: p.name,
            standardPrice: Number(p.standardPrice),
            unit: p.unit,
          }))
        );
      }
    } catch (err) {
      console.error("Error fetching products:", err);
    }
  };

  const fetchApprovedRequests = async () => {
    try {
      const res = await fetch("/api/purchase-requests");
      if (res.ok) {
        const data = await res.json();
        setApprovedRequests(data.filter((r: any) => r.status === "approved"));
      }
    } catch (err) {
      console.error("Error fetching purchase requests:", err);
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

  const fetchPurchaseOrder = async () => {
    try {
      const res = await fetch(`/api/purchase-orders/${poId}`);
      if (res.ok) {
        const data = await res.json();
        setPoNumber(data.poNumber);
        setSourcePrNumber(data.purchaseRequest?.requestNumber || "");
        setSourceSoNumber(data.salesOrder?.soNumber || "");
        setSoId(data.soId || "");
        setFormData({
          supplierId: data.supplierId,
          poDate: data.poDate.split("T")[0],
          deliveryDate: data.deliveryDate ? data.deliveryDate.split("T")[0] : "",
          paymentTerms: data.paymentTerms || "",
          status: data.status,
          notes: data.notes || "",
        });
        if (data.items?.length > 0) {
          setItems(
            data.items.map((item: any) => ({
              id: item.id,
              lineNumber: item.lineNumber,
              productId: item.productId || "",
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
      console.error("Error fetching purchase order:", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePrPick = (id: string) => {
    setPrId(id);
    const pr = approvedRequests.find((r) => r.id === id);
    if (pr) {
      setItems(
        pr.items.map((item: any, index) => ({
          lineNumber: index + 1,
          productId: item.productId || "",
          description: item.description,
          quantity: Number(item.quantity),
          unit: item.unit || "pcs",
          unitPrice: Number(item.estimatedPrice),
          subtotal: Number(item.quantity) * Number(item.estimatedPrice),
          notes: "",
        }))
      );
    }
  };

  const handleSoPick = (id: string) => {
    setSoId(id);
    const so = salesOrders.find((s) => s.id === id);
    if (so) {
      setItems(
        so.items.map((item: any, index) => ({
          lineNumber: index + 1,
          productId: "",
          description: item.description,
          quantity: Number(item.quantity),
          unit: item.unit || "pcs",
          unitPrice: 0,
          subtotal: 0,
          notes: "",
        }))
      );
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    if (field === "productId") {
      const product = products.find((p) => p.id === value);
      if (product) {
        newItems[index].description = product.name;
        newItems[index].unit = product.unit.code;
        newItems[index].unitPrice = product.standardPrice;
      }
    }
    if (field === "quantity" || field === "unitPrice" || field === "productId") {
      newItems[index].subtotal = newItems[index].quantity * newItems[index].unitPrice;
    }
    setItems(newItems);
  };

  const addItem = () => {
    const newLineNumber = Math.max(...items.map((i) => i.lineNumber), 0) + 1;
    setItems([
      ...items,
      { lineNumber: newLineNumber, productId: "", description: "", quantity: 0, unit: "pcs", unitPrice: 0, subtotal: 0, notes: "" },
    ]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const total = items.reduce((sum, item) => sum + item.subtotal, 0);
  const formatPrice = (price: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(price);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (!formData.supplierId) throw new Error("Vendor is required");
      if (!items.length || !items[0].description) {
        throw new Error("At least one line item is required");
      }

      const url = poId ? `/api/purchase-orders/${poId}` : "/api/purchase-orders";
      const method = poId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          ...formData,
          prId: prId || null,
          soId: soId || null,
          items: items.map((item) => ({
            productId: item.productId || null,
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
        throw new Error(data.error || "Failed to save purchase order");
      }

      router.push("/supply-chain/purchase-orders");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving purchase order");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="max-w-5xl">
      {poId && <ApprovalPanel referenceType="PurchaseOrder" referenceId={poId} />}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft size={18} />
          Back to Purchase Orders
        </button>
        {poId && (
          <a href={`/api/purchase-orders/${poId}/pdf`} target="_blank" rel="noopener noreferrer">
            <Button type="button" variant="outline" className="gap-2">
              <Download size={16} />
              Download PDF
            </Button>
          </a>
        )}
      </div>

      <Card className="border-orange-200">
        <CardHeader className="bg-orange-50 border-b border-orange-100">
          <CardTitle className="flex items-center gap-2 text-orange-900">
            <Truck size={20} />
            {poId ? `Edit Purchase Order ${poNumber}` : "Create New Purchase Order"}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">{error}</div>
            )}

            {sourcePrNumber && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 text-orange-800 text-sm">
                Created from Purchase Request {sourcePrNumber}
              </div>
            )}

            {sourceSoNumber && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 text-orange-800 text-sm">
                Procuring for Sales Order {sourceSoNumber}
              </div>
            )}

            <div className="space-y-4 bg-slate-50 p-4 rounded-lg">
              <h3 className="font-semibold text-slate-900">Order Information</h3>

              <div className="grid grid-cols-3 gap-4">
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

                {!poId && (
                  <div className="space-y-2">
                    <Label htmlFor="prPick">From Purchase Request (optional)</Label>
                    <select
                      id="prPick"
                      value={prId}
                      onChange={(e) => handlePrPick(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white"
                    >
                      <option value="">No request — manual entry</option>
                      {approvedRequests.map((pr) => (
                        <option key={pr.id} value={pr.id}>
                          {pr.requestNumber}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-400">Copies the approved request's items into this order.</p>
                  </div>
                )}

                {!poId && (
                  <div className="space-y-2">
                    <Label htmlFor="soPick">For Sales Order (optional)</Label>
                    <select
                      id="soPick"
                      value={soId}
                      onChange={(e) => handleSoPick(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white"
                    >
                      <option value="">No order — not tied to a sale</option>
                      {salesOrders.map((so) => (
                        <option key={so.id} value={so.id}>
                          {so.soNumber} — {so.customer.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-400">
                      Ties this vendor order to the customer order it's fulfilling. Create several POs against the same Sales Order to split procurement across vendors.
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="poDate">PO Date *</Label>
                  <Input id="poDate" name="poDate" type="date" value={formData.poDate} onChange={handleChange} required />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="deliveryDate">Expected Delivery</Label>
                  <Input id="deliveryDate" name="deliveryDate" type="date" value={formData.deliveryDate} onChange={handleChange} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="paymentTerms">Payment Terms</Label>
                  <Input
                    id="paymentTerms"
                    name="paymentTerms"
                    placeholder="e.g., Net 30, COD"
                    value={formData.paymentTerms}
                    onChange={handleChange}
                  />
                </div>
                {poId && (
                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <select
                      id="status"
                      name="status"
                      value={formData.status}
                      onChange={handleChange}
                      className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white"
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes / Special Instructions</Label>
                <textarea
                  id="notes"
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                  rows={3}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-900">Order Items</h3>
                <Button type="button" variant="outline" size="sm" onClick={addItem} className="gap-2">
                  <Plus size={16} />
                  Add Item
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="text-left p-2 w-44">Sparepart (optional)</th>
                      <th className="text-left p-2">Description</th>
                      <th className="text-right p-2 w-24">Qty</th>
                      <th className="text-center p-2 w-20">Unit</th>
                      <th className="text-right p-2 w-32">Unit Price</th>
                      <th className="text-right p-2 w-32">Subtotal</th>
                      <th className="text-left p-2 w-28">Notes</th>
                      <th className="text-center p-2 w-12">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => (
                      <tr key={index} className="border-b border-slate-200">
                        <td className="p-2">
                          <select
                            value={item.productId}
                            onChange={(e) => handleItemChange(index, "productId", e.target.value)}
                            className="w-full h-9 px-2 rounded border-0 bg-transparent text-sm"
                          >
                            <option value="">Manual entry</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.sku}
                              </option>
                            ))}
                          </select>
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
                            onChange={(e) => handleItemChange(index, "quantity", parseFloat(e.target.value) || 0)}
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
                            onChange={(e) => handleItemChange(index, "unitPrice", parseFloat(e.target.value) || 0)}
                            className="border-0 text-right"
                            min="0"
                            step="0.01"
                          />
                        </td>
                        <td className="p-2 text-right font-semibold">{formatPrice(item.subtotal)}</td>
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
              <div className="w-80 space-y-2 bg-orange-50 p-4 rounded-lg">
                <div className="flex justify-between">
                  <span className="font-bold">Total:</span>
                  <span className="font-bold text-lg text-orange-700">{formatPrice(total)}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 border-t pt-6">
              <Button type="button" variant="outline" onClick={() => router.push("/supply-chain/purchase-orders")}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : poId ? "Update Order" : "Create Order"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      {poId && <Attachments referenceType="PurchaseOrder" referenceId={poId} />}
    </div>
  );
}
