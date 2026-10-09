"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Plus, Trash2, Truck, Download } from "lucide-react";
import { Attachments } from "@/components/attachments";

interface CustomerOption {
  id: string;
  code: string;
  name: string;
}

interface WarehouseOption {
  id: string;
  code: string;
  name: string;
}

interface SalesOrderOption {
  id: string;
  soNumber: string;
  poNumber: string;
  customerId: string;
  customer: { name: string };
  items: { partNumber: string | null; description: string; quantity: string; unit: string | null }[];
}

interface LineItem {
  lineNumber: number;
  partNumber: string;
  description: string;
  quantity: number;
  unit: string;
  notes: string;
}

interface DeliveryFormProps {
  deliveryId?: string;
  companyId: string;
}

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "in_transit", label: "In Transit" },
  { value: "delivered", label: "Delivered" },
  { value: "accepted", label: "Accepted" },
  { value: "cancelled", label: "Cancelled" },
];

export function DeliveryForm({ deliveryId, companyId }: DeliveryFormProps) {
  const router = useRouter();
  const { status } = useSession();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(!!deliveryId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [salesOrders, setSalesOrders] = useState<SalesOrderOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [soId, setSoId] = useState("");
  const [deliveryNumber, setDeliveryNumber] = useState("");
  const [sourceSoNumber, setSourceSoNumber] = useState("");
  const [items, setItems] = useState<LineItem[]>([
    { lineNumber: 1, partNumber: "", description: "", quantity: 0, unit: "pcs", notes: "" },
  ]);

  const [formData, setFormData] = useState({
    customerId: "",
    deliveryDate: new Date().toISOString().split("T")[0],
    vehicleNumber: "",
    driverName: "",
    shippingAddress: "",
    shipmentByName: "",
    acknowledgedByName: "",
    receivedByName: "",
    docStatus: "draft",
    notes: "",
  });

  useEffect(() => {
    if (status === "authenticated") {
      fetchCustomers();
      fetchSalesOrders();
      fetchWarehouses();
      if (deliveryId) {
        fetchDelivery();
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

  const fetchWarehouses = async () => {
    try {
      const res = await fetch("/api/warehouses");
      if (res.ok) setWarehouses(await res.json());
    } catch (err) {
      console.error("Error fetching warehouses:", err);
    }
  };

  const fetchSalesOrders = async () => {
    try {
      const res = await fetch("/api/sales-orders");
      if (res.ok) {
        const data = await res.json();
        setSalesOrders(data);
        const preselect = searchParams.get("soId");
        if (preselect && !deliveryId) {
          const so = data.find((x: SalesOrderOption) => x.id === preselect);
          if (so) applySo(so);
        }
      }
    } catch (err) {
      console.error("Error fetching sales orders:", err);
    }
  };

  const fetchDelivery = async () => {
    try {
      const res = await fetch(`/api/deliveries/${deliveryId}`);
      if (res.ok) {
        const data = await res.json();
        setDeliveryNumber(data.deliveryNumber);
        setSourceSoNumber(data.salesOrder?.soNumber || "");
        setWarehouseId(data.warehouseId || "");
        setSoId(data.soId || "");
        setFormData({
          customerId: data.customerId,
          deliveryDate: data.deliveryDate.split("T")[0],
          vehicleNumber: data.vehicleNumber || "",
          driverName: data.driverName || "",
          shippingAddress: data.shippingAddress || "",
          shipmentByName: data.shipmentByName || "",
          acknowledgedByName: data.acknowledgedByName || "",
          receivedByName: data.receivedByName || "",
          docStatus: data.status,
          notes: data.notes || "",
        });
        if (data.items?.length > 0) {
          setItems(
            data.items.map((item: any) => ({
              lineNumber: item.lineNumber,
              partNumber: item.partNumber || "",
              description: item.description,
              quantity: Number(item.quantity),
              unit: item.unit || "pcs",
              notes: item.notes || "",
            }))
          );
        }
      }
    } catch (err) {
      console.error("Error fetching delivery:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSoPick = (id: string) => {
    const so = salesOrders.find((s) => s.id === id);
    if (so) {
      applySo(so);
    } else {
      setSoId("");
      setItems([{ lineNumber: 1, partNumber: "", description: "", quantity: 0, unit: "pcs", notes: "" }]);
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
        notes: "",
      }))
    );
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const addItem = () => {
    const newLineNumber = Math.max(...items.map((i) => i.lineNumber), 0) + 1;
    setItems([...items, { lineNumber: newLineNumber, partNumber: "", description: "", quantity: 0, unit: "pcs", notes: "" }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
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

      const url = deliveryId ? `/api/deliveries/${deliveryId}` : "/api/deliveries";
      const method = deliveryId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          customerId: formData.customerId,
          soId: soId || null,
          warehouseId: warehouseId || null,
          deliveryDate: formData.deliveryDate,
          vehicleNumber: formData.vehicleNumber,
          driverName: formData.driverName,
          shippingAddress: formData.shippingAddress,
          shipmentByName: formData.shipmentByName,
          acknowledgedByName: formData.acknowledgedByName,
          receivedByName: formData.receivedByName,
          status: formData.docStatus,
          notes: formData.notes,
          items: items.map((item, index) => ({
            lineNumber: index + 1,
            partNumber: item.partNumber || null,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            notes: item.notes,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save delivery");
      }

      router.push("/sales/delivery");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving delivery");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft size={18} />
          Back to Deliveries
        </button>
        {deliveryId && (
          <a href={`/api/deliveries/${deliveryId}/pdf`} target="_blank" rel="noopener noreferrer">
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
            <Truck size={20} className="text-slate-600" />
            {deliveryId ? `Edit Delivery ${deliveryNumber}` : "Create New Delivery"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">{error}</div>
            )}

            {sourceSoNumber && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-slate-700 text-sm">
                From Sales Order {sourceSoNumber}
              </div>
            )}

            <div className="space-y-4 bg-slate-50 p-4 rounded-lg">
              <h3 className="font-semibold text-slate-900">Delivery Information</h3>

              <div className="grid grid-cols-3 gap-4">
                {!deliveryId && (
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
                    <p className="text-xs text-slate-400">Copies the order's customer and items into this delivery.</p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="customerId">Customer *</Label>
                  <select
                    id="customerId"
                    name="customerId"
                    value={formData.customerId}
                    onChange={handleChange}
                    required
                    disabled={!!soId}
                    className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white disabled:bg-slate-100"
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
                  <Label htmlFor="deliveryDate">Delivery Date *</Label>
                  <Input
                    id="deliveryDate"
                    name="deliveryDate"
                    type="date"
                    value={formData.deliveryDate}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="vehicleNumber">Vehicle Number</Label>
                  <Input
                    id="vehicleNumber"
                    name="vehicleNumber"
                    placeholder="e.g., B 1234 XYZ"
                    value={formData.vehicleNumber}
                    onChange={handleChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="driverName">Driver Name</Label>
                  <Input
                    id="driverName"
                    name="driverName"
                    value={formData.driverName}
                    onChange={handleChange}
                  />
                </div>
                {deliveryId && (
                  <div className="space-y-2">
                    <Label htmlFor="docStatus">Status</Label>
                    <select
                      id="docStatus"
                      name="docStatus"
                      value={formData.docStatus}
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

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="shipmentByName">Bagian Pengiriman (signatory)</Label>
                  <Input
                    id="shipmentByName"
                    name="shipmentByName"
                    value={formData.shipmentByName}
                    onChange={handleChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="acknowledgedByName">Mengetahui (signatory)</Label>
                  <Input
                    id="acknowledgedByName"
                    name="acknowledgedByName"
                    value={formData.acknowledgedByName}
                    onChange={handleChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="receivedByName">Nama Penerima (once confirmed)</Label>
                  <Input
                    id="receivedByName"
                    name="receivedByName"
                    placeholder="Leave blank until receipt is confirmed"
                    value={formData.receivedByName}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="warehouseId">Ship From Warehouse (optional)</Label>
                <select
                  id="warehouseId"
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white"
                >
                  <option value="">Don't update stock</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} — {w.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-400">
                  Items whose part number matches a sparepart SKU are deducted from this warehouse's stock.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="shippingAddress">Shipping Address</Label>
                <textarea
                  id="shippingAddress"
                  name="shippingAddress"
                  value={formData.shippingAddress}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                  rows={2}
                />
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
                <h3 className="font-semibold text-slate-900">Delivery Items</h3>
                <Button type="button" variant="outline" size="sm" onClick={addItem} className="gap-2">
                  <Plus size={16} />
                  Add Item
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="text-left p-2 w-36">Part Number</th>
                      <th className="text-left p-2">Description</th>
                      <th className="text-right p-2 w-24">Qty</th>
                      <th className="text-center p-2 w-20">Unit</th>
                      <th className="text-left p-2 w-28">Notes</th>
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
                            placeholder="-"
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

            <div className="flex gap-3 border-t pt-6">
              <Button type="button" variant="outline" onClick={() => router.push("/sales/delivery")}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : deliveryId ? "Update Delivery" : "Create Delivery"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      {deliveryId && <Attachments referenceType="Delivery" referenceId={deliveryId} />}
    </div>
  );
}
