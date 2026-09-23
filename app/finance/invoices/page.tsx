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
import { Plus, Search, Eye, Trash2 } from "lucide-react";

interface Invoice {
  id: string;
  invoiceNumber: string;
  customer: { name: string };
  invoiceDate: string;
  dueDate: string | null;
  status: string;
  grandTotal: number;
  paidAmount: number;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-800",
  sent: "bg-blue-100 text-blue-800",
  partial_paid: "bg-amber-100 text-amber-800",
  paid: "bg-green-100 text-green-800",
  overdue: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-800",
};

export default function InvoicesPage() {
  const { status } = useSession();
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
    if (status === "authenticated") {
      fetchInvoices();
    }
  }, [status, router]);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/invoices");
      if (!res.ok) throw new Error("Failed to fetch invoices");
      setInvoices(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading invoices");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, number: string) => {
    if (confirm(`Delete invoice "${number}"?`)) {
      try {
        const res = await fetch(`/api/invoices/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to delete");
        setInvoices(invoices.filter((i) => i.id !== id));
      } catch (err) {
        alert(err instanceof Error ? err.message : "Error deleting invoice");
      }
    }
  };

  const filtered = invoices.filter(
    (i) =>
      i.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
      i.customer.name.toLowerCase().includes(search.toLowerCase())
  );

  const formatPrice = (price: number | undefined) => {
    if (!price) return "-";
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(price);
  };

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
            <h1 className="text-3xl font-bold text-slate-900">Invoices</h1>
            <p className="text-slate-600 mt-1">Manage customer billing</p>
          </div>
          <Button onClick={() => router.push("/finance/invoices/new")} className="gap-2">
            <Plus size={18} />
            New Invoice
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Search size={20} className="text-slate-400" />
              <Input placeholder="Search by invoice number or customer..." value={search} onChange={(e) => setSearch(e.target.value)} className="border-0" />
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">{error}</div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{filtered.length} Invoice(s)</CardTitle>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-slate-500">No invoices found</p>
                <Button variant="link" onClick={() => router.push("/finance/invoices/new")} className="mt-2">
                  Create first invoice
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead className="text-right">Grand Total</TableHead>
                      <TableHead className="text-right">Balance Due</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-mono text-sm font-medium">{inv.invoiceNumber}</TableCell>
                        <TableCell>{inv.customer.name}</TableCell>
                        <TableCell className="text-sm">{new Date(inv.invoiceDate).toLocaleDateString("id-ID")}</TableCell>
                        <TableCell className="text-sm">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("id-ID") : "-"}</TableCell>
                        <TableCell className="text-right font-semibold">{formatPrice(inv.grandTotal)}</TableCell>
                        <TableCell className="text-right font-semibold text-blue-700">
                          {formatPrice(Number(inv.grandTotal) - Number(inv.paidAmount))}
                        </TableCell>
                        <TableCell>
                          <span className={`px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide capitalize ${STATUS_COLORS[inv.status] || "bg-slate-100 text-slate-800"}`}>
                            {inv.status.replace("_", " ")}
                          </span>
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button variant="ghost" size="sm" onClick={() => router.push(`/finance/invoices/${inv.id}`)}>
                            <Eye size={16} />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(inv.id, inv.invoiceNumber)}>
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
