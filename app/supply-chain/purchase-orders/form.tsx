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
import { ApprovalPanel } from "@/components/approval-panel";
import { PoNextSteps } from "@/components/po-next-steps";

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
  items: { partNumber?: string | null; description: string; quantity: string; unit: string | null }[];
}

interface LineItem {
  id?: string;
  lineNumber: number;
  productId: string;
  description: string;
  brand: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  subtotal: number;
  notes: string;
  partNumber?: string;
  soItemId?: string;
}

interface HistoryItem {
  productId: string | null;
  description: string;
  brand: string | null;
  unit: string | null;
  lastPrice: number;
  supplierName: string;
  poNumber: string;
  poDate: string;
}

interface ProductOption {
  id: string;
  sku: string;
  name: string;
  standardPrice: number;
  unit: { code: string };
  brand?: string | null;
  interchange?: string | null;
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
  const searchParams = useSearchParams();
  const prefillSoIds = (searchParams.get("soIds") || searchParams.get("soId") || "").split(",").filter(Boolean);
  const prefillItemIds = (searchParams.get("itemIds") || "").split(",").filter(Boolean);
  const [mergedSoIds, setMergedSoIds] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyQuery, setHistoryQuery] = useState("");
  const [masterQuery, setMasterQuery] = useState("");
  const [rowSearch, setRowSearch] = useState<number | null>(null);
  const [rowQuery, setRowQuery] = useState("");
  const [variantBusy, setVariantBusy] = useState<number | null>(null);
  const { status } = useSession();
  const [loading, setLoading] = useState(!!poId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [approvedRequests, setApprovedRequests] = useState<PurchaseRequestOption[]>([]);
  const [salesOrders, setSalesOrders] = useState<SalesOrderOption[]>([]);
  const [poNumber, setPoNumber] = useState("");
  const [revisionNumber, setRevisionNumber] = useState(1);
  const [revising, setRevising] = useState(false);
  const [sourcePrNumber, setSourcePrNumber] = useState("");
  const [sourceSoNumber, setSourceSoNumber] = useState("");
  const [coverageNote, setCoverageNote] = useState<{ covered: { description: string; poNumber: string; vendor: string }[]; outstanding: number; total: number } | null>(null);
  const [prId, setPrId] = useState("");
  const [soId, setSoId] = useState("");
  const [items, setItems] = useState<LineItem[]>([
    { lineNumber: 1, productId: "", description: "", brand: "", quantity: 0, unit: "pcs", unitPrice: 0, subtotal: 0, notes: "" },
  ]);

  const [formData, setFormData] = useState({
    supplierId: "",
    poDate: new Date().toISOString().split("T")[0],
    deliveryDate: "",
    paymentTerms: "",
    shipToAddress: "",
    ppnPercent: 11,
    pphPercent: 0,
    dpPercent: 0,
    status: "draft",
    notes: "",
  });

  useEffect(() => {
    if (status === "authenticated") {
      fetchSuppliers();
      fetchProducts();
      fetchApprovedRequests();
      fetchSalesOrders();
      fetch("/api/purchase-orders/item-history").then((r) => (r.ok ? r.json() : [])).then(setHistory).catch(() => {});
      if (poId) {
        fetchPurchaseOrder();
      } else {
        setLoading(false);
      }
    }
  }, [status]);

  useEffect(() => {
    if (poId || !prefillSoIds.length) return;
    const picked = salesOrders.filter((s) => prefillSoIds.includes(s.id));
    if (!picked.length) return;
    if (picked.length === 1) {
      handleSoPick(picked[0].id);
      return;
    }
    // Same item across several SOs becomes one line with the summed quantity (only what is still unbought).
    (async () => {
    const merged = new Map<string, LineItem>();
    for (const so of picked) {
      const cov = await fetch(`/api/sales-orders/${so.id}/coverage`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const lines: { partNumber?: string | null; description: string; quantity: number; unit: string | null }[] = cov
        ? cov.items.filter((i: any) => i.outstandingQty > 0).map((i: any) => ({ partNumber: i.partNumber, description: i.description, quantity: i.outstandingQty, unit: i.unit }))
        : so.items.map((i) => ({ partNumber: i.partNumber, description: i.description, quantity: Number(i.quantity), unit: i.unit }));
      for (const item of lines) {
        const key = `${item.description.trim().toLowerCase()}|${(item.unit || "pcs").toLowerCase()}`;
        const existing = merged.get(key);
        if (existing) {
          existing.quantity += Number(item.quantity);
        } else {
          merged.set(key, {
            lineNumber: merged.size + 1,
            productId: "",
            partNumber: item.partNumber || undefined,
            description: item.description,
            brand: "",
            quantity: Number(item.quantity),
            unit: item.unit || "pcs",
            unitPrice: 0,
            subtotal: 0,
            notes: "",
          });
        }
      }
    }
    setItems([...merged.values()]);
    setSoId(picked[0].id);
    setMergedSoIds(picked.map((s) => s.id));
    setSourceSoNumber(picked.map((s) => s.soNumber).join(", "));
    })();
  }, [salesOrders]);

  // SO lines already carry a registered part number; link them to the master automatically.
  useEffect(() => {
    if (!products.length) return;
    const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
    const bySku = new Map(products.map((p) => [norm(p.sku), p]));
    setItems((prev) => {
      let changed = false;
      const next = prev.map((it) => {
        if (it.productId || !it.partNumber) return it;
        const hit = bySku.get(norm(it.partNumber));
        if (!hit) return it;
        changed = true;
        return { ...it, productId: hit.id, unit: it.unit || hit.unit?.code || "pcs", unitPrice: it.unitPrice || hit.standardPrice, subtotal: it.quantity * (it.unitPrice || hit.standardPrice) };
      });
      return changed ? next : prev;
    });
  }, [products, items.length]);

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
            brand: p.brand ?? null,
            interchange: p.interchange ?? null,
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
        setRevisionNumber(data.revisionNumber ?? 1);
        setSourcePrNumber(data.purchaseRequest?.requestNumber || "");
        setSourceSoNumber(
          data.sources?.length
            ? data.sources.map((s: any) => s.salesOrder.soNumber).join(", ")
            : data.salesOrder?.soNumber || ""
        );
        setSoId(data.soId || "");
        setFormData({
          supplierId: data.supplierId,
          poDate: data.poDate.split("T")[0],
          deliveryDate: data.deliveryDate ? data.deliveryDate.split("T")[0] : "",
          paymentTerms: data.paymentTerms || "",
          shipToAddress: data.shipToAddress || "",
          ppnPercent: Number(data.ppnPercent ?? 11),
          pphPercent: Number(data.pphPercent ?? 0),
          dpPercent: Number(data.dpPercent ?? 0),
          status: data.status,
          notes: data.notes || "",
        });
        if (data.items?.length > 0) {
          setItems(
            data.items.map((item: any) => ({
              id: item.id,
              lineNumber: item.lineNumber,
              productId: item.productId || "",
              soItemId: item.soItemId || undefined,
              description: item.description,
              brand: item.brand || "",
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
          brand: "",
          quantity: Number(item.quantity),
          unit: item.unit || "pcs",
          unitPrice: Number(item.estimatedPrice),
          subtotal: Number(item.quantity) * Number(item.estimatedPrice),
          notes: "",
        }))
      );
    }
  };

  const handleSoPick = async (id: string) => {
    setSoId(id);
    setCoverageNote(null);
    const so = salesOrders.find((x) => x.id === id);
    if (!so) return;
    setSourceSoNumber(so.soNumber);
    const cov = await fetch(`/api/sales-orders/${id}/coverage`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!cov) {
      setItems(
        so.items.map((item: any, index) => ({
          lineNumber: index + 1,
          productId: "",
          partNumber: item.partNumber || undefined,
          description: item.description,
          brand: "",
          quantity: Number(item.quantity),
          unit: item.unit || "pcs",
          unitPrice: 0,
          subtotal: 0,
          notes: "",
        }))
      );
      return;
    }
    const outstanding = cov.items.filter((i: any) => i.outstandingQty > 0 && (!prefillItemIds.length || prefillItemIds.includes(i.id)));
    const covered = cov.items
      .filter((i: any) => i.outstandingQty <= 0)
      .flatMap((i: any) => i.orders.map((o: any) => ({ description: i.description, poNumber: o.poNumber, vendor: o.supplierName })));
    setCoverageNote({ covered, outstanding: outstanding.length, total: cov.items.length });
    if (!outstanding.length) return;
    setItems(
      outstanding.map((i: any, index: number) => ({
        lineNumber: index + 1,
        productId: "",
        soItemId: i.id,
        partNumber: i.partNumber || undefined,
        description: i.description,
        brand: "",
        quantity: Number(i.outstandingQty),
        unit: i.unit || "pcs",
        unitPrice: 0,
        subtotal: 0,
        notes: "",
      }))
    );
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    const numericFields = ["ppnPercent", "pphPercent", "dpPercent"];
    setFormData((prev) => ({ ...prev, [name]: numericFields.includes(name) ? parseFloat(value) || 0 : value }));
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

  const blankLine = (n: number): LineItem => ({
    lineNumber: n, productId: "", description: "", brand: "", quantity: 0, unit: "pcs", unitPrice: 0, subtotal: 0, notes: "",
  });

  const addFromHistory = (h: HistoryItem) => {
    const filled = {
      productId: h.productId || "",
      description: h.description,
      brand: h.brand || "",
      unit: h.unit || "pcs",
      unitPrice: h.lastPrice,
    };
    const emptyIdx = items.findIndex((i) => !i.description.trim());
    if (emptyIdx >= 0) {
      setItems(items.map((it, i) => (i === emptyIdx ? { ...it, ...filled, subtotal: it.quantity * filled.unitPrice } : it)));
    } else {
      const n = Math.max(...items.map((i) => i.lineNumber), 0) + 1;
      setItems([...items, { ...blankLine(n), ...filled, quantity: 1, subtotal: filled.unitPrice }]);
    }
  };

  const handleDescriptionChange = (index: number, value: string) => {
    const match = history.find((h) => h.description === value);
    const item = items[index];
    if (match && !item.brand && !item.unitPrice) {
      setItems(items.map((it, i) => (i === index
        ? { ...it, description: value, brand: match.brand || "", unit: match.unit || it.unit, unitPrice: match.lastPrice, subtotal: it.quantity * match.lastPrice }
        : it)));
    } else {
      handleItemChange(index, "description", value);
    }
  };

  const addFromMaster = (p: ProductOption) => {
    const filled = { productId: p.id, brand: p.brand || "", description: p.name, unit: p.unit?.code || "pcs", unitPrice: p.standardPrice };
    const emptyIdx = items.findIndex((i) => !i.description.trim() && !i.productId);
    if (emptyIdx >= 0) {
      setItems(items.map((it, i) => (i === emptyIdx ? { ...it, ...filled, quantity: it.quantity || 1, subtotal: (it.quantity || 1) * filled.unitPrice } : it)));
    } else {
      const n = Math.max(...items.map((i) => i.lineNumber), 0) + 1;
      setItems([...items, { ...blankLine(n), ...filled, quantity: 1, subtotal: filled.unitPrice }]);
    }
    setMasterQuery("");
  };

  const saveAsNewPrice = async (index: number) => {
    const item = items[index];
    if (!item.productId) return;
    setVariantBusy(index);
    setError(null);
    try {
      const res = await fetch(`/api/products/${item.productId}/price-variant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price: item.unitPrice }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan kode harga baru");
      const np = data.product;
      setProducts((prev) => (prev.some((pr) => pr.id === np.id) ? prev : [...prev, { id: np.id, sku: np.sku, name: np.name, standardPrice: Number(np.standardPrice), unit: np.unit, brand: np.brand ?? null, interchange: np.interchange ?? null }]));
      setItems((prev) => prev.map((it, i) => (i === index ? { ...it, productId: np.id } : it)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan kode harga baru");
    } finally {
      setVariantBusy(null);
    }
  };

  const rowMasterMatches = rowSearch === null || !rowQuery.trim()
    ? []
    : products.filter((pr) => {
        const q = rowQuery.trim().toLowerCase();
        return [pr.sku, pr.name, pr.brand, pr.interchange].some((v) => (v || "").toLowerCase().includes(q));
      }).slice(0, 12);

  const rowHistory = rowSearch === null || !rowQuery.trim()
    ? []
    : history
        .filter((h) => {
          const q = rowQuery.trim().toLowerCase();
          const pr = products.find((x) => x.id === h.productId);
          return [h.description, h.brand, h.supplierName, h.poNumber, pr?.sku].some((v) => (v || "").toLowerCase().includes(q));
        })
        .sort((a, b) => new Date(b.poDate).getTime() - new Date(a.poDate).getTime())
        .slice(0, 10);

  const pickForRow = (index: number, pr: ProductOption, price?: number) => {
    setItems((prev) => prev.map((it, i) => {
      if (i !== index) return it;
      const unitPrice = price ?? pr.standardPrice;
      return { ...it, productId: pr.id, description: pr.name, unit: pr.unit?.code || it.unit, unitPrice, subtotal: it.quantity * unitPrice };
    }));
    setRowSearch(null);
  };

  const masterMatches = masterQuery.trim()
    ? products
        .filter((p) => {
          const q = masterQuery.trim().toLowerCase();
          return [p.sku, p.name, p.brand, p.interchange].some((v) => (v || "").toLowerCase().includes(q));
        })
        .slice(0, 10)
    : [];

  const historyMatches = historyQuery.trim()
    ? history
        .filter((h) => {
          const q = historyQuery.trim().toLowerCase();
          return [h.description, h.brand, h.supplierName, h.poNumber].some((v) => (v || "").toLowerCase().includes(q));
        })
        .slice(0, 8)
    : [];

  const addItem = () => {
    const newLineNumber = Math.max(...items.map((i) => i.lineNumber), 0) + 1;
    setItems([
      ...items,
      { lineNumber: newLineNumber, productId: "", description: "", brand: "", quantity: 0, unit: "pcs", unitPrice: 0, subtotal: 0, notes: "" },
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
      const unregistered = items.map((it, i) => ({ it, line: i + 1 })).filter(({ it }) => !it.productId);
      if (unregistered.length) {
        throw new Error(
          `Item baris ${unregistered.map((u) => u.line).join(", ")} belum terhubung ke master sparepart. Cari di Master Sparepart, atau daftarkan dulu sebagai item baru.`
        );
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
          soIds: mergedSoIds.length ? mergedSoIds : undefined,
          items: items.map((item) => ({
            productId: item.productId || null,
            soItemId: item.soItemId || null,
            description: item.description,
            brand: item.brand || null,
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
      {poId && <PoNextSteps poId={poId} />}
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
          <div className="flex items-center gap-2">
            {revisionNumber > 1 && (
              <span className="text-xs font-medium text-orange-700 bg-orange-50 px-2 py-1 rounded">Rev. {revisionNumber}</span>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={revising}
              onClick={async () => {
                if (!window.confirm(`Naikkan PO ini ke Rev. ${revisionNumber + 1}? Item dan harga tetap seperti yang tersimpan sekarang — edit dulu sebelum menaikkan revisi jika ada perubahan.`)) return;
                setRevising(true);
                try {
                  const res = await fetch(`/api/purchase-orders/${poId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ revisionNumber: revisionNumber + 1 }),
                  });
                  if (!res.ok) throw new Error((await res.json()).error || "Gagal membuat revisi");
                  setRevisionNumber(revisionNumber + 1);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Gagal membuat revisi");
                } finally {
                  setRevising(false);
                }
              }}
            >
              {revising ? "Menyimpan..." : "Buat Revisi Baru"}
            </Button>
            <a href={`/api/purchase-orders/${poId}/pdf`} target="_blank" rel="noopener noreferrer">
              <Button type="button" variant="outline" className="gap-2">
                <Download size={16} />
                Download PDF
              </Button>
            </a>
          </div>
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
                {mergedSoIds.length > 1 && (
                  <p className="mt-1 text-xs">
                    PO gabungan dari {mergedSoIds.length} SO. Item yang sama sudah dijumlahkan; periksa qty sebelum disimpan.
                  </p>
                )}
                {coverageNote && coverageNote.total > 0 && (
                  <div className="mt-2 text-xs">
                    <p>
                      {coverageNote.outstanding} dari {coverageNote.total} item SO ini belum di-PO. Hapus baris yang akan dipesan ke vendor lain;
                      baris yang tidak masuk PO ini tetap menunggu di daftar tugas Purchasing.
                    </p>
                    {coverageNote.covered.length > 0 && (
                      <ul className="mt-1 list-disc pl-4">
                        {coverageNote.covered.map((c, i) => (
                          <li key={i}>
                            {c.description} sudah di {c.poNumber} ({c.vendor})
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
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

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ppnPercent">PPN (%)</Label>
                  <Input id="ppnPercent" name="ppnPercent" type="number" step="0.01" min="0" value={formData.ppnPercent} onChange={handleChange} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pphPercent">PPh (%) — informasional</Label>
                  <Input id="pphPercent" name="pphPercent" type="number" step="0.01" min="0" value={formData.pphPercent} onChange={handleChange} />
                  <p className="text-xs text-slate-400">Dipotong vendor saat penagihan, tidak mengurangi Total PO.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dpPercent">Uang muka / DP (%)</Label>
                  <Input id="dpPercent" name="dpPercent" type="number" step="0.01" min="0" max="100" value={formData.dpPercent} onChange={handleChange} />
                  <p className="text-xs text-slate-400">Isi bila vendor minta DP sebelum memproses. 0 = tanpa DP.</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="shipToAddress">Ship To Address (optional — defaults to company address)</Label>
                <textarea
                  id="shipToAddress"
                  name="shipToAddress"
                  value={formData.shipToAddress}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                  rows={2}
                />
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

              <datalist id="po-item-history">
                {history.slice(0, 500).map((h, i) => (
                  <option key={i} value={h.description} />
                ))}
              </datalist>

              <div className="space-y-1">
                <Input
                  value={masterQuery}
                  onChange={(e) => setMasterQuery(e.target.value)}
                  placeholder="Cari di Master Sparepart (part number atau nama)…"
                />
                {masterQuery.trim() && (
                  <ul className="max-h-72 overflow-y-auto divide-y divide-slate-100 border border-slate-200 bg-white text-sm">
                    {masterMatches.length === 0 && (
                      <li className="flex items-center justify-between gap-3 px-3 py-2 text-slate-600">
                        <span>Tidak ada di master sparepart. Daftarkan dulu sebagai item baru, lalu cari lagi di sini.</span>
                        <a
                          href={`/operational/products/new?sku=${encodeURIComponent(masterQuery.trim())}`}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 border border-slate-300 bg-white px-3 py-1 text-sm font-medium hover:bg-slate-50"
                        >
                          Tambah ke master
                        </a>
                      </li>
                    )}
                    {masterMatches.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{p.name}</span>
                          <span className="block font-mono text-xs text-slate-500">{p.sku}{p.brand ? ` · ${p.brand}` : ""}{p.interchange ? ` · alt: ${p.interchange}` : ""} · {formatPrice(p.standardPrice)}</span>
                        </span>
                        <Button type="button" variant="outline" size="sm" onClick={() => addFromMaster(p)}>
                          Tambah
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <button type="button" className="text-xs text-slate-500 underline" onClick={fetchProducts}>
                  Muat ulang master sparepart (setelah menambah item baru)
                </button>
              </div>

              <div className="space-y-1">
                <Input
                  value={historyQuery}
                  onChange={(e) => setHistoryQuery(e.target.value)}
                  placeholder="Cari item yang pernah dipesan (nama, brand, vendor, no. PO)…"
                />
                {historyQuery.trim() && (
                  <ul className="max-h-72 overflow-y-auto divide-y divide-slate-100 border border-slate-200 bg-white text-sm">
                    {historyMatches.length === 0 && <li className="px-3 py-2 text-slate-500">Tidak ada item cocok.</li>}
                    {historyMatches.map((h, i) => (
                      <li key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{h.description + (h.brand ? " · " + h.brand : "")}</span>
                          <span className="block text-xs text-slate-500">
                            {formatPrice(h.lastPrice) + " / " + (h.unit || "pcs") + " · " + h.supplierName + " · " + h.poNumber + " · " + new Date(h.poDate).toLocaleDateString("id-ID")}
                          </span>
                        </span>
                        <Button type="button" variant="outline" size="sm" onClick={() => addFromHistory(h)}>
                          Tambah
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="text-left p-2 w-44">Sparepart (master)</th>
                      <th className="text-left p-2 min-w-[300px]">Description</th>
                      <th className="text-left p-2 w-28">Brand</th>
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
                            <option value="">Pilih dari master…</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.sku} — {p.name}
                              </option>
                            ))}
                          </select>
                          <div className="mt-0.5 flex items-center gap-2">
                            <button
                              type="button"
                              className="text-[11px] font-medium text-brand underline"
                              onClick={() => {
                                const cur = products.find((pr) => pr.id === item.productId);
                                setRowQuery(cur?.sku.replace(/-\d+$/, "") || item.description);
                                setRowSearch(index);
                              }}
                            >
                              Cari / cek harga
                            </button>
                            {!item.productId && <span className="text-[10px] text-amber-700">Belum di master — wajib dipilih</span>}
                          </div>
                        </td>
                        <td className="p-2">
                          <Input
                            value={item.description}
                            onChange={(e) => handleDescriptionChange(index, e.target.value)}
                            list="po-item-history"
                            placeholder="Ketik deskripsi item, atau pilih dari riwayat"
                            className="border border-slate-200"
                            required
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            value={item.brand}
                            onChange={(e) => handleItemChange(index, "brand", e.target.value)}
                            placeholder="-"
                            className="border border-slate-200"
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
                          {(() => {
                            const linked = products.find((pr) => pr.id === item.productId);
                            if (!linked || !item.unitPrice || item.unitPrice === linked.standardPrice) return null;
                            return (
                              <div className="mt-0.5 text-[10px] leading-tight text-amber-700">
                                Beda dari harga {linked.sku} ({formatPrice(linked.standardPrice)}).{" "}
                                <button type="button" disabled={variantBusy === index} className="underline" onClick={() => saveAsNewPrice(index)}>
                                  {variantBusy === index ? "Menyimpan…" : "Simpan sebagai kode baru"}
                                </button>
                              </div>
                            );
                          })()}
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

              {rowSearch !== null && (
                <div className="space-y-3 border border-slate-300 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">Cari sparepart untuk baris {rowSearch + 1}</p>
                    <button type="button" className="text-sm text-slate-500 hover:text-slate-900" onClick={() => setRowSearch(null)}>Tutup</button>
                  </div>
                  <Input autoFocus value={rowQuery} onChange={(e) => setRowQuery(e.target.value)} placeholder="Part number, nama, vendor, atau no. PO…" />

                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Master sparepart (kode &amp; harga standar)</p>
                    <ul className="divide-y divide-slate-100 border border-slate-200 text-sm">
                      {rowMasterMatches.length === 0 && <li className="px-3 py-2 text-slate-500">Tidak ada di master.</li>}
                      {rowMasterMatches.map((pr) => (
                        <li key={pr.id} className="flex items-center justify-between gap-3 px-3 py-2">
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{pr.name}</span>
                            <span className="block font-mono text-xs text-slate-500">{pr.sku}{pr.brand ? ` · ${pr.brand}` : ""}{pr.interchange ? ` · alt: ${pr.interchange}` : ""} · {formatPrice(pr.standardPrice)}</span>
                          </span>
                          <Button type="button" variant="outline" size="sm" onClick={() => pickForRow(rowSearch, pr)}>Pakai</Button>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Pembelian sebelumnya</p>
                    <ul className="divide-y divide-slate-100 border border-slate-200 text-sm">
                      {rowHistory.length === 0 && <li className="px-3 py-2 text-slate-500">Belum ada riwayat pembelian yang cocok.</li>}
                      {rowHistory.map((h, i) => {
                        const pr = products.find((x) => x.id === h.productId);
                        return (
                          <li key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{h.description}{pr ? ` · ${pr.sku}` : ""}</span>
                              <span className="block text-xs text-slate-500">
                                {formatPrice(h.lastPrice)} / {h.unit || "pcs"} · {h.supplierName} · {h.poNumber} · {new Date(h.poDate).toLocaleDateString("id-ID")}
                              </span>
                            </span>
                            {pr ? (
                              <Button type="button" variant="outline" size="sm" onClick={() => pickForRow(rowSearch, pr, h.lastPrice)}>Pakai harga ini</Button>
                            ) : (
                              <span className="text-xs text-amber-700">Belum di master</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              )}
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
