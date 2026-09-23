"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DocumentHeader, SectionCard, StatusLabel } from "@/components/ui/document-form";
import { ArrowLeft, Wallet, User, FolderKanban } from "lucide-react";

interface EmployeeOption {
  id: string;
  employeeNumber: string;
  name: string;
  department: string | null;
}

interface ProjectOption {
  id: string;
  projectNumber: string;
  projectName: string;
}

interface ReimbursementFormProps {
  reimbursementId?: string;
  companyId: string;
}

const CATEGORIES = ["Transport", "Meal", "Accommodation", "Other"];
const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "paid", label: "Paid" },
];

const STATUS_TONE: Record<string, "slate" | "green" | "amber" | "red" | "blue"> = {
  pending: "amber",
  approved: "blue",
  rejected: "red",
  paid: "green",
};

export function ReimbursementForm({ reimbursementId, companyId }: ReimbursementFormProps) {
  const router = useRouter();
  const { status } = useSession();
  const [loading, setLoading] = useState(!!reimbursementId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [reimbursementNumber, setReimbursementNumber] = useState("");
  const [linkedEmployee, setLinkedEmployee] = useState<EmployeeOption | null>(null);

  const [formData, setFormData] = useState({
    employeeId: "",
    projectId: "",
    submissionDate: new Date().toISOString().split("T")[0],
    category: "Transport",
    amount: 0,
    docStatus: "pending",
    notes: "",
  });

  useEffect(() => {
    if (status === "authenticated") {
      fetchEmployees();
      fetchProjects();
      if (reimbursementId) {
        fetchReimbursement();
      } else {
        setLoading(false);
      }
    }
  }, [status]);

  const fetchEmployees = async () => {
    try {
      const res = await fetch("/api/employees");
      if (res.ok) {
        const data = await res.json();
        setEmployees(data.filter((e: any) => e.status === "active"));
      }
    } catch (err) {
      console.error("Error fetching employees:", err);
    }
  };

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

  const fetchReimbursement = async () => {
    try {
      const res = await fetch(`/api/reimbursements/${reimbursementId}`);
      if (res.ok) {
        const data = await res.json();
        setReimbursementNumber(data.reimbursementNumber);
        setLinkedEmployee(data.employee);
        setFormData({
          employeeId: data.employeeId,
          projectId: data.projectId || "",
          submissionDate: data.submissionDate.split("T")[0],
          category: data.category || "Transport",
          amount: Number(data.amount),
          docStatus: data.status,
          notes: data.notes || "",
        });
      }
    } catch (err) {
      console.error("Error fetching reimbursement:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: name === "amount" ? parseFloat(value) || 0 : value }));
  };

  const selectedEmployee = employees.find((e) => e.id === formData.employeeId) || linkedEmployee;
  const formatPrice = (price: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(price);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (!formData.employeeId) throw new Error("Employee is required");
      if (!formData.amount || formData.amount <= 0) throw new Error("Amount must be greater than 0");

      const url = reimbursementId ? `/api/reimbursements/${reimbursementId}` : "/api/reimbursements";
      const method = reimbursementId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          employeeId: formData.employeeId,
          projectId: formData.projectId || null,
          submissionDate: formData.submissionDate,
          category: formData.category,
          amount: formData.amount,
          status: formData.docStatus,
          notes: formData.notes,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save reimbursement");
      }

      router.push("/hr/reimbursements");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving reimbursement");
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
        Back to Reimbursements
      </button>

      <form onSubmit={handleSubmit}>
        <DocumentHeader
          icon={Wallet}
          eyebrow="Reimbursement"
          title={reimbursementId ? reimbursementNumber : "New Reimbursement"}
          gradient="from-pink-950 via-pink-900 to-slate-900"
          badge={reimbursementId && <StatusLabel label={formData.docStatus.replace(/_/g, " ")} tone={STATUS_TONE[formData.docStatus] || "slate"} />}
          actions={
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : reimbursementId ? "Update Request" : "Submit Request"}
            </Button>
          }
        />

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <SectionCard icon={Wallet} title="Reimbursement Details" accentColor="text-pink-600">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="employeeId" className="text-xs text-slate-500">
                    Employee *
                  </Label>
                  <select
                    id="employeeId"
                    name="employeeId"
                    value={formData.employeeId}
                    onChange={handleChange}
                    required
                    disabled={!!reimbursementId}
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 disabled:bg-slate-100"
                  >
                    <option value="">Select employee...</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.employeeNumber} — {e.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="projectId" className="text-xs text-slate-500">
                    Project (optional)
                  </Label>
                  <select
                    id="projectId"
                    name="projectId"
                    value={formData.projectId}
                    onChange={handleChange}
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
                  >
                    <option value="">Not tied to a project</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.projectNumber} — {p.projectName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="category" className="text-xs text-slate-500">
                    Category
                  </Label>
                  <select
                    id="category"
                    name="category"
                    value={formData.category}
                    onChange={handleChange}
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="submissionDate" className="text-xs text-slate-500">
                    Submission Date *
                  </Label>
                  <Input id="submissionDate" name="submissionDate" type="date" value={formData.submissionDate} onChange={handleChange} required className="rounded-lg" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="amount" className="text-xs text-slate-500">
                    Amount (IDR) *
                  </Label>
                  <Input id="amount" name="amount" type="number" min="0" step="0.01" value={formData.amount} onChange={handleChange} required className="rounded-lg" />
                </div>

                {reimbursementId && (
                  <div className="space-y-1.5">
                    <Label htmlFor="docStatus" className="text-xs text-slate-500">
                      Status
                    </Label>
                    <select
                      id="docStatus"
                      name="docStatus"
                      value={formData.docStatus}
                      onChange={handleChange}
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
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
                  <Label htmlFor="notes" className="text-xs text-slate-500">
                    Notes
                  </Label>
                  <textarea
                    id="notes"
                    name="notes"
                    value={formData.notes}
                    onChange={handleChange}
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
                  />
                </div>
              </div>
            </SectionCard>
          </div>

          <div className="space-y-6">
            <div className="border border-slate-200 bg-white p-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
                <User size={14} className="text-pink-600" />
                Employee
              </h3>
              {selectedEmployee ? (
                <div className="space-y-1">
                  <p className="font-semibold text-slate-900">{selectedEmployee.name}</p>
                  <p className="text-xs text-slate-400 font-mono">{selectedEmployee.employeeNumber}</p>
                  {selectedEmployee.department && <p className="text-sm text-slate-500 mt-1">{selectedEmployee.department}</p>}
                </div>
              ) : (
                <p className="text-sm text-slate-400">Select an employee to see their details here.</p>
              )}
            </div>

            {formData.projectId && (
              <div className="border border-slate-200 bg-white p-6">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
                  <FolderKanban size={14} className="text-pink-600" />
                  Project
                </h3>
                <p className="text-sm text-slate-700">
                  {projects.find((p) => p.id === formData.projectId)?.projectName}
                </p>
              </div>
            )}

            <div className="border border-pink-200 bg-pink-50 p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-pink-700 mb-2">Amount to Reimburse</h3>
              <p className="text-2xl font-bold text-pink-900 tabular-nums">{formatPrice(formData.amount)}</p>
            </div>
          </div>
        </div>

        <div className="flex gap-3 justify-end mt-6">
          <Button type="button" variant="outline" onClick={() => router.push("/hr/reimbursements")} className="rounded-lg">
            Cancel
          </Button>
          <Button type="submit" disabled={submitting} className="rounded-lg">
            {submitting ? "Saving..." : reimbursementId ? "Update Request" : "Submit Request"}
          </Button>
        </div>
      </form>
    </div>
  );
}
