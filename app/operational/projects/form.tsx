"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DocumentHeader, SectionCard, StatusLabel } from "@/components/ui/document-form";
import {
  ArrowLeft,
  Plus,
  Trash2,
  FolderKanban,
  Building2,
  ListChecks,
  Wrench,
  ClipboardList,
  Sparkles,
} from "lucide-react";

interface Customer {
  id: string;
  code: string;
  name: string;
}

interface Stage {
  id?: string;
  stageName: string;
  description: string;
  progressWeight: number;
  status: string;
}

interface ProjectFormProps {
  projectId?: string;
  companyId: string;
}

const STATUS_OPTIONS = [
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In Progress" },
  { value: "on_hold", label: "On Hold" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const STAGE_STATUS_OPTIONS = ["pending", "in_progress", "completed", "on_hold"];

const STATUS_TONE: Record<string, "slate" | "green" | "amber" | "red" | "blue"> = {
  planned: "slate",
  in_progress: "green",
  on_hold: "amber",
  completed: "blue",
  cancelled: "red",
};

const STANDARD_STAGES = ["Persiapan", "Struktur", "Interior", "Instalasi", "Pengecatan", "QC"];

export function ProjectForm({ projectId, companyId }: ProjectFormProps) {
  const router = useRouter();
  const { status } = useSession();
  const [loading, setLoading] = useState(!!projectId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [projectNumber, setProjectNumber] = useState("");
  const [stages, setStages] = useState<Stage[]>([]);
  const [linked, setLinked] = useState<{
    salesOrder?: { soNumber: string } | null;
    workOrders: { id: string }[];
    boms: { id: string }[];
    purchaseOrders: { poNumber: string }[];
  } | null>(null);

  const [formData, setFormData] = useState({
    customerId: "",
    projectName: "",
    description: "",
    executionMethod: "supplier",
    startDate: new Date().toISOString().split("T")[0],
    targetEndDate: "",
    budget: 0,
    status: "planned",
    responsible: "",
    notes: "",
  });

  useEffect(() => {
    if (status === "authenticated") {
      fetchCustomers();
      if (projectId) {
        fetchProject();
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

  const fetchProject = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setProjectNumber(data.projectNumber);
        setLinked({
          salesOrder: data.salesOrder,
          workOrders: data.workOrders || [],
          boms: data.boms || [],
          purchaseOrders: data.purchaseOrders || [],
        });
        setFormData({
          customerId: data.customerId || "",
          projectName: data.projectName,
          description: data.description || "",
          executionMethod: data.executionMethod,
          startDate: data.startDate.split("T")[0],
          targetEndDate: data.targetEndDate.split("T")[0],
          budget: Number(data.budget || 0),
          status: data.status,
          responsible: data.responsible || "",
          notes: data.notes || "",
        });
        setStages(
          (data.stages || []).map((s: any) => ({
            id: s.id,
            stageName: s.stageName,
            description: s.description || "",
            progressWeight: s.progressWeight,
            status: s.status,
          }))
        );
      }
    } catch (err) {
      console.error("Error fetching project:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: name === "budget" ? parseFloat(value) || 0 : value }));
  };

  const handleStageChange = (index: number, field: string, value: any) => {
    const newStages = [...stages];
    newStages[index] = { ...newStages[index], [field]: value };
    setStages(newStages);
  };

  const addStage = () => {
    setStages([...stages, { stageName: "", description: "", progressWeight: 100, status: "pending" }]);
  };

  const useStandardStages = () => {
    setStages(STANDARD_STAGES.map((name) => ({ stageName: name, description: "", progressWeight: 100, status: "pending" })));
  };

  const removeStage = (index: number) => {
    setStages(stages.filter((_, i) => i !== index));
  };

  const progressPercent = () => {
    if (!stages.length) return 0;
    const totalWeight = stages.reduce((sum, s) => sum + Number(s.progressWeight || 0), 0);
    if (!totalWeight) return 0;
    const done = stages
      .filter((s) => s.status === "completed")
      .reduce((sum, s) => sum + Number(s.progressWeight || 0), 0);
    return Math.round((done / totalWeight) * 100);
  };

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(price);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (!formData.projectName) throw new Error("Project name is required");
      if (!formData.targetEndDate) throw new Error("Target end date is required");

      const url = projectId ? `/api/projects/${projectId}` : "/api/projects";
      const method = projectId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          ...formData,
          customerId: formData.customerId || null,
          stages: stages.length ? stages : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save project");
      }

      router.push("/operational/projects");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving project");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="max-w-6xl">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 mb-6"
      >
        <ArrowLeft size={16} />
        Back to Projects
      </button>

      <form onSubmit={handleSubmit}>
        <DocumentHeader
          icon={FolderKanban}
          eyebrow="Project"
          title={projectId ? projectNumber : "New Project"}
          gradient="from-emerald-950 via-emerald-900 to-slate-900"
          badge={projectId && <StatusLabel label={formData.status.replace(/_/g, " ")} tone={STATUS_TONE[formData.status] || "slate"} />}
          actions={
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : projectId ? "Update Project" : "Create Project"}
            </Button>
          }
        />

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <SectionCard icon={Building2} title="Project Information" accentColor="text-emerald-600">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="projectName" className="text-xs text-slate-500">
                    Project Name *
                  </Label>
                  <Input
                    id="projectName"
                    name="projectName"
                    placeholder="e.g., Fabrikasi 10x Reefer Container 20ft"
                    value={formData.projectName}
                    onChange={handleChange}
                    required
                    className="rounded-lg"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="customerId" className="text-xs text-slate-500">
                    Customer
                  </Label>
                  <select
                    id="customerId"
                    name="customerId"
                    value={formData.customerId}
                    onChange={handleChange}
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Internal / not tied to a customer</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} - {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="executionMethod" className="text-xs text-slate-500">
                    Execution Method
                  </Label>
                  <select
                    id="executionMethod"
                    name="executionMethod"
                    value={formData.executionMethod}
                    onChange={handleChange}
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="supplier">Supplier</option>
                    <option value="internal_workshop">Internal Workshop</option>
                    <option value="combination">Combination</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="startDate" className="text-xs text-slate-500">
                    Start Date *
                  </Label>
                  <Input id="startDate" name="startDate" type="date" value={formData.startDate} onChange={handleChange} required className="rounded-lg" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="targetEndDate" className="text-xs text-slate-500">
                    Target End Date *
                  </Label>
                  <Input id="targetEndDate" name="targetEndDate" type="date" value={formData.targetEndDate} onChange={handleChange} required className="rounded-lg" />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="budget" className="text-xs text-slate-500">
                    Budget (IDR)
                  </Label>
                  <Input id="budget" name="budget" type="number" min="0" step="0.01" value={formData.budget} onChange={handleChange} className="rounded-lg" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="responsible" className="text-xs text-slate-500">
                    Responsible / PIC
                  </Label>
                  <Input id="responsible" name="responsible" placeholder="Project lead name" value={formData.responsible} onChange={handleChange} className="rounded-lg" />
                </div>

                {projectId && (
                  <div className="space-y-1.5">
                    <Label htmlFor="status" className="text-xs text-slate-500">
                      Project Status
                    </Label>
                    <select
                      id="status"
                      name="status"
                      value={formData.status}
                      onChange={handleChange}
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

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
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </SectionCard>

            <SectionCard
              icon={ListChecks}
              title="Project Stages"
              accentColor="text-emerald-600"
              action={
                <div className="flex gap-2">
                  {stages.length === 0 && (
                    <Button type="button" variant="outline" size="sm" onClick={useStandardStages} className="gap-1.5 rounded-lg">
                      <Sparkles size={14} />
                      Use Standard Stages
                    </Button>
                  )}
                  <Button type="button" variant="outline" size="sm" onClick={addStage} className="gap-1.5 rounded-lg">
                    <Plus size={14} />
                    Add Stage
                  </Button>
                </div>
              }
            >
              {stages.length === 0 ? (
                <p className="text-sm text-slate-400">
                  No stages yet. Add stages like Persiapan, Struktur, Interior, Instalasi, Pengecatan, QC to track progress.
                </p>
              ) : (
                <div className="space-y-2">
                  {stages.map((stage, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">
                        {index + 1}
                      </span>
                      <Input
                        value={stage.stageName}
                        onChange={(e) => handleStageChange(index, "stageName", e.target.value)}
                        placeholder="Stage name"
                        className="border-0 bg-white shadow-none flex-1"
                        required
                      />
                      <Input
                        type="number"
                        value={stage.progressWeight}
                        onChange={(e) => handleStageChange(index, "progressWeight", parseFloat(e.target.value) || 0)}
                        className="border-0 bg-white shadow-none w-20 text-right tabular-nums"
                        title="Weight"
                        min="0"
                      />
                      <select
                        value={stage.status}
                        onChange={(e) => handleStageChange(index, "status", e.target.value)}
                        className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs capitalize"
                      >
                        {STAGE_STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s.replace("_", " ")}
                          </option>
                        ))}
                      </select>
                      <button type="button" onClick={() => removeStage(index)} className="text-slate-400 hover:text-red-600">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          <div className="space-y-6">
            <div className="border border-slate-200 bg-white p-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">Progress</h3>
              <div className="flex items-center gap-4">
                <div className="relative h-16 w-16 shrink-0">
                  <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90">
                    <path
                      className="text-slate-100"
                      strokeWidth="4"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className="text-emerald-500"
                      strokeWidth="4"
                      strokeDasharray={`${progressPercent()}, 100`}
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-slate-800">
                    {progressPercent()}%
                  </div>
                </div>
                <div className="text-sm text-slate-500">
                  {stages.filter((s) => s.status === "completed").length} of {stages.length} stages completed
                </div>
              </div>
            </div>

            <div className="border border-slate-200 bg-white p-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">Budget</h3>
              <p className="text-2xl font-bold text-emerald-800 tabular-nums">{formatPrice(formData.budget)}</p>
            </div>

            {linked && (linked.salesOrder || linked.workOrders.length > 0 || linked.boms.length > 0 || linked.purchaseOrders.length > 0) && (
              <div className="border border-slate-200 bg-white p-6">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">Linked Documents</h3>
                <ul className="space-y-2.5 text-sm">
                  {linked.salesOrder && (
                    <li className="flex items-center gap-2 text-slate-600">
                      <ClipboardList size={14} className="text-slate-400" />
                      Sales Order {linked.salesOrder.soNumber}
                    </li>
                  )}
                  {linked.workOrders.length > 0 && (
                    <li className="flex items-center gap-2 text-slate-600">
                      <Wrench size={14} className="text-slate-400" />
                      {linked.workOrders.length} Work Order(s)
                    </li>
                  )}
                  {linked.boms.length > 0 && (
                    <li className="flex items-center gap-2 text-slate-600">
                      <ListChecks size={14} className="text-slate-400" />
                      {linked.boms.length} BOM(s)
                    </li>
                  )}
                  {linked.purchaseOrders.map((po) => (
                    <li key={po.poNumber} className="flex items-center gap-2 text-slate-600">
                      <ClipboardList size={14} className="text-slate-400" />
                      PO {po.poNumber}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 justify-end mt-6">
          <Button type="button" variant="outline" onClick={() => router.push("/operational/projects")} className="rounded-lg">
            Cancel
          </Button>
          <Button type="submit" disabled={submitting} className="rounded-lg">
            {submitting ? "Saving..." : projectId ? "Update Project" : "Create Project"}
          </Button>
        </div>
      </form>
    </div>
  );
}
