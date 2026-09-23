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
import { Plus, Search, Eye, Trash2, PackageCheck } from "lucide-react";

interface GoodsReceipt {
  id: string;
  receiptNumber: string;
  receiptDate: string;
  status: string;
  purchaseOrder: { poNumber: string; supplier: { name: string } };
  items: { condition: string }[];
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-800",
  received: "bg-blue-100 text-blue-800",
  inspected: "bg-cyan-100 text-cyan-800",
  accepted: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

export default function GoodsReceiptsPage() {
  const { status } = useSession();
  const router = useRouter();
  const [receipts, setReceipts] = useState<GoodsReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
    if (status === "authenticated") {
      fetchReceipts();
    }
  }, [status, router]);

  const fetchReceipts = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/goods-receipts");
      if (!res.ok) throw new Error("Failed to fetch goods receipts");
      const data = await res.json();
      setReceipts(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading goods receipts");
      setReceipts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, number: string) => {
    if (confirm(`Delete goods receipt "${number}"? This reverses the received quantity on its PO.`)) {
      try {
        const res = await fetch(`/api/goods-receipts/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to delete");
        setReceipts(receipts.filter((r) => r.id !== id));
      } catch (err) {
        alert(err instanceof Error ? err.message : "Error deleting goods receipt");
      }
    }
  };

  const filtered = receipts.filter(
    (r) =>
      r.receiptNumber.toLowerCase().includes(search.toLowerCase()) ||
      r.purchaseOrder.poNumber.toLowerCase().includes(search.toLowerCase())
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
              <PackageCheck className="text-teal-600" size={28} />
              Goods Receipts
            </h1>
            <p className="text-slate-600 mt-1">Confirm goods received from vendors against a PO</p>
          </div>
          <Button
            onClick={() => router.push("/supply-chain/goods-receipts/new")}
            className="gap-2"
          >
            <Plus size={18} />
            Record Receipt
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Search size={20} className="text-slate-400" />
              <Input
                placeholder="Search by receipt or PO number..."
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
            <CardTitle className="text-base">{filtered.length} Goods Receipt(s)</CardTitle>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-slate-500">No goods receipts found</p>
                <Button
                  variant="link"
                  onClick={() => router.push("/supply-chain/goods-receipts/new")}
                  className="mt-2"
                >
                  Record first receipt
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Receipt Number</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>PO Number</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-sm">{r.receiptNumber}</TableCell>
                        <TableCell>{new Date(r.receiptDate).toLocaleDateString("id-ID")}</TableCell>
                        <TableCell>{r.purchaseOrder.poNumber}</TableCell>
                        <TableCell className="font-medium">{r.purchaseOrder.supplier.name}</TableCell>
                        <TableCell className="text-sm text-slate-500">{r.items.length} line(s)</TableCell>
                        <TableCell>
                          <span
                            className={`px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${
                              STATUS_STYLES[r.status] || "bg-slate-100 text-slate-800"
                            }`}
                          >
                            {r.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push(`/supply-chain/goods-receipts/${r.id}`)}
                          >
                            <Eye size={16} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleDelete(r.id, r.receiptNumber)}
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
