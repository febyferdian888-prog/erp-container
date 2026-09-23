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
import { Plus, Search, Edit, Trash2, Receipt } from "lucide-react";

interface Bill {
  id: string;
  billNumber: string;
  vendorInvoiceNumber?: string | null;
  billDate: string;
  dueDate: string | null;
  status: string;
  grandTotal: string;
  paidAmount: string;
  supplier: { name: string; code: string };
  purchaseOrder: { poNumber: string } | null;
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-800",
  received: "bg-blue-100 text-blue-800",
  partial_paid: "bg-amber-100 text-amber-800",
  paid: "bg-green-100 text-green-800",
  overdue: "bg-red-100 text-red-800",
  cancelled: "bg-slate-100 text-slate-500",
};

export default function BillsPage() {
  const { status } = useSession();
  const router = useRouter();
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
    if (status === "authenticated") {
      fetchBills();
    }
  }, [status, router]);

  const fetchBills = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/bills");
      if (!res.ok) throw new Error("Failed to fetch bills");
      const data = await res.json();
      setBills(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading bills");
      setBills([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, number: string) => {
    if (confirm(`Delete bill "${number}"?`)) {
      try {
        const res = await fetch(`/api/bills/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to delete");
        setBills(bills.filter((b) => b.id !== id));
      } catch (err) {
        alert(err instanceof Error ? err.message : "Error deleting bill");
      }
    }
  };

  const filtered = bills.filter(
    (b) =>
      b.billNumber.toLowerCase().includes(search.toLowerCase()) ||
      b.supplier.name.toLowerCase().includes(search.toLowerCase())
  );

  const formatPrice = (value: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(value);

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
              <Receipt className="text-rose-600" size={28} />
              Vendor Bills
            </h1>
            <p className="text-slate-600 mt-1">Payables from vendors, with optional link to a PO</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => router.push("/supply-chain/import")}>
              Impor Excel
            </Button>
            <Button
              onClick={() => router.push("/supply-chain/bills/new")}
              className="gap-2"
            >
              <Plus size={18} />
              New Bill
            </Button>
          </div>
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
            <CardTitle className="text-base">{filtered.length} Bill(s)</CardTitle>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-slate-500">No bills found</p>
                <Button variant="link" onClick={() => router.push("/supply-chain/bills/new")} className="mt-2">
                  Create first bill
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bill Number</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Source PO</TableHead>
                      <TableHead className="text-right">Grand Total</TableHead>
                      <TableHead className="text-right">Balance Due</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-mono text-sm">
                          {b.billNumber}
                          {b.vendorInvoiceNumber && <span className="block text-xs text-slate-400">{b.vendorInvoiceNumber}</span>}
                        </TableCell>
                        <TableCell>{new Date(b.billDate).toLocaleDateString("id-ID")}</TableCell>
                        <TableCell className="font-medium">{b.supplier.name}</TableCell>
                        <TableCell className="text-sm text-slate-500">{b.purchaseOrder?.poNumber || "-"}</TableCell>
                        <TableCell className="text-right font-semibold">{formatPrice(Number(b.grandTotal))}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatPrice(Number(b.grandTotal) - Number(b.paidAmount))}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${
                              STATUS_STYLES[b.status] || "bg-slate-100 text-slate-800"
                            }`}
                          >
                            {b.status.replace(/_/g, " ")}
                          </span>
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button variant="ghost" size="sm" onClick={() => router.push(`/supply-chain/bills/${b.id}`)}>
                            <Edit size={16} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleDelete(b.id, b.billNumber)}
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
