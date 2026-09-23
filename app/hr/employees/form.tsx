"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard, StatusLabel } from "@/components/ui/document-form";
import { ArrowLeft, User, MapPin, Briefcase } from "lucide-react";

interface EmployeeFormProps {
  employeeId?: string;
  companyId: string;
}

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "resigned", label: "Resigned" },
];

const STATUS_TONE: Record<string, "slate" | "green" | "amber" | "red" | "blue"> = {
  active: "green",
  inactive: "slate",
  resigned: "red",
};

function initialsOf(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

export function EmployeeForm({ employeeId, companyId }: EmployeeFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(!!employeeId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [employeeNumber, setEmployeeNumber] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    province: "",
    country: "Indonesia",
    postalCode: "",
    dateOfBirth: "",
    gender: "",
    maritalStatus: "",
    department: "",
    position: "",
    status: "active",
    hireDate: new Date().toISOString().split("T")[0],
    resignDate: "",
    notes: "",
  });

  useEffect(() => {
    if (employeeId) fetchEmployee();
  }, [employeeId]);

  const fetchEmployee = async () => {
    try {
      const res = await fetch(`/api/employees/${employeeId}`);
      if (res.ok) {
        const data = await res.json();
        setEmployeeNumber(data.employeeNumber);
        setFormData({
          name: data.name,
          email: data.email || "",
          phone: data.phone || "",
          address: data.address || "",
          city: data.city || "",
          province: data.province || "",
          country: data.country || "Indonesia",
          postalCode: data.postalCode || "",
          dateOfBirth: data.dateOfBirth ? data.dateOfBirth.split("T")[0] : "",
          gender: data.gender || "",
          maritalStatus: data.maritalStatus || "",
          department: data.department || "",
          position: data.position || "",
          status: data.status,
          hireDate: data.hireDate.split("T")[0],
          resignDate: data.resignDate ? data.resignDate.split("T")[0] : "",
          notes: data.notes || "",
        });
      }
    } catch (err) {
      console.error("Error fetching employee:", err);
    } finally {
      setLoading(false);
    }
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
      if (!formData.name) throw new Error("Name is required");

      const url = employeeId ? `/api/employees/${employeeId}` : "/api/employees";
      const method = employeeId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, ...formData }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save employee");
      }

      router.push("/hr/employees");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving employee");
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
        Back to Employees
      </button>

      <form onSubmit={handleSubmit}>
        <div className="border-b border-slate-200 pb-6 mb-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-300 text-sm font-semibold text-slate-700">
                {formData.name ? initialsOf(formData.name) : <User size={18} />}
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                  {employeeId ? employeeNumber : "New Employee"}
                </p>
                <h1 className="text-[26px] font-semibold tracking-tight text-slate-900 leading-tight">{formData.name || "Employee Profile"}</h1>
                {formData.position && <p className="text-sm text-slate-500 mt-0.5">{formData.position}</p>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {employeeId && <StatusLabel label={formData.status} tone={STATUS_TONE[formData.status] || "slate"} />}
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : employeeId ? "Update Employee" : "Create Employee"}
              </Button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SectionCard icon={User} title="Personal Information" accentColor="text-sky-600">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="name" className="text-xs text-slate-500">
                  Full Name *
                </Label>
                <Input id="name" name="name" value={formData.name} onChange={handleChange} required className="rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs text-slate-500">
                  Email
                </Label>
                <Input id="email" name="email" type="email" value={formData.email} onChange={handleChange} className="rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-xs text-slate-500">
                  Phone
                </Label>
                <Input id="phone" name="phone" value={formData.phone} onChange={handleChange} className="rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dateOfBirth" className="text-xs text-slate-500">
                  Date of Birth
                </Label>
                <Input id="dateOfBirth" name="dateOfBirth" type="date" value={formData.dateOfBirth} onChange={handleChange} className="rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gender" className="text-xs text-slate-500">
                  Gender
                </Label>
                <select
                  id="gender"
                  name="gender"
                  value={formData.gender}
                  onChange={handleChange}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="">Select...</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="maritalStatus" className="text-xs text-slate-500">
                  Marital Status
                </Label>
                <select
                  id="maritalStatus"
                  name="maritalStatus"
                  value={formData.maritalStatus}
                  onChange={handleChange}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="">Select...</option>
                  <option value="Single">Single</option>
                  <option value="Married">Married</option>
                  <option value="Divorced">Divorced</option>
                </select>
              </div>
            </div>
          </SectionCard>

          <SectionCard icon={Briefcase} title="Employment" accentColor="text-sky-600">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="department" className="text-xs text-slate-500">
                  Department
                </Label>
                <Input id="department" name="department" placeholder="e.g., Workshop, Sales" value={formData.department} onChange={handleChange} className="rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="position" className="text-xs text-slate-500">
                  Position
                </Label>
                <Input id="position" name="position" placeholder="e.g., Welder, Sales Executive" value={formData.position} onChange={handleChange} className="rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hireDate" className="text-xs text-slate-500">
                  Hire Date *
                </Label>
                <Input id="hireDate" name="hireDate" type="date" value={formData.hireDate} onChange={handleChange} required className="rounded-lg" />
              </div>
              {employeeId && (
                <div className="space-y-1.5">
                  <Label htmlFor="status" className="text-xs text-slate-500">
                    Status
                  </Label>
                  <select
                    id="status"
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {employeeId && formData.status === "resigned" && (
                <div className="space-y-1.5">
                  <Label htmlFor="resignDate" className="text-xs text-slate-500">
                    Resign Date
                  </Label>
                  <Input id="resignDate" name="resignDate" type="date" value={formData.resignDate} onChange={handleChange} className="rounded-lg" />
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
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard icon={MapPin} title="Address" accentColor="text-sky-600" className="lg:col-span-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="address" className="text-xs text-slate-500">
                  Street Address
                </Label>
                <Input id="address" name="address" value={formData.address} onChange={handleChange} className="rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="city" className="text-xs text-slate-500">
                  City
                </Label>
                <Input id="city" name="city" value={formData.city} onChange={handleChange} className="rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="province" className="text-xs text-slate-500">
                  Province
                </Label>
                <Input id="province" name="province" value={formData.province} onChange={handleChange} className="rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="postalCode" className="text-xs text-slate-500">
                  Postal Code
                </Label>
                <Input id="postalCode" name="postalCode" value={formData.postalCode} onChange={handleChange} className="rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="country" className="text-xs text-slate-500">
                  Country
                </Label>
                <Input id="country" name="country" value={formData.country} onChange={handleChange} className="rounded-lg" />
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="flex gap-3 justify-end mt-6">
          <Button type="button" variant="outline" onClick={() => router.push("/hr/employees")} className="rounded-lg">
            Cancel
          </Button>
          <Button type="submit" disabled={submitting} className="rounded-lg">
            {submitting ? "Saving..." : employeeId ? "Update Employee" : "Create Employee"}
          </Button>
        </div>
      </form>
    </div>
  );
}
