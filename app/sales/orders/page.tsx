"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
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
  customer: { name: string; code: string };
  quotation: { number: string } | null;
  items: { quantity: string; unitPrice: string; subtotal: string }[];
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 ring-slate-200",
  confirmed: "bg-indigo-100 text-indigo-700 ring-indigo-200",
  partially_delivered: "bg-amber-100 text-amber-700 ring-amber-200",
  delivered: "bg-blue-100 text-blue-700 ring-blue-200",
  invoiced: "bg-green-100 text-green-700 ring-green-200",
  cancelled: "bg-red-100 text-red-700 ring-red-200",
};

export default function SalesOrdersPage() {
  const { status } = useSession();
  const router = useRouter();
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

  const filtered = orders.filter(
    (o) =>
      o.soNumber.toLowerCase().includes(search.toLowerCase()) ||
      o.customer.name.toLowerCase().includes(search.toLowerCase()) ||
      o.poNumber.toLowerCase().includes(search.toLowerCase())
  );

  const orderTotal = (o: SalesOrder) => o.items.reduce((sum, item) => sum + Number(item.subtotal), 0);
  const formatPrice = (value: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(value);

  const activeOrders = orders.filter((o) => !["invoiced", "cancelled"].includes(o.status));
  const totalValue = orders.reduce((sum, o) => sum + orderTotal(o), 0);
  const inProgress = orders.filter((o) => ["confirmed", "partially_delivered"].includes(o.status)).length;
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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <Wallet size={14} className="text-slate-400" />
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Active Order Value</p>
            </div>
            <p className="text-xl font-semibold text-slate-900 tabular-nums mt-3">{formatPrice(totalValue)}</p>
          </div>
          <div className="border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-slate-400" />
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">In Progress</p>
            </div>
            <p className="text-xl font-semibold text-slate-900 tabular-nums mt-3">{inProgress}</p>
          </div>
          <div className="border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-slate-400" />
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Fully Invoiced</p>
            </div>
            <p className="text-xl font-semibold text-slate-900 tabular-nums mt-3">{completed}</p>
          </div>
        </div>

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
                            STATUS_STYLES[o.status] || "bg-slate-100 text-slate-700 ring-slate-200"
                          }`}
                        >
                          {o.status.replace(/_/g, " ")}
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
