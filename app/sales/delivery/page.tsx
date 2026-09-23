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
import { Plus, Search, Edit, Trash2, Download } from "lucide-react";

interface Delivery {
  id: string;
  deliveryNumber: string;
  customer: { name: string };
  salesOrder: { soNumber: string; poNumber: string } | null;
  deliveryDate: string;
  vehicleNumber: string | null;
  status: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-800",
  in_transit: "bg-blue-100 text-blue-800",
  delivered: "bg-amber-100 text-amber-800",
  accepted: "bg-green-100 text-green-800",
  cancelled: "bg-gray-100 text-gray-800",
};

export default function DeliveryPage() {
  const { status } = useSession();
  const router = useRouter();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
    if (status === "authenticated") {
      fetchDeliveries();
    }
  }, [status, router]);

  const fetchDeliveries = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/deliveries");
      if (!res.ok) throw new Error("Failed to fetch deliveries");
      setDeliveries(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading deliveries");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, number: string) => {
    if (confirm(`Delete delivery "${number}"?`)) {
      try {
        const res = await fetch(`/api/deliveries/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to delete");
        setDeliveries(deliveries.filter((d) => d.id !== id));
      } catch (err) {
        alert(err instanceof Error ? err.message : "Error deleting delivery");
      }
    }
  };

  const filtered = deliveries.filter(
    (d) =>
      d.deliveryNumber.toLowerCase().includes(search.toLowerCase()) ||
      d.customer.name.toLowerCase().includes(search.toLowerCase())
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
            <h1 className="text-3xl font-bold text-slate-900">Surat Jalan</h1>
            <p className="text-slate-600 mt-1">Delivery notes for goods shipped to customers</p>
          </div>
          <Button onClick={() => router.push("/sales/delivery/new")} className="gap-2">
            <Plus size={18} />
            New Delivery
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Search size={20} className="text-slate-400" />
              <Input
                placeholder="Search by delivery number or customer..."
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
            <CardTitle className="text-base">{filtered.length} Delivery(ies)</CardTitle>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-slate-500">No deliveries found</p>
                <Button variant="link" onClick={() => router.push("/sales/delivery/new")} className="mt-2">
                  Create first delivery
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Delivery #</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Sales Order</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Vehicle</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-mono text-sm font-medium">{d.deliveryNumber}</TableCell>
                        <TableCell>{d.customer.name}</TableCell>
                        <TableCell className="text-sm">
                          {d.salesOrder ? d.salesOrder.soNumber : "-"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {new Date(d.deliveryDate).toLocaleDateString("id-ID")}
                        </TableCell>
                        <TableCell className="text-sm">{d.vehicleNumber || "-"}</TableCell>
                        <TableCell>
                          <span
                            className={`px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide capitalize ${
                              STATUS_COLORS[d.status] || "bg-slate-100 text-slate-800"
                            }`}
                          >
                            {d.status.replace("_", " ")}
                          </span>
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <a href={`/api/deliveries/${d.id}/pdf`} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="sm">
                              <Download size={16} />
                            </Button>
                          </a>
                          <Button variant="ghost" size="sm" onClick={() => router.push(`/sales/delivery/${d.id}`)}>
                            <Edit size={16} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleDelete(d.id, d.deliveryNumber)}
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
