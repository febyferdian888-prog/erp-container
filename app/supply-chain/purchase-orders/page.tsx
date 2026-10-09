"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Search, Edit, Trash2, Truck } from "lucide-react";

interface PurchaseOrder {
  id: string;
  poNumber: string;
  poDate: string;
  status: string;
  supplier: { name: string; code: string };
  purchaseRequest: { requestNumber: string } | null;
  salesOrder: { id: string; soNumber: string } | null;
  salesOrders?: { id: string; soNumber: string }[];
  stage?: { label: string; next: string; tone: string };
  items: { quantity: string; unitPrice: string; subtotal: string }[];
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-800",
  sent: "bg-blue-100 text-blue-800",
  confirmed: "bg-cyan-100 text-cyan-800",
  partial_received: "bg-amber-100 text-amber-800",
  received: "bg-green-100 text-green-800",
  invoiced: "bg-purple-100 text-purple-800",
  cancelled: "bg-red-100 text-red-800",
};

export default function PurchaseOrdersPage() {
  const { status } = useSession();
  const router = useRouter();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
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
      const res = await fetch("/api/purchase-orders");
      if (!res.ok) throw new Error("Failed to fetch purchase orders");
      const data = await res.json();
      setOrders(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading purchase orders");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, number: string) => {
    if (confirm(`Delete purchase order "${number}"?`)) {
      try {
        const res = await fetch(`/api/purchase-orders/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to delete");
        setOrders(orders.filter((o) => o.id !== id));
      } catch (err) {
        alert(err instanceof Error ? err.message : "Error deleting purchase order");
      }
    }
  };

  const filtered = orders.filter(
    (o) =>
      o.poNumber.toLowerCase().includes(search.toLowerCase()) ||
      o.supplier.name.toLowerCase().includes(search.toLowerCase())
  );

  const formatPrice = (value: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(value);

  const orderTotal = (o: PurchaseOrder) =>
    o.items.reduce((sum, item) => sum + Number(item.subtotal), 0);

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
              <Truck className="text-orange-600" size={28} />
              Purchase Orders
            </h1>
            <p className="text-slate-600 mt-1">Orders issued to vendors</p>
          </div>
          <Button
            onClick={() => router.push("/supply-chain/purchase-orders/new")}
            className="gap-2"
          >
            <Plus size={18} />
            New Order
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Search size={20} className="text-slate-400" />
              <Input
                placeholder="Search by number or vendor..."
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{filtered.length} Purchase Order(s)</CardTitle>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-slate-500">No purchase orders found</p>
                <Button
                  variant="link"
                  onClick={() => router.push("/supply-chain/purchase-orders/new")}
                  className="mt-2"
                >
                  Create first order
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PO Number</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Source PR</TableHead>
                      <TableHead>Sales Order</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Status / langkah berikutnya</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="font-mono text-sm">{o.poNumber}</TableCell>
                        <TableCell>{new Date(o.poDate).toLocaleDateString("id-ID")}</TableCell>
                        <TableCell className="font-medium">{o.supplier.name}</TableCell>
                        <TableCell className="text-sm text-slate-500">
                          {o.purchaseRequest?.requestNumber || "-"}
                        </TableCell>
                        <TableCell className="text-sm text-slate-500">
                          {(o.salesOrders && o.salesOrders.length ? o.salesOrders : o.salesOrder ? [o.salesOrder] : []).map((so, i) => (
                            <span key={so.id}>{i > 0 ? ", " : ""}<a href={`/supply-chain/sales-orders/${so.id}`} className="hover:underline">{so.soNumber}</a></span>
                          ))}
                          {!(o.salesOrders && o.salesOrders.length) && !o.salesOrder && "-"}
                        </TableCell>
                        <TableCell className="text-right font-semibold">{formatPrice(orderTotal(o))}</TableCell>
                        <TableCell>
                          <span
                            className={`px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${
                              STATUS_STYLES[o.status] || "bg-slate-100 text-slate-800"
                            }`}
                          >
                            {o.status.replace(/_/g, " ")}
                          </span>
                          {o.stage && (
                            <div className="mt-1 max-w-[240px] text-xs leading-tight">
                              <p className="font-medium text-slate-800">{o.stage.label}</p>
                              <p className="text-slate-500">{o.stage.next}</p>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push(`/supply-chain/purchase-orders/${o.id}`)}
                          >
                            <Edit size={16} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleDelete(o.id, o.poNumber)}
                          >
                            <Trash2 size={16} />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
