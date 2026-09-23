"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DocumentHeader, SectionCard, StatusLabel } from "@/components/ui/document-form";
import { ArrowLeft, CalendarDays, User } from "lucide-react";

interface EmployeeOption {
  id: string;
  employeeNumber: string;
  name: string;
  department: string | null;
}

interface LeaveFormProps {
  leaveId?: string;
}

const LEAVE_TYPES = ["Annual", "Sick", "Personal", "Maternity", "Unpaid"];
const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_TONE: Record<string, "slate" | "green" | "amber" | "red" | "blue"> = {
  pending: "amber",
  approved: "green",
  rejected: "red",
  cancelled: "slate",
};

export function LeaveForm({ leaveId }: LeaveFormProps) {
  const router = useRouter();
  const { status } = useSession();
  const [loading, setLoading] = useState(!!leaveId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [linkedEmployee, setLinkedEmployee] = useState<EmployeeOption | null>(null);

  const [formData, setFormData] = useState({
    employeeId: "",
    leaveType: "Annual",
    startDate: new Date().toISOString().split("T")[0],
    endDate: new Date().toISOString().split("T")[0],
    reason: "",
    docStatus: "pending",
    notes: "",
  });

  useEffect(() => {
    if (status === "authenticated") {
      fetchEmployees();
      if (leaveId) {
        fetchLeave();
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

  const fetchLeave = async () => {
    try {
      const res = await fetch(`/api/leaves/${leaveId}`);
      if (res.ok) {
        const data = await res.json();
        setLinkedEmployee(data.employee);
        setFormData({
          employeeId: data.employeeId,
          leaveType: data.leaveType,
          startDate: data.startDate.split("T")[0],
          endDate: data.endDate.split("T")[0],
          reason: data.reason || "",
          docStatus: data.status,
          notes: data.notes || "",
        });
      }
    } catch (err) {
      console.error("Error fetching leave:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const selectedEmployee = employees.find((e) => e.id === formData.employeeId) || linkedEmployee;

  const dayCount = () => {
    const start = new Date(formData.startDate);
    const end = new Date(formData.endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 0;
    return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (!formData.employeeId) throw new Error("Employee is required");
      if (new Date(formData.endDate) < new Date(formData.startDate)) throw new Error("End date must be after start date");

      const url = leaveId ? `/api/leaves/${leaveId}` : "/api/leaves";
      const method = leaveId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: formData.employeeId,
          leaveType: formData.leaveType,
          startDate: formData.startDate,
          endDate: formData.endDate,
          reason: formData.reason,
          status: formData.docStatus,
          notes: formData.notes,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save leave request");
      }

      router.push("/hr/leaves");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving leave request");
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
        Back to Leave Requests
      </button>

      <form onSubmit={handleSubmit}>
        <DocumentHeader
          icon={CalendarDays}
          eyebrow="Leave Request"
          title={leaveId ? `${formData.leaveType} Leave` : "New Leave Request"}
          gradient="from-lime-950 via-lime-900 to-slate-900"
          badge={leaveId && <StatusLabel label={formData.docStatus.replace(/_/g, " ")} tone={STATUS_TONE[formData.docStatus] || "slate"} />}
          actions={
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : leaveId ? "Update Request" : "Submit Request"}
            </Button>
          }
        />

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <SectionCard icon={CalendarDays} title="Leave Details" accentColor="text-lime-700">
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
                    disabled={!!leaveId}
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-lime-500 disabled:bg-slate-100"
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
                  <Label htmlFor="leaveType" className="text-xs text-slate-500">
                    Leave Type *
                  </Label>
                  <select
                    id="leaveType"
                    name="leaveType"
                    value={formData.leaveType}
                    onChange={handleChange}
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-lime-500"
                  >
                    {LEAVE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                {leaveId && (
                  <div className="space-y-1.5">
                    <Label htmlFor="docStatus" className="text-xs text-slate-500">
                      Status
                    </Label>
                    <select
                      id="docStatus"
                      name="docStatus"
                      value={formData.docStatus}
                      onChange={handleChange}
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-lime-500"
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="startDate" className="text-xs text-slate-500">
                    Start Date *
                  </Label>
                  <Input id="startDate" name="startDate" type="date" value={formData.startDate} onChange={handleChange} required className="rounded-lg" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="endDate" className="text-xs text-slate-500">
                    End Date *
                  </Label>
                  <Input id="endDate" name="endDate" type="date" value={formData.endDate} onChange={handleChange} required className="rounded-lg" />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="reason" className="text-xs text-slate-500">
                    Reason
                  </Label>
                  <textarea
                    id="reason"
                    name="reason"
                    value={formData.reason}
                    onChange={handleChange}
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-lime-500"
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
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-lime-500"
                  />
                </div>
              </div>
            </SectionCard>
          </div>

          <div className="space-y-6">
            <div className="border border-slate-200 bg-white p-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
                <User size={14} className="text-lime-700" />
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

            <div className="border border-lime-200 bg-lime-50 p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-lime-700 mb-2">Duration</h3>
              <p className="text-3xl font-bold text-lime-900 tabular-nums">
                {dayCount()} <span className="text-base font-medium">day{dayCount() !== 1 ? "s" : ""}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-3 justify-end mt-6">
          <Button type="button" variant="outline" onClick={() => router.push("/hr/leaves")} className="rounded-lg">
            Cancel
          </Button>
          <Button type="submit" disabled={submitting} className="rounded-lg">
            {submitting ? "Saving..." : leaveId ? "Update Request" : "Submit Request"}
          </Button>
        </div>
      </form>
    </div>
  );
}
