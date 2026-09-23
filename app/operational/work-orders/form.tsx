"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DocumentHeader, SectionCard, StatusLabel } from "@/components/ui/document-form";
import { ArrowLeft, Wrench, ClipboardList, FolderKanban } from "lucide-react";

interface ProjectOption {
  id: string;
  projectNumber: string;
  projectName: string;
  status: string;
}

interface WorkOrderFormProps {
  woId?: string;
  companyId: string;
}

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "released", label: "Released" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_TONE: Record<string, "slate" | "green" | "amber" | "red" | "blue"> = {
  draft: "slate",
  released: "blue",
  in_progress: "amber",
  completed: "green",
  cancelled: "red",
};

export function WorkOrderForm({ woId, companyId }: WorkOrderFormProps) {
  const router = useRouter();
  const { status } = useSession();
  const [loading, setLoading] = useState(!!woId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [orderNumber, setOrderNumber] = useState("");
  const [linkedProject, setLinkedProject] = useState<ProjectOption | null>(null);

  const [formData, setFormData] = useState({
    projectId: "",
    title: "",
    description: "",
    status: "draft",
    startDate: "",
    targetEndDate: "",
    actualEndDate: "",
    notes: "",
  });

  useEffect(() => {
    if (status === "authenticated") {
      fetchProjects();
      if (woId) {
        fetchWorkOrder();
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
        setProjects(data.map((p: any) => ({ id: p.id, projectNumber: p.projectNumber, projectName: p.projectName, status: p.status })));
      }
    } catch (err) {
      console.error("Error fetching projects:", err);
    }
  };

  const fetchWorkOrder = async () => {
    try {
      const res = await fetch(`/api/work-orders/${woId}`);
      if (res.ok) {
        const data = await res.json();
        setOrderNumber(data.orderNumber);
        setLinkedProject(data.project);
        setFormData({
          projectId: data.projectId,
          title: data.title || "",
          description: data.description || "",
          status: data.status,
          startDate: data.startDate ? data.startDate.split("T")[0] : "",
          targetEndDate: data.targetEndDate ? data.targetEndDate.split("T")[0] : "",
          actualEndDate: data.actualEndDate ? data.actualEndDate.split("T")[0] : "",
          notes: data.notes || "",
        });
      }
    } catch (err) {
      console.error("Error fetching work order:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const selectedProject = projects.find((p) => p.id === formData.projectId) || linkedProject;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (!formData.projectId) throw new Error("Project is required");
      if (!formData.title) throw new Error("Title is required");

      const url = woId ? `/api/work-orders/${woId}` : "/api/work-orders";
      const method = woId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, ...formData }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save work order");
      }

      router.push("/operational/work-orders");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving work order");
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
        className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 mb-6"
      >
        <ArrowLeft size={16} />
        Back to Work Orders
      </button>

      <form onSubmit={handleSubmit}>
        <DocumentHeader
          icon={Wrench}
          eyebrow="Surat Perintah Kerja"
          title={woId ? orderNumber : "New Work Order"}
          gradient="from-violet-950 via-violet-900 to-slate-900"
          badge={woId && <StatusLabel label={formData.status.replace(/_/g, " ")} tone={STATUS_TONE[formData.status] || "slate"} />}
          actions={
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : woId ? "Update SPK" : "Create SPK"}
            </Button>
          }
        />

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <SectionCard icon={ClipboardList} title="Work Order Details" accentColor="text-violet-600">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="projectId" className="text-xs text-slate-500">
                    Project *
                  </Label>
                  <select
                    id="projectId"
                    name="projectId"
                    value={formData.projectId}
                    onChange={handleChange}
                    required
                    disabled={!!woId}
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:bg-slate-100"
                  >
                    <option value="">Select project...</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.projectNumber} — {p.projectName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="title" className="text-xs text-slate-500">
                    Work Title *
                  </Label>
                  <Input
                    id="title"
                    name="title"
                    placeholder="e.g., Pengelasan struktur rangka kontainer"
                    value={formData.title}
                    onChange={handleChange}
                    required
                    className="rounded-lg"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="description" className="text-xs text-slate-500">
                    Work Description
                  </Label>
                  <textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="startDate" className="text-xs text-slate-500">
                    Start Date
                  </Label>
                  <Input id="startDate" name="startDate" type="date" value={formData.startDate} onChange={handleChange} className="rounded-lg" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="targetEndDate" className="text-xs text-slate-500">
                    Target Completion
                  </Label>
                  <Input id="targetEndDate" name="targetEndDate" type="date" value={formData.targetEndDate} onChange={handleChange} className="rounded-lg" />
                </div>

                {woId && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="status" className="text-xs text-slate-500">
                        Status
                      </Label>
                      <select
                        id="status"
                        name="status"
                        value={formData.status}
                        onChange={handleChange}
                        className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                      >
                        {STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="actualEndDate" className="text-xs text-slate-500">
                        Actual Completion
                      </Label>
                      <Input id="actualEndDate" name="actualEndDate" type="date" value={formData.actualEndDate} onChange={handleChange} className="rounded-lg" />
                    </div>
                  </>
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
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
              </div>
            </SectionCard>
          </div>

          <div className="space-y-6">
            <div className="border border-slate-200 bg-white p-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
                <FolderKanban size={14} className="text-violet-600" />
                Project
              </h3>
              {selectedProject ? (
                <div className="space-y-1">
                  <p className="font-semibold text-slate-900">{selectedProject.projectName}</p>
                  <p className="text-xs text-slate-400 font-mono">{selectedProject.projectNumber}</p>
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 capitalize mt-2">
                    {selectedProject.status.replace(/_/g, " ")}
                  </span>
                </div>
              ) : (
                <p className="text-sm text-slate-400">Select a project to see its details here.</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-3 justify-end mt-6">
          <Button type="button" variant="outline" onClick={() => router.push("/operational/work-orders")} className="rounded-lg">
            Cancel
          </Button>
          <Button type="submit" disabled={submitting} className="rounded-lg">
            {submitting ? "Saving..." : woId ? "Update SPK" : "Create SPK"}
          </Button>
        </div>
      </form>
    </div>
  );
}
