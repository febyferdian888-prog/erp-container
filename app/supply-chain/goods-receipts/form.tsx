"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, PackageCheck } from "lucide-react";
import { Attachments } from "@/components/attachments";

interface PurchaseOrderOption {
  id: string;
  poNumber: string;
  status: string;
  supplier: { name: string };
}

interface PoItem {
  id: string;
  productId: string | null;
  description: string;
  quantity: string;
  unit: string | null;
  receivedQty: string;
}

interface WarehouseOption {
  id: string;
  code: string;
  name: string;
}

interface ReceiptRow {
  poItemId: string;
  productId: string | null;
  description: string;
  unit: string;
  ordered: number;
  alreadyReceived: number;
  quantity: number;
  condition: string;
  notes: string;
}

interface GoodsReceiptFormProps {
  grId?: string;
  companyId: string;
}

const QC_STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "received", label: "Received" },
  { value: "inspected", label: "Inspected" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
];

const CONDITION_OPTIONS = [
  { value: "good", label: "Good" },
  { value: "defect", label: "Defect" },
  { value: "partial", label: "Partial" },
];

export function GoodsReceiptForm({ grId, companyId }: GoodsReceiptFormProps) {
  const router = useRouter();
  const { status } = useSession();
  const [loading, setLoading] = useState(!!grId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [poId, setPoId] = useState("");
  const [rows, setRows] = useState<ReceiptRow[]>([]);
  const [receiptNumber, setReceiptNumber] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [receiptWarehouseName, setReceiptWarehouseName] = useState("");
  const [autoCreated, setAutoCreated] = useState(false);
  const [stockApplied, setStockApplied] = useState(true);
  const [editWarehouseId, setEditWarehouseId] = useState("");
  const [existingItems, setExistingItems] = useState<
    { id: string; description: string; unit: string; ordered: number; quantity: number; condition: string; notes: string }[] | null
  >(null);
  const [inspectedByName, setInspectedByName] = useState<string | null>(null);
  const [claim, setClaim] = useState<{ id: string; claimNumber: string; status: string; reason: string | null; resolutionNotes: string | null } | null>(null);
  const [claimBusy, setClaimBusy] = useState(false);

  const [formData, setFormData] = useState({
    receiptDate: new Date().toISOString().split("T")[0],
    qcStatus: "draft",
    notes: "",
  });

  useEffect(() => {
    if (status === "authenticated") {
      fetchPurchaseOrders();
      fetchWarehouses();
      if (grId) {
        fetchGoodsReceipt();
      } else {
        setLoading(false);
      }
    }
  }, [status]);

  const fetchPurchaseOrders = async () => {
    try {
      const [poRes, grRes] = await Promise.all([
        fetch("/api/purchase-orders"),
        fetch("/api/goods-receipts"),
      ]);
      if (poRes.ok) {
        const pos = await poRes.json();
        const grs = grRes.ok ? await grRes.json() : [];
        const poIdsWithPendingDraft = new Set(
          grs.filter((g: any) => g.autoCreated && !g.stockApplied).map((g: any) => g.purchaseOrder?.id ?? g.poId)
        );
        setPurchaseOrders(
          pos.filter(
            (po: any) =>
              ["sent", "confirmed", "partial_received"].includes(po.status) && !poIdsWithPendingDraft.has(po.id)
          )
        );
      }
    } catch (err) {
      console.error("Error fetching purchase orders:", err);
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

  const fetchGoodsReceipt = async () => {
    try {
      const res = await fetch(`/api/goods-receipts/${grId}`);
      if (res.ok) {
        const data = await res.json();
        setReceiptNumber(data.receiptNumber);
        setPoNumber(data.purchaseOrder?.poNumber || "");
        setReceiptWarehouseName(data.warehouse?.name || "");
        setInspectedByName(data.inspectedByName || null);
        setClaim(data.claims?.[0] || null);
        setAutoCreated(!!data.autoCreated);
        setStockApplied(data.stockApplied !== false);
        setEditWarehouseId(data.warehouseId || "");
        setFormData({
          receiptDate: data.receiptDate.split("T")[0],
          qcStatus: data.status,
          notes: data.notes || "",
        });
        setExistingItems(
          data.items.map((item: any) => {
            const poItem = data.purchaseOrder?.items?.find((pi: any) => pi.id === item.poItemId);
            return {
              id: item.id,
              description: poItem?.description || "Item",
              unit: item.unit || "-",
              ordered: poItem ? Number(poItem.quantity) : Number(item.quantity),
              quantity: Number(item.quantity),
              condition: item.condition,
              notes: item.notes || "",
            };
          })
        );
      }
    } catch (err) {
      console.error("Error fetching goods receipt:", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePoPick = async (id: string) => {
    setPoId(id);
    if (!id) {
      setRows([]);
      return;
    }
    try {
      const res = await fetch(`/api/purchase-orders/${id}`);
      if (res.ok) {
        const po = await res.json();
        setRows(
          po.items.map((item: PoItem) => ({
            poItemId: item.id,
            productId: item.productId || null,
            description: item.description,
            unit: item.unit || "pcs",
            ordered: Number(item.quantity),
            alreadyReceived: Number(item.receivedQty),
            quantity: Math.max(Number(item.quantity) - Number(item.receivedQty), 0),
            condition: "good",
            notes: "",
          }))
        );
      }
    } catch (err) {
      console.error("Error fetching PO detail:", err);
    }
  };

  const handleRowChange = (index: number, field: string, value: any) => {
    const newRows = [...rows];
    newRows[index] = { ...newRows[index], [field]: value };
    setRows(newRows);
  };

  const handleExistingItemChange = (index: number, field: string, value: any) => {
    setExistingItems((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (grId) {
        const editable = !stockApplied;
        if (editable && !existingItems?.some((it) => it.quantity > 0)) {
          throw new Error("Isi qty yang benar-benar diterima untuk minimal satu item");
        }
        const res = await fetch(`/api/goods-receipts/${grId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: formData.qcStatus,
            notes: formData.notes,
            ...(editable
              ? {
                  warehouseId: editWarehouseId || null,
                  items: existingItems?.map((it) => ({
                    id: it.id,
                    quantity: it.quantity,
                    condition: it.condition,
                    notes: it.notes,
                  })),
                }
              : {}),
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to update goods receipt");
        }
        router.push("/supply-chain/goods-receipts");
        return;
      }

      if (!poId) throw new Error("Select a purchase order first");
      const itemsToReceive = rows.filter((r) => r.quantity > 0);
      if (!itemsToReceive.length) throw new Error("Enter a quantity received for at least one item");

      const res = await fetch("/api/goods-receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          poId,
          warehouseId: warehouseId || null,
          receiptDate: formData.receiptDate,
          notes: formData.notes,
          items: itemsToReceive.map((r) => ({
            poItemId: r.poItemId,
            productId: r.productId,
            quantity: r.quantity,
            unit: r.unit,
            condition: r.condition,
            notes: r.notes,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save goods receipt");
      }

      router.push("/supply-chain/goods-receipts");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving goods receipt");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="max-w-4xl">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6"
      >
        <ArrowLeft size={18} />
        Back to Goods Receipts
      </button>

      <Card className="border-teal-200">
        <CardHeader className="bg-teal-50 border-b border-teal-100">
          <CardTitle className="flex items-center gap-2 text-teal-900">
            <PackageCheck size={20} />
            {grId ? `Goods Receipt ${receiptNumber}` : "Record New Goods Receipt"}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">{error}</div>
            )}

            {grId ? (
              <>
                <div className="bg-teal-50 border border-teal-200 rounded-lg p-4 text-teal-800 text-sm flex items-center justify-between">
                  <div>
                    Received against Purchase Order {poNumber}
                    {receiptWarehouseName && <> into <strong>{receiptWarehouseName}</strong></>}
                    {inspectedByName && <div className="mt-1 text-xs text-teal-700">Diperiksa oleh (QC): <strong>{inspectedByName}</strong></div>}
                  </div>
                  <a
                    href={`/api/goods-receipts/${grId}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 border border-teal-300 bg-white px-3 py-1.5 rounded text-sm font-medium text-teal-800 hover:bg-teal-50"
                  >
                    Cetak PDF
                  </a>
                </div>

                {autoCreated && !stockApplied && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-800 text-sm">
                    <p className="font-semibold">Dibuat otomatis saat PO dikirim ke vendor</p>
                    <p className="mt-1">
                      Qty di bawah masih sesuai pesanan. Cek qty yang benar-benar diterima, sesuaikan kalau beda
                      atau kurang, lalu ubah Inspection Status untuk konfirmasi — baru saat itu stok bertambah.
                    </p>
                  </div>
                )}

                {claim && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm">
                    <p className="font-semibold text-red-800">
                      Klaim Vendor {claim.claimNumber} — {claim.status.toUpperCase()}
                    </p>
                    <p className="text-red-700 mt-1">{claim.reason || "Item defect/partial ditemukan saat QC."}</p>
                    {claim.status === "open" && (
                      <div className="mt-3 flex gap-2">
                        <Button
                          type="button"
                          disabled={claimBusy}
                          onClick={async () => {
                            setClaimBusy(true);
                            try {
                              const res = await fetch(`/api/supplier-claims/${claim.id}`, {
                                method: "PUT",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ status: "resolved", resolutionNotes: "Diselesaikan oleh vendor." }),
                              });
                              if (res.ok) setClaim(await res.json());
                            } finally {
                              setClaimBusy(false);
                            }
                          }}
                        >
                          Tandai Selesai
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={claimBusy}
                          onClick={async () => {
                            setClaimBusy(true);
                            try {
                              const res = await fetch(`/api/supplier-claims/${claim.id}`, {
                                method: "PUT",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ status: "rejected", resolutionNotes: "Klaim ditolak/dibatalkan." }),
                              });
                              if (res.ok) setClaim(await res.json());
                            } finally {
                              setClaimBusy(false);
                            }
                          }}
                        >
                          Batalkan
                        </Button>
                      </div>
                    )}
                    {claim.status !== "open" && claim.resolutionNotes && (
                      <p className="text-xs text-red-600 mt-2">{claim.resolutionNotes}</p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="qcStatus">Inspection Status</Label>
                    <select
                      id="qcStatus"
                      name="qcStatus"
                      value={formData.qcStatus}
                      onChange={handleChange}
                      className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white"
                    >
                      {QC_STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="receiptDate">Receipt Date</Label>
                    <Input id="receiptDate" type="date" value={formData.receiptDate} disabled />
                  </div>
                </div>

                {!stockApplied && (
                  <div className="space-y-2">
                    <Label htmlFor="editWarehouseId">Receiving Warehouse</Label>
                    <select
                      id="editWarehouseId"
                      value={editWarehouseId}
                      onChange={(e) => setEditWarehouseId(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white"
                    >
                      <option value="">Don't update stock</option>
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.code} — {w.name}
                        </option>
                      ))}
                    </select>
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
                    rows={3}
                  />
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="text-left p-2">Item</th>
                        {!stockApplied && <th className="text-right p-2 w-20">Ordered</th>}
                        <th className="text-right p-2 w-24">Qty Received</th>
                        <th className="text-center p-2 w-20">Unit</th>
                        <th className="text-center p-2 w-24">Condition</th>
                        <th className="text-left p-2">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {existingItems?.map((item, index) =>
                        stockApplied ? (
                          <tr key={item.id} className="border-b border-slate-200">
                            <td className="p-2">{item.description}</td>
                            <td className="p-2 text-right">{item.quantity}</td>
                            <td className="p-2 text-center">{item.unit}</td>
                            <td className="p-2 text-center capitalize">{item.condition}</td>
                            <td className="p-2">{item.notes || "-"}</td>
                          </tr>
                        ) : (
                          <tr key={item.id} className="border-b border-slate-200">
                            <td className="p-2">{item.description}</td>
                            <td className="p-2 text-right text-slate-500">{item.ordered}</td>
                            <td className="p-2">
                              <Input
                                type="number"
                                value={item.quantity}
                                onChange={(e) => handleExistingItemChange(index, "quantity", parseFloat(e.target.value) || 0)}
                                className="border-0 text-right"
                                min="0"
                                step="0.01"
                              />
                            </td>
                            <td className="p-2 text-center">{item.unit}</td>
                            <td className="p-2">
                              <select
                                value={item.condition}
                                onChange={(e) => handleExistingItemChange(index, "condition", e.target.value)}
                                className="w-full h-9 px-2 rounded border border-slate-200 bg-white text-sm"
                              >
                                {CONDITION_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="p-2">
                              <Input
                                value={item.notes}
                                onChange={(e) => handleExistingItemChange(index, "notes", e.target.value)}
                                placeholder="-"
                                className="border-0"
                              />
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-4 bg-slate-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-slate-900">Receipt Information</h3>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="poId">Purchase Order *</Label>
                      <select
                        id="poId"
                        value={poId}
                        onChange={(e) => handlePoPick(e.target.value)}
                        required
                        className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white"
                      >
                        <option value="">Select purchase order...</option>
                        {purchaseOrders.map((po) => (
                          <option key={po.id} value={po.id}>
                            {po.poNumber} — {po.supplier.name}
                          </option>
                        ))}
                      </select>
                      {purchaseOrders.length === 0 && (
                        <p className="text-xs text-slate-400">
                          Tidak ada PO yang perlu dibuatkan GR manual. PO berstatus "Sent"/"Confirmed" sudah
                          otomatis dapat draft GR sendiri — cek daftar Goods Receipts.
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="receiptDate">Receipt Date *</Label>
                      <Input
                        id="receiptDate"
                        name="receiptDate"
                        type="date"
                        value={formData.receiptDate}
                        onChange={handleChange}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="warehouseId">Receiving Warehouse (optional)</Label>
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
                      Selecting a warehouse automatically adds received sparepart items to its stock.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    <textarea
                      id="notes"
                      name="notes"
                      placeholder="Delivery condition, discrepancies, etc."
                      value={formData.notes}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md"
                      rows={2}
                    />
                  </div>
                </div>

                {rows.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="font-semibold text-slate-900">Items Received</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50">
                            <th className="text-left p-2">Description</th>
                            <th className="text-center p-2 w-20">Stock</th>
                            <th className="text-right p-2 w-20">Ordered</th>
                            <th className="text-right p-2 w-24">Already Recv.</th>
                            <th className="text-right p-2 w-28">Qty Now</th>
                            <th className="text-center p-2 w-20">Unit</th>
                            <th className="text-center p-2 w-28">Condition</th>
                            <th className="text-left p-2 w-28">Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row, index) => (
                            <tr key={row.poItemId} className="border-b border-slate-200">
                              <td className="p-2">{row.description}</td>
                              <td className="p-2 text-center">
                                {row.productId ? (
                                  <span className="text-xs text-teal-700">Tracked</span>
                                ) : (
                                  <span className="text-xs text-slate-400">Manual</span>
                                )}
                              </td>
                              <td className="p-2 text-right text-slate-500">{row.ordered}</td>
                              <td className="p-2 text-right text-slate-500">{row.alreadyReceived}</td>
                              <td className="p-2">
                                <Input
                                  type="number"
                                  value={row.quantity}
                                  onChange={(e) => handleRowChange(index, "quantity", parseFloat(e.target.value) || 0)}
                                  className="border-0 text-right"
                                  min="0"
                                  step="0.01"
                                />
                              </td>
                              <td className="p-2 text-center">{row.unit}</td>
                              <td className="p-2">
                                <select
                                  value={row.condition}
                                  onChange={(e) => handleRowChange(index, "condition", e.target.value)}
                                  className="w-full h-9 px-2 rounded border border-slate-200 bg-white text-sm"
                                >
                                  {CONDITION_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="p-2">
                                <Input
                                  value={row.notes}
                                  onChange={(e) => handleRowChange(index, "notes", e.target.value)}
                                  placeholder="-"
                                  className="border-0"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="flex gap-3 border-t pt-6">
              <Button type="button" variant="outline" onClick={() => router.push("/supply-chain/goods-receipts")}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : grId ? "Update Inspection Status" : "Record Receipt"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      {grId && <Attachments referenceType="GoodsReceipt" referenceId={grId} />}
    </div>
  );
}
