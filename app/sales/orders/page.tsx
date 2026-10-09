"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ACTIVE_ORDER_VALUE_LABEL, ACTIVE_ORDER_VALUE_HINT } from "@/lib/sales-metrics";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  ShoppingCart,
  Wallet,
  Clock,
  CheckCircle2,
} from "lucide-react";

interface SalesOrder {
  id: string;
  soNumber: string;
  poNumber: string;
  poDate: string;
  status: string;
  progress?: { key: string; label: string; tone: string };
  customer: { name: string; code: string };
  quotation: { number: string } | null;
  items: { quantity: string; unitPrice: string; subtotal: string }[];
}

const PROGRESS_STYLES: Record<string, string> = {
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
  indigo: "bg-indigo-100 text-indigo-700 ring-indigo-200",
  amber: "bg-amber-100 text-amber-700 ring-amber-200",
  blue: "bg-blue-100 text-blue-700 ring-blue-200",
  green: "bg-green-100 text-green-700 ring-green-200",
  red: "bg-red-100 text-red-700 ring-red-200",
};

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 ring-slate-200",
  confirmed: "bg-indigo-100 text-indigo-700 ring-indigo-200",
  partially_delivered: "bg-amber-100 text-amber-700 ring-amber-200",
  delivered: "bg-blue-100 text-blue-700 ring-blue-200",
  invoiced: "bg-green-100 text-green-700 ring-green-200",
  cancelled: "bg-red-100 text-red-700 ring-red-200",
};

export default function SalesOrdersPage() {
  return (
    <Suspense fallback={<DashboardLayout><div className="flex items-center justify-center h-96"><p className="text-slate-500">Loading...</p></div></DashboardLayout>}>
      <SalesOrdersContent />
    </Suspense>
  );
}

function SalesOrdersContent() {
  const { status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const filterActive = searchParams.get("status") === "active";
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
    if (status === "authenticated") {
      fetchOrders();
    }
  }, [status, router]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/sales-orders");
      if (!res.ok) throw new Error("Failed to fetch sales orders");
      const data = await res.json();
      setOrders(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading sales orders");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, number: string) => {
    if (confirm(`Delete sales order "${number}"?`)) {
      try {
        const res = await fetch(`/api/sales-orders/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to delete");
        setOrders(orders.filter((o) => o.id !== id));
      } catch (err) {
        alert(err instanceof Error ? err.message : "Error deleting sales order");
      }
    }
  };

  const filtered = orders
    .filter(
      (o) =>
        o.soNumber.toLowerCase().includes(search.toLowerCase()) ||
        o.customer.name.toLowerCase().includes(search.toLowerCase()) ||
        o.poNumber.toLowerCase().includes(search.toLowerCase())
    )
    .filter((o) => !filterActive || o.progress?.key !== "done");

  const orderTotal = (o: SalesOrder) => o.items.reduce((sum, item) => sum + Number(item.subtotal), 0);
  const formatPrice = (value: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(value);

  // Driven by the same lib/so-progress.ts signals as the status badge below
  // (PO/receipt/delivery/invoice), not the legacy `status` column — that
  // column can sit at "draft" indefinitely while real work is happening
  // (Tahap 5 audit), which silently zeroed this out. Must always agree with
  // the dashboard's "Pesanan aktif" tile (app/api/reports/dashboard/route.ts).
  const activeOrders = orders.filter((o) => o.progress?.key !== "done");
  const activeOrderValue = activeOrders.reduce((sum, o) => sum + orderTotal(o), 0);
  const totalValue = orders.reduce((sum, o) => sum + orderTotal(o), 0);
  const inProgress = activeOrders.length;
  const completed = orders.filter((o) => o.status === "invoiced").length;

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
              <ShoppingCart className="text-indigo-600" size={28} />
              Sales Orders
            </h1>
            <p className="text-slate-600 mt-1">Confirmed customer orders, from quotation to fulfillment</p>
          </div>
          <Button
            onClick={() => router.push("/sales/orders/new")}
            className="gap-2"
          >
            <Plus size={18} />
            New Sales Order
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="border border-slate-200 bg-white p-5" title={ACTIVE_ORDER_VALUE_HINT}>
            <div className="flex items-center gap-2">
              <Wallet size={14} className="text-slate-400" />
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{ACTIVE_ORDER_VALUE_LABEL}</p>
            </div>
            <p className="text-xl font-semibold text-slate-900 tabular-nums mt-3">{formatPrice(activeOrderValue)}</p>
            <p className="text-[11px] text-slate-400 mt-1">Belum ditagih sama sekali</p>
          </div>
          <div className="border border-slate-200 bg-white p-5" title="Total nilai seluruh pesanan tercatat, termasuk yang sudah ditagih atau dibatalkan.">
            <div className="flex items-center gap-2">
              <Wallet size={14} className="text-slate-400" />
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Total Nilai Pesanan</p>
            </div>
            <p className="text-xl font-semibold text-slate-900 tabular-nums mt-3">{formatPrice(totalValue)}</p>
            <p className="text-[11px] text-slate-400 mt-1">Semua status, termasuk sudah ditagih</p>
          </div>
          <div className="border border-slate-200 bg-white p-5" title="Pesanan yang sudah dikonfirmasi dan masih berjalan (belum ditagih sama sekali).">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-slate-400" />
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Sedang Berjalan</p>
            </div>
            <p className="text-xl font-semibold text-slate-900 tabular-nums mt-3">{inProgress}</p>
          </div>
          <div className="border border-slate-200 bg-white p-5" title="Pesanan yang sudah memiliki invoice. Tidak berarti seluruh pekerjaan sudah selesai atau lunas.">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-slate-400" />
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Sudah Ditagih</p>
            </div>
            <p className="text-xl font-semibold text-slate-900 tabular-nums mt-3">{completed}</p>
          </div>
        </div>
        {filterActive && (
          <div className="flex items-center justify-between rounded-md border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm text-indigo-800">
            <span>Menampilkan hanya pesanan aktif (belum ditagih).</span>
            <button className="underline" onClick={() => router.push("/sales/orders")}>Hapus filter</button>
          </div>
        )}

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Search size={20} className="text-slate-400" />
              <Input
                placeholder="Search by SO number, customer, or PO number..."
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

        <div className="border border-slate-200 bg-white overflow-hidden">
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-500">No sales orders found</p>
              <Button variant="link" onClick={() => router.push("/sales/orders/new")} className="mt-2">
                Create first sales order
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/60 text-xs uppercase tracking-wide text-slate-400">
                    <th className="text-left px-5 py-3 font-medium">SO Number</th>
                    <th className="text-left px-5 py-3 font-medium">Customer</th>
                    <th className="text-left px-5 py-3 font-medium">Customer PO</th>
                    <th className="text-left px-5 py-3 font-medium">Source</th>
                    <th className="text-right px-5 py-3 font-medium">Total</th>
                    <th className="text-left px-5 py-3 font-medium">Status</th>
                    <th className="text-right px-5 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((o) => (
                    <tr key={o.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                      <td className="px-5 py-3 font-mono text-sm text-slate-700">{o.soNumber}</td>
                      <td className="px-5 py-3 font-medium text-slate-900">{o.customer.name}</td>
                      <td className="px-5 py-3 text-slate-500">{o.poNumber}</td>
                      <td className="px-5 py-3 text-slate-500">{o.quotation ? o.quotation.number : "Manual"}</td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums text-slate-900">
                        {formatPrice(orderTotal(o))}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${
                            (o.progress && PROGRESS_STYLES[o.progress.tone]) || STATUS_STYLES[o.status] || "bg-slate-100 text-slate-700 ring-slate-200"
                          }`}
                        >
                          {o.progress?.label || o.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right space-x-1">
                        <Button variant="ghost" size="sm" onClick={() => router.push(`/sales/orders/${o.id}`)}>
                          <Edit size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleDelete(o.id, o.soNumber)}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
