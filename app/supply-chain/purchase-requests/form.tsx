"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Plus, Trash2, ClipboardList } from "lucide-react";

interface Project {
  id: string;
  projectName: string;
}

interface LineItem {
  id?: string;
  lineNumber: number;
  description: string;
  quantity: number;
  unit: string;
  estimatedPrice: number;
  notes: string;
}

interface PurchaseRequestFormProps {
  prId?: string;
  companyId: string;
}

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "pending_approval", label: "Pending Approval" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

export function PurchaseRequestForm({ prId, companyId }: PurchaseRequestFormProps) {
  const router = useRouter();
  const { status } = useSession();
  const [loading, setLoading] = useState(!!prId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [requestNumber, setRequestNumber] = useState("");
  const [convertedToPo, setConvertedToPo] = useState(false);
  const [items, setItems] = useState<LineItem[]>([
    { lineNumber: 1, description: "", quantity: 0, unit: "pcs", estimatedPrice: 0, notes: "" },
  ]);

  const [formData, setFormData] = useState({
    projectId: "",
    requestDate: new Date().toISOString().split("T")[0],
    requiredDate: "",
    requestedBy: "",
    department: "",
    status: "draft",
    notes: "",
  });

  useEffect(() => {
    if (status === "authenticated") {
      fetchProjects();
      if (prId) {
        fetchPurchaseRequest();
      } else {
        setLoading(false);
      }
    }
  }, [status]);

  const fetchProjects = async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (err) {
      console.error("Error fetching projects:", err);
    }
  };

  const fetchPurchaseRequest = async () => {
    try {
      const res = await fetch(`/api/purchase-requests/${prId}`);
      if (res.ok) {
        const data = await res.json();
        setRequestNumber(data.requestNumber);
        setConvertedToPo(data.status === "converted_to_po");
        setFormData({
          projectId: data.projectId || "",
          requestDate: data.requestDate.split("T")[0],
          requiredDate: data.requiredDate ? data.requiredDate.split("T")[0] : "",
          requestedBy: data.requestedBy || "",
          department: data.department || "",
          status: data.status,
          notes: data.notes || "",
        });
        if (data.items?.length > 0) {
          setItems(
            data.items.map((item: any) => ({
              id: item.id,
              lineNumber: item.lineNumber,
              description: item.description,
              quantity: Number(item.quantity),
              unit: item.unit || "pcs",
              estimatedPrice: Number(item.estimatedPrice),
              notes: item.notes || "",
            }))
          );
        }
      }
    } catch (err) {
      console.error("Error fetching purchase request:", err);
    } finally {
      setLoading(false);
    }
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
    setItems([
      ...items,
      { lineNumber: newLineNumber, description: "", quantity: 0, unit: "pcs", estimatedPrice: 0, notes: "" },
    ]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const estimatedTotal = items.reduce((sum, item) => sum + item.quantity * item.estimatedPrice, 0);
  const formatPrice = (price: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(price);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (!items.length || !items[0].description) {
        throw new Error("At least one line item is required");
      }

      const url = prId ? `/api/purchase-requests/${prId}` : "/api/purchase-requests";
      const method = prId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          ...formData,
          projectId: formData.projectId || null,
          items: items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            estimatedPrice: item.estimatedPrice,
            notes: item.notes,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save purchase request");
      }

      router.push("/supply-chain/purchase-requests");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving purchase request");
    } finally {
      setSubmitting(false);
    }
  };

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
        Back to Purchase Requests
      </button>

      <Card className="border-purple-200">
        <CardHeader className="bg-purple-50 border-b border-purple-100">
          <CardTitle className="flex items-center gap-2 text-purple-900">
            <ClipboardList size={20} />
            {prId ? `Edit Purchase Request ${requestNumber}` : "Create New Purchase Request"}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">
                {error}
              </div>
            )}

            {convertedToPo && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 text-purple-800 text-sm">
                This request has already been converted to a Purchase Order.
              </div>
            )}

            <div className="space-y-4 bg-slate-50 p-4 rounded-lg">
              <h3 className="font-semibold text-slate-900">Request Information</h3>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="department">Department / Requester</Label>
                  <Input
                    id="department"
                    name="department"
                    placeholder="e.g., Workshop, Operational"
                    value={formData.department}
                    onChange={handleChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="requestedBy">Requested By</Label>
                  <Input
                    id="requestedBy"
                    name="requestedBy"
                    placeholder="Name of requester"
                    value={formData.requestedBy}
                    onChange={handleChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="projectId">Project</Label>
                  <select
                    id="projectId"
                    name="projectId"
                    value={formData.projectId}
                    onChange={handleChange}
                    className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white"
                  >
                    <option value="">No project</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.projectName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
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
                  <Label htmlFor="requiredDate">Required Date</Label>
                  <Input
                    id="requiredDate"
                    name="requiredDate"
                    type="date"
                    value={formData.requiredDate}
                    onChange={handleChange}
                  />
                </div>
                {prId && (
                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <select
                      id="status"
                      name="status"
                      value={formData.status}
                      onChange={handleChange}
                      disabled={convertedToPo}
                      className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white disabled:bg-slate-100"
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
                <Label htmlFor="notes">Notes / Justification</Label>
                <textarea
                  id="notes"
                  name="notes"
                  placeholder="Reason for the request"
                  value={formData.notes}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                  rows={3}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-900">Requested Items</h3>
                <Button type="button" variant="outline" size="sm" onClick={addItem} className="gap-2">
                  <Plus size={16} />
                  Add Item
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="text-left p-2">Description</th>
                      <th className="text-right p-2 w-24">Qty</th>
                      <th className="text-center p-2 w-20">Unit</th>
                      <th className="text-right p-2 w-32">Est. Price</th>
                      <th className="text-right p-2 w-32">Est. Subtotal</th>
                      <th className="text-left p-2 w-28">Notes</th>
                      <th className="text-center p-2 w-12">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => (
                      <tr key={index} className="border-b border-slate-200">
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
                            value={item.estimatedPrice}
                            onChange={(e) => handleItemChange(index, "estimatedPrice", parseFloat(e.target.value) || 0)}
                            className="border-0 text-right"
                            min="0"
                            step="0.01"
                          />
                        </td>
                        <td className="p-2 text-right font-semibold">
                          {formatPrice(item.quantity * item.estimatedPrice)}
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
              <div className="w-80 space-y-2 bg-purple-50 p-4 rounded-lg">
                <div className="flex justify-between">
                  <span className="font-bold">Estimated Total:</span>
                  <span className="font-bold text-lg text-purple-700">{formatPrice(estimatedTotal)}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 border-t pt-6">
              <Button type="button" variant="outline" onClick={() => router.push("/supply-chain/purchase-requests")}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || convertedToPo}>
                {submitting ? "Saving..." : prId ? "Update Request" : "Create Request"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
