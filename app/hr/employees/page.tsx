"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Search, Edit, Trash2, Users2 } from "lucide-react";

interface Employee {
  id: string;
  employeeNumber: string;
  name: string;
  department: string | null;
  position: string | null;
  status: string;
  email: string | null;
  phone: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-100 text-green-700 ring-green-200",
  inactive: "bg-slate-100 text-slate-700 ring-slate-200",
  resigned: "bg-red-100 text-red-700 ring-red-200",
};

function initialsOf(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

export default function EmployeesPage() {
  const { status } = useSession();
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
    if (status === "authenticated") fetchEmployees();
  }, [status, router]);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/employees");
      if (!res.ok) throw new Error("Failed to fetch employees");
      setEmployees(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading employees");
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Delete employee "${name}"?`)) {
      try {
        const res = await fetch(`/api/employees/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to delete");
        setEmployees(employees.filter((e) => e.id !== id));
      } catch (err) {
        alert(err instanceof Error ? err.message : "Error deleting employee");
      }
    }
  };

  const filtered = employees.filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.employeeNumber.toLowerCase().includes(search.toLowerCase()) ||
      (e.department || "").toLowerCase().includes(search.toLowerCase())
  );

  if (status === "loading" || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <p className="text-slate-500">Loading...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              <Users2 className="text-sky-600" size={28} />
              Employees
            </h1>
            <p className="text-slate-600 mt-1">Employee master data and profiles</p>
          </div>
          <Button onClick={() => router.push("/hr/employees/new")} className="gap-2">
            <Plus size={18} />
            Add Employee
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Search size={20} className="text-slate-400" />
              <Input
                placeholder="Search by name, number, or department..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="border-0"
              />
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">{error}</div>
        )}

        {filtered.length === 0 ? (
          <div className="border border-slate-200 bg-white text-center py-12">
            <p className="text-slate-500">No employees found</p>
            <Button variant="link" onClick={() => router.push("/hr/employees/new")} className="mt-2">
              Add first employee
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((e) => (
              <div
                key={e.id}
                onClick={() => router.push(`/hr/employees/${e.id}`)}
                className="border border-slate-200 bg-white p-5 cursor-pointer hover:border-slate-400 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-300 text-sm font-semibold text-slate-700">
                    {initialsOf(e.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-slate-900 truncate">{e.name}</h3>
                    <p className="text-xs text-slate-400 font-mono">{e.employeeNumber}</p>
                  </div>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide shrink-0 ${
                      STATUS_STYLES[e.status] || "bg-slate-100 text-slate-700 ring-slate-200"
                    }`}
                  >
                    {e.status}
                  </span>
                </div>

                <div className="mt-3 text-sm text-slate-500 space-y-0.5">
                  <p>{e.position || "-"}{e.department ? ` · ${e.department}` : ""}</p>
                  {e.email && <p className="truncate">{e.email}</p>}
                  {e.phone && <p>{e.phone}</p>}
                </div>

                <div className="flex justify-end gap-1 mt-3 pt-3 border-t border-slate-100">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      router.push(`/hr/employees/${e.id}`);
                    }}
                  >
                    <Edit size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      handleDelete(e.id, e.name);
                    }}
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
