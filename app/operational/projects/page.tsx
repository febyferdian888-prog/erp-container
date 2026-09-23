"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Search, Edit, Trash2, FolderKanban, Activity, CheckCircle2, Wallet } from "lucide-react";

interface Project {
  id: string;
  projectNumber: string;
  projectName: string;
  status: string;
  budget: string;
  targetEndDate: string;
  customer: { name: string } | null;
  stages: { status: string; progressWeight: number }[];
  workOrders: { id: string }[];
  boms: { id: string }[];
}

const STATUS_STYLES: Record<string, string> = {
  planned: "bg-slate-100 text-slate-700 ring-slate-200",
  in_progress: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  on_hold: "bg-amber-100 text-amber-700 ring-amber-200",
  completed: "bg-blue-100 text-blue-700 ring-blue-200",
  cancelled: "bg-red-100 text-red-700 ring-red-200",
};

function progressOf(p: Project) {
  const totalWeight = p.stages.reduce((sum, s) => sum + Number(s.progressWeight || 0), 0);
  if (!totalWeight) return 0;
  const done = p.stages
    .filter((s) => s.status === "completed")
    .reduce((sum, s) => sum + Number(s.progressWeight || 0), 0);
  return Math.round((done / totalWeight) * 100);
}

export default function ProjectsPage() {
  const { status } = useSession();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
    if (status === "authenticated") {
      fetchProjects();
    }
  }, [status, router]);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to fetch projects");
      const data = await res.json();
      setProjects(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading projects");
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Delete project "${name}"?`)) {
      try {
        const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to delete");
        setProjects(projects.filter((p) => p.id !== id));
      } catch (err) {
        alert(err instanceof Error ? err.message : "Error deleting project");
      }
    }
  };

  const filtered = projects.filter(
    (p) =>
      p.projectName.toLowerCase().includes(search.toLowerCase()) ||
      p.projectNumber.toLowerCase().includes(search.toLowerCase())
  );

  const formatPrice = (value: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(value);

  const inProgress = projects.filter((p) => p.status === "in_progress").length;
  const completed = projects.filter((p) => p.status === "completed").length;
  const totalBudget = projects.reduce((sum, p) => sum + Number(p.budget || 0), 0);

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
              <FolderKanban className="text-emerald-600" size={28} />
              Projects
            </h1>
            <p className="text-slate-600 mt-1">Container fabrication and modification projects</p>
          </div>
          <Button
            onClick={() => router.push("/operational/projects/new")}
            className="gap-2"
          >
            <Plus size={18} />
            New Project
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-slate-400" />
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">In Progress</p>
            </div>
            <p className="text-xl font-semibold text-slate-900 tabular-nums mt-3">{inProgress}</p>
          </div>
          <div className="border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-slate-400" />
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Completed</p>
            </div>
            <p className="text-xl font-semibold text-slate-900 tabular-nums mt-3">{completed}</p>
          </div>
          <div className="border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <Wallet size={14} className="text-slate-400" />
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Total Budget</p>
            </div>
            <p className="text-xl font-semibold text-slate-900 tabular-nums mt-3">{formatPrice(totalBudget)}</p>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Search size={20} className="text-slate-400" />
              <Input
                placeholder="Search by project name or number..."
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
            <p className="text-slate-500">No projects found</p>
            <Button variant="link" onClick={() => router.push("/operational/projects/new")} className="mt-2">
              Create first project
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filtered.map((p) => (
              <div
                key={p.id}
                onClick={() => router.push(`/operational/projects/${p.id}`)}
                className="border border-slate-200 bg-white p-5 cursor-pointer hover:border-slate-400 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-mono text-slate-400">{p.projectNumber}</p>
                    <h3 className="font-semibold text-slate-900 mt-0.5">{p.projectName}</h3>
                    <p className="text-sm text-slate-500 mt-0.5">{p.customer?.name || "Internal project"}</p>
                  </div>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide shrink-0 ${
                      STATUS_STYLES[p.status] || "bg-slate-100 text-slate-700 ring-slate-200"
                    }`}
                  >
                    {p.status.replace(/_/g, " ")}
                  </span>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>Progress</span>
                    <span className="font-medium tabular-nums">{progressOf(p)}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${progressOf(p)}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
                  <span>{p.workOrders.length} WO • {p.boms.length} BOM</span>
                  <span className="font-semibold text-slate-700 tabular-nums">{formatPrice(Number(p.budget))}</span>
                </div>

                <div className="flex justify-end gap-1 mt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/operational/projects/${p.id}`);
                    }}
                  >
                    <Edit size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(p.id, p.projectName);
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
