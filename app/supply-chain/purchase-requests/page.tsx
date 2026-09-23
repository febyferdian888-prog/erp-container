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
import { Plus, Search, Edit, Trash2, ClipboardList } from "lucide-react";

interface PurchaseRequest {
  id: string;
  requestNumber: string;
  requestDate: string;
  department: string | null;
  requestedBy: string | null;
  status: string;
  project: { projectName: string } | null;
  items: { quantity: string; estimatedPrice: string }[];
  purchaseOrders: { id: string; poNumber: string }[];
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-800",
  pending_approval: "bg-amber-100 text-amber-800",
  approved: "bg-blue-100 text-blue-800",
  rejected: "bg-red-100 text-red-800",
  converted_to_po: "bg-green-100 text-green-800",
  cancelled: "bg-slate-100 text-slate-500",
};

export default function PurchaseRequestsPage() {
  const { status } = useSession();
  const router = useRouter();
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
    if (status === "authenticated") {
      fetchRequests();
    }
  }, [status, router]);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/purchase-requests");
      if (!res.ok) throw new Error("Failed to fetch purchase requests");
      const data = await res.json();
      setRequests(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading purchase requests");
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, number: string) => {
    if (confirm(`Delete purchase request "${number}"?`)) {
      try {
        const res = await fetch(`/api/purchase-requests/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to delete");
        setRequests(requests.filter((r) => r.id !== id));
      } catch (err) {
        alert(err instanceof Error ? err.message : "Error deleting purchase request");
      }
    }
  };

  const filtered = requests.filter(
    (r) =>
      r.requestNumber.toLowerCase().includes(search.toLowerCase()) ||
      (r.department || "").toLowerCase().includes(search.toLowerCase())
  );

  const formatPrice = (value: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(value);

  const estimatedTotal = (r: PurchaseRequest) =>
    r.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.estimatedPrice), 0);

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
              <ClipboardList className="text-purple-600" size={28} />
              Purchase Requests
            </h1>
            <p className="text-slate-600 mt-1">Internal requests before a PO is issued to a vendor</p>
          </div>
          <Button
            onClick={() => router.push("/supply-chain/purchase-requests/new")}
            className="gap-2"
          >
            <Plus size={18} />
            New Request
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Search size={20} className="text-slate-400" />
              <Input
                placeholder="Search by number or department..."
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
            <CardTitle className="text-base">{filtered.length} Purchase Request(s)</CardTitle>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-slate-500">No purchase requests found</p>
                <Button
                  variant="link"
                  onClick={() => router.push("/supply-chain/purchase-requests/new")}
                  className="mt-2"
                >
                  Create first request
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Number</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Requested By</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead className="text-right">Est. Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-sm">{r.requestNumber}</TableCell>
                        <TableCell>{new Date(r.requestDate).toLocaleDateString("id-ID")}</TableCell>
                        <TableCell>{r.department || "-"}</TableCell>
                        <TableCell>{r.requestedBy || "-"}</TableCell>
                        <TableCell>{r.project?.projectName || "-"}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatPrice(estimatedTotal(r))}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${
                              STATUS_STYLES[r.status] || "bg-slate-100 text-slate-800"
                            }`}
                          >
                            {r.status.replace(/_/g, " ")}
                          </span>
                          {r.purchaseOrders.length > 0 && (
                            <div className="text-xs text-slate-500 mt-1">
                              PO: {r.purchaseOrders.map((po) => po.poNumber).join(", ")}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push(`/supply-chain/purchase-requests/${r.id}`)}
                          >
                            <Edit size={16} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleDelete(r.id, r.requestNumber)}
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
