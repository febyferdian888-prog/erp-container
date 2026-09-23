"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard-layout";
import {
  BarChart3,
  FileText,
  ShoppingCart,
  Receipt,
  Truck,
  ReceiptText,
  FolderKanban,
  Users2,
  CalendarDays,
  Wallet,
} from "lucide-react";

interface DashboardData {
  sales: {
    quotationsCount: number;
    quotationsValue: number;
    salesOrdersCount: number;
    salesOrdersValue: number;
    invoicesCount: number;
    invoicesTotal: number;
    invoicesOutstanding: number;
  };
  procurement: {
    poCount: number;
    poValue: number;
    billsCount: number;
    billsTotal: number;
    billsOutstanding: number;
  };
  projects: {
    total: number;
    byStatus: Record<string, number>;
    budgetTotal: number;
  };
  hr: {
    activeEmployees: number;
    pendingLeaves: number;
    pendingReimbursementsValue: number;
    pendingReimbursementsCount: number;
  };
}

const PROJECT_STATUS_COLORS: Record<string, string> = {
  planned: "bg-slate-400",
  in_progress: "bg-emerald-500",
  on_hold: "bg-amber-500",
  completed: "bg-blue-500",
  cancelled: "bg-red-400",
};

const PROJECT_STATUS_LABELS: Record<string, string> = {
  planned: "Planned",
  in_progress: "In Progress",
  on_hold: "On Hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

function StatCard({
  icon: Icon,
  label,
  value,
  sublabel,
}: {
  icon: any;
  label: string;
  value: string;
  sublabel?: string;
  accent?: string;
}) {
  return (
    <div className="border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <Icon size={14} className="text-slate-400" />
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      </div>
      <p className="text-2xl font-semibold text-slate-900 tabular-nums mt-3">{value}</p>
      {sublabel && <p className="text-xs text-slate-400 mt-1">{sublabel}</p>}
    </div>
  );
}

function FunnelBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const formatPrice = (price: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0, notation: "compact" }).format(price);
  const pct = max > 0 ? Math.max((value / max) * 100, value > 0 ? 4 : 0) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-slate-600">{label}</span>
        <span className="font-semibold text-slate-900 tabular-nums">{formatPrice(value)}</span>
      </div>
      <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const { status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
    if (status === "authenticated") fetchData();
  }, [status, router]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/reports/dashboard");
      if (!res.ok) throw new Error("Failed to load reports");
      setData(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading reports");
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(price);

  if (status === "loading" || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <p className="text-slate-500">Loading...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !data) {
    return (
      <DashboardLayout>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">
          {error || "No data"}
        </div>
      </DashboardLayout>
    );
  }

  const funnelMax = Math.max(data.sales.quotationsValue, data.sales.salesOrdersValue, data.sales.invoicesTotal, 1);
  const totalProjectStatusCount = Object.values(data.projects.byStatus).reduce((a, b) => a + b, 0) || 1;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="text-slate-700" size={28} />
            Reports
          </h1>
          <p className="text-slate-600 mt-1">A live snapshot across sales, procurement, projects, and HR</p>
        </div>

        {/* Sales & Revenue */}
        <section className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Sales & Revenue</h2>
            <a href="/reports/sales" className="text-sm font-medium text-brand hover:underline">Pipeline, aging piutang/utang, dan margin →</a>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={FileText} label="Quotations" value={String(data.sales.quotationsCount)} sublabel={formatPrice(data.sales.quotationsValue)} accent="bg-slate-100 text-slate-600" />
            <StatCard icon={ShoppingCart} label="Sales Orders" value={String(data.sales.salesOrdersCount)} sublabel={formatPrice(data.sales.salesOrdersValue)} accent="bg-indigo-100 text-indigo-600" />
            <StatCard icon={Receipt} label="Invoices Issued" value={String(data.sales.invoicesCount)} sublabel={formatPrice(data.sales.invoicesTotal)} accent="bg-blue-100 text-blue-600" />
            <StatCard icon={Wallet} label="Accounts Receivable" value={formatPrice(data.sales.invoicesOutstanding)} sublabel="Outstanding from customers" accent="bg-amber-100 text-amber-600" />
          </div>

          <div className="border border-slate-200 bg-white p-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">Sales Funnel</h3>
            <div className="space-y-4">
              <FunnelBar label="Quotations" value={data.sales.quotationsValue} max={funnelMax} color="bg-slate-400" />
              <FunnelBar label="Sales Orders" value={data.sales.salesOrdersValue} max={funnelMax} color="bg-indigo-500" />
              <FunnelBar label="Invoiced" value={data.sales.invoicesTotal} max={funnelMax} color="bg-blue-500" />
            </div>
          </div>
        </section>

        {/* Procurement */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Procurement & Payables</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard icon={Truck} label="Purchase Orders" value={String(data.procurement.poCount)} sublabel={formatPrice(data.procurement.poValue)} accent="bg-orange-100 text-orange-600" />
            <StatCard icon={ReceiptText} label="Vendor Bills" value={String(data.procurement.billsCount)} sublabel={formatPrice(data.procurement.billsTotal)} accent="bg-rose-100 text-rose-600" />
            <StatCard icon={Wallet} label="Accounts Payable" value={formatPrice(data.procurement.billsOutstanding)} sublabel="Outstanding to vendors" accent="bg-red-100 text-red-600" />
          </div>
        </section>

        {/* Projects */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Projects</h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <StatCard icon={FolderKanban} label="Total Projects" value={String(data.projects.total)} sublabel={`Budget ${formatPrice(data.projects.budgetTotal)}`} accent="bg-emerald-100 text-emerald-600" />
            <div className="lg:col-span-2 border border-slate-200 bg-white p-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">Status Breakdown</h3>
              {data.projects.total === 0 ? (
                <p className="text-sm text-slate-400">No projects yet.</p>
              ) : (
                <>
                  <div className="flex h-3 w-full rounded-full overflow-hidden bg-slate-100">
                    {Object.entries(data.projects.byStatus).map(([key, count]) => (
                      <div
                        key={key}
                        className={PROJECT_STATUS_COLORS[key] || "bg-slate-400"}
                        style={{ width: `${(count / totalProjectStatusCount) * 100}%` }}
                        title={`${key}: ${count}`}
                      />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4 text-sm">
                    {Object.entries(data.projects.byStatus).map(([key, count]) => (
                      <div key={key} className="flex items-center gap-1.5">
                        <span className={`h-2.5 w-2.5 rounded-full ${PROJECT_STATUS_COLORS[key] || "bg-slate-400"}`} />
                        <span className="text-slate-600">{PROJECT_STATUS_LABELS[key] || key}</span>
                        <span className="font-semibold text-slate-900 tabular-nums">{count}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        {/* HR */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">HR</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard icon={Users2} label="Active Employees" value={String(data.hr.activeEmployees)} accent="bg-sky-100 text-sky-600" />
            <StatCard icon={CalendarDays} label="Pending Leave Requests" value={String(data.hr.pendingLeaves)} accent="bg-lime-100 text-lime-700" />
            <StatCard icon={Wallet} label="Pending Reimbursements" value={formatPrice(data.hr.pendingReimbursementsValue)} sublabel={`${data.hr.pendingReimbursementsCount} request(s)`} accent="bg-pink-100 text-pink-600" />
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
