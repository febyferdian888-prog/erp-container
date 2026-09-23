"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DocumentHeader, SectionCard, StatusLabel } from "@/components/ui/document-form";
import { ArrowLeft, Plus, Trash2, ListChecks, FolderKanban, Layers, CheckCircle2 } from "lucide-react";

interface ProjectOption {
  id: string;
  projectNumber: string;
  projectName: string;
}

interface ProductOption {
  id: string;
  sku: string;
  name: string;
  unitId: string;
  standardPrice: number;
}

interface UnitOption {
  id: string;
  code: string;
  name: string;
}

interface BomItem {
  id?: string;
  productId: string;
  unitId: string;
  quantity: number;
  unitPrice: number;
  notes: string;
}

interface BomFormProps {
  bomId?: string;
}

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active (Approved)" },
  { value: "superseded", label: "Superseded" },
];

const STATUS_TONE: Record<string, "slate" | "green" | "amber" | "red" | "blue"> = {
  draft: "slate",
  active: "blue",
  superseded: "amber",
};

export function BomForm({ bomId }: BomFormProps) {
  const router = useRouter();
  const { status } = useSession();
  const [loading, setLoading] = useState(!!bomId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [bomNumber, setBomNumber] = useState("");
  const [linkedProject, setLinkedProject] = useState<ProjectOption | null>(null);
  const [approvedInfo, setApprovedInfo] = useState<{ approvedBy: string | null; approvedAt: string | null }>({
    approvedBy: null,
    approvedAt: null,
  });
  const [items, setItems] = useState<BomItem[]>([{ productId: "", unitId: "", quantity: 0, unitPrice: 0, notes: "" }]);

  const [formData, setFormData] = useState({
    projectId: "",
    title: "",
    description: "",
    docStatus: "draft",
  });

  useEffect(() => {
    if (status === "authenticated") {
      fetchProjects();
      fetchProductsAndUnits();
      if (bomId) {
        fetchBom();
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
        setProjects(data.map((p: any) => ({ id: p.id, projectNumber: p.projectNumber, projectName: p.projectName })));
      }
    } catch (err) {
      console.error("Error fetching projects:", err);
    }
  };

  const fetchProductsAndUnits = async () => {
    try {
      const [productsRes, unitsRes] = await Promise.all([fetch("/api/products"), fetch("/api/units")]);
      if (productsRes.ok) {
        const data = await productsRes.json();
        setProducts(data.map((p: any) => ({ id: p.id, sku: p.sku, name: p.name, unitId: p.unitId, standardPrice: Number(p.standardPrice) })));
      }
      if (unitsRes.ok) setUnits(await unitsRes.json());
    } catch (err) {
      console.error("Error fetching products/units:", err);
    }
  };

  const fetchBom = async () => {
    try {
      const res = await fetch(`/api/boms/${bomId}`);
      if (res.ok) {
        const data = await res.json();
        setBomNumber(`${data.bomNumber} (v${data.version})`);
        setLinkedProject(data.project);
        setApprovedInfo({ approvedBy: data.approvedBy, approvedAt: data.approvedAt });
        setFormData({
          projectId: data.projectId,
          title: data.title,
          description: data.description || "",
          docStatus: data.status,
        });
        if (data.items?.length > 0) {
          setItems(
            data.items.map((item: any) => ({
              id: item.id,
              productId: item.productId,
              unitId: item.unitId,
              quantity: Number(item.quantity),
              unitPrice: Number(item.unitPrice),
              notes: item.notes || "",
            }))
          );
        }
      }
    } catch (err) {
      console.error("Error fetching BOM:", err);
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
    if (field === "productId") {
      const product = products.find((p) => p.id === value);
      if (product) {
        newItems[index].unitId = product.unitId;
        newItems[index].unitPrice = product.standardPrice;
      }
    }
    setItems(newItems);
  };

  const addItem = () => {
    setItems([...items, { productId: "", unitId: "", quantity: 0, unitPrice: 0, notes: "" }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) setItems(items.filter((_, i) => i !== index));
  };

  const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const formatPrice = (price: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(price);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (!formData.projectId) throw new Error("Project is required");
      if (!formData.title) throw new Error("Title is required");
      if (!items.length || !items[0].productId) throw new Error("At least one material item is required");

      const url = bomId ? `/api/boms/${bomId}` : "/api/boms";
      const method = bomId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: formData.projectId,
          title: formData.title,
          description: formData.description,
          status: formData.docStatus,
          items: items.map((item) => ({
            productId: item.productId,
            unitId: item.unitId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            notes: item.notes,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save BOM");
      }

      router.push("/operational/boms");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving BOM");
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
        className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 mb-6"
      >
        <ArrowLeft size={16} />
        Back to BOMs
      </button>

      <form onSubmit={handleSubmit}>
        <DocumentHeader
          icon={Layers}
          eyebrow="Bill of Materials"
          title={bomId ? bomNumber : "New BOM"}
          gradient="from-cyan-950 via-cyan-900 to-slate-900"
          badge={bomId && <StatusLabel label={formData.docStatus.replace(/_/g, " ")} tone={STATUS_TONE[formData.docStatus] || "slate"} />}
          actions={
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : bomId ? "Update BOM" : "Create BOM"}
            </Button>
          }
        />

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <SectionCard icon={FolderKanban} title="BOM Information" accentColor="text-cyan-600">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="projectId" className="text-xs text-slate-500">
                    Project *
                  </Label>
                  <select
                    id="projectId"
                    name="projectId"
                    value={formData.projectId}
                    onChange={handleChange}
                    required
                    disabled={!!bomId}
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:bg-slate-100"
                  >
                    <option value="">Select project...</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.projectNumber} — {p.projectName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="title" className="text-xs text-slate-500">
                    BOM Title *
                  </Label>
                  <Input
                    id="title"
                    name="title"
                    placeholder="e.g., Material Struktur Rangka"
                    value={formData.title}
                    onChange={handleChange}
                    required
                    className="rounded-lg"
                  />
                </div>

                {bomId && (
                  <div className="space-y-1.5">
                    <Label htmlFor="docStatus" className="text-xs text-slate-500">
                      Status
                    </Label>
                    <select
                      id="docStatus"
                      name="docStatus"
                      value={formData.docStatus}
                      onChange={handleChange}
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="description" className="text-xs text-slate-500">
                    Description
                  </Label>
                  <textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              </div>
            </SectionCard>

            <SectionCard
              icon={ListChecks}
              title="Material Items"
              accentColor="text-cyan-600"
              action={
                <Button type="button" variant="outline" size="sm" onClick={addItem} className="gap-1.5 rounded-lg">
                  <Plus size={14} />
                  Add Material
                </Button>
              }
            >
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                      <th className="text-left px-2 py-2 font-medium">Material (SKU)</th>
                      <th className="text-right px-2 py-2 font-medium w-24">Qty</th>
                      <th className="text-center px-2 py-2 font-medium w-20">Unit</th>
                      <th className="text-right px-2 py-2 font-medium w-32">Unit Cost</th>
                      <th className="text-right px-2 py-2 font-medium w-32">Subtotal</th>
                      <th className="text-center px-2 py-2 font-medium w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => {
                      const unit = units.find((u) => u.id === item.unitId);
                      return (
                        <tr key={index} className="border-b border-slate-100 hover:bg-slate-50/60">
                          <td className="px-2 py-1.5">
                            <select
                              value={item.productId}
                              onChange={(e) => handleItemChange(index, "productId", e.target.value)}
                              required
                              className="w-full h-9 rounded-lg border-0 bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
                            >
                              <option value="">Select material...</option>
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.sku} — {p.name}
                                </option>
                              ))}
                            </select>
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
                          <td className="px-2 py-1.5 text-center text-slate-500">{unit?.code || "-"}</td>
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
                            {formatPrice(item.quantity * item.unitPrice)}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            {items.length > 1 && (
                              <button type="button" onClick={() => removeItem(index)} className="text-slate-400 hover:text-red-600">
                                <Trash2 size={15} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end mt-4 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-500">Estimated Material Cost</span>
                  <span className="text-xl font-bold tabular-nums text-cyan-900">{formatPrice(total)}</span>
                </div>
              </div>
            </SectionCard>
          </div>

          <div className="space-y-6">
            <div className="border border-slate-200 bg-white p-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
                <FolderKanban size={14} className="text-cyan-600" />
                Project
              </h3>
              {(linkedProject || projects.find((p) => p.id === formData.projectId)) ? (
                <div className="space-y-1">
                  {(() => {
                    const p = linkedProject || projects.find((pr) => pr.id === formData.projectId)!;
                    return (
                      <>
                        <p className="font-semibold text-slate-900">{p.projectName}</p>
                        <p className="text-xs text-slate-400 font-mono">{p.projectNumber}</p>
                      </>
                    );
                  })()}
                </div>
              ) : (
                <p className="text-sm text-slate-400">Select a project to see its details here.</p>
              )}
            </div>

            <div className="border border-slate-200 bg-white p-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">Cost Summary</h3>
              <dl className="space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Material Lines</dt>
                  <dd className="font-medium text-slate-900">{items.length}</dd>
                </div>
                <div className="flex justify-between border-t border-slate-100 pt-2.5">
                  <dt className="font-semibold text-slate-700">Total Cost</dt>
                  <dd className="font-bold text-cyan-900 tabular-nums">{formatPrice(total)}</dd>
                </div>
              </dl>
            </div>

            {approvedInfo.approvedBy && (
              <div className="border border-cyan-200 bg-cyan-50 p-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-cyan-700 mb-3 flex items-center gap-2">
                  <CheckCircle2 size={14} />
                  Approved
                </h3>
                <p className="text-sm text-cyan-900">{approvedInfo.approvedBy}</p>
                {approvedInfo.approvedAt && (
                  <p className="text-xs text-cyan-700 mt-1">
                    {new Date(approvedInfo.approvedAt).toLocaleDateString("id-ID")}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 justify-end mt-6">
          <Button type="button" variant="outline" onClick={() => router.push("/operational/boms")} className="rounded-lg">
            Cancel
          </Button>
          <Button type="submit" disabled={submitting} className="rounded-lg">
            {submitting ? "Saving..." : bomId ? "Update BOM" : "Create BOM"}
          </Button>
        </div>
      </form>
    </div>
  );
}
