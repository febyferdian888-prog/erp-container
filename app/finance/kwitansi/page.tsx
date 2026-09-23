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
import { Plus, Search, Eye, Trash2, Receipt } from "lucide-react";

interface Payment {
  id: string;
  paymentNumber: string;
  customer: { name: string } | null;
  paymentDate: string;
  amount: number;
  method: string;
  description: string | null;
}

export default function KwitansiPage() {
  const { status } = useSession();
  const router = useRouter();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
    if (status === "authenticated") {
      fetchPayments();
    }
  }, [status, router]);

  const fetchPayments = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/payments");
      if (!res.ok) throw new Error("Failed to fetch kwitansi");
      setPayments(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading kwitansi");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, number: string) => {
    if (confirm(`Delete Kwitansi "${number}"? This will also reverse any linked invoice payment.`)) {
      try {
        const res = await fetch(`/api/payments/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to delete");
        setPayments(payments.filter((p) => p.id !== id));
      } catch (err) {
        alert(err instanceof Error ? err.message : "Error deleting kwitansi");
      }
    }
  };

  const filtered = payments.filter(
    (p) =>
      p.paymentNumber.toLowerCase().includes(search.toLowerCase()) ||
      (p.customer?.name || "").toLowerCase().includes(search.toLowerCase())
  );

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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              <Receipt size={28} className="text-amber-700" />
              Kwitansi
            </h1>
            <p className="text-slate-600 mt-1">Payment receipts issued to customers</p>
          </div>
          <Button onClick={() => router.push("/finance/kwitansi/new")} className="gap-2">
            <Plus size={18} />
            New Kwitansi
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Search size={20} className="text-slate-400" />
              <Input placeholder="Search by number or customer..." value={search} onChange={(e) => setSearch(e.target.value)} className="border-0" />
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">{error}</div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{filtered.length} Kwitansi</CardTitle>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-slate-500">No receipts found</p>
                <Button variant="link" onClick={() => router.push("/finance/kwitansi/new")} className="mt-2">
                  Create first Kwitansi
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kwitansi #</TableHead>
                      <TableHead>Received From</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>For</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-sm font-medium">{p.paymentNumber}</TableCell>
                        <TableCell>{p.customer?.name || "-"}</TableCell>
                        <TableCell className="text-sm">{new Date(p.paymentDate).toLocaleDateString("id-ID")}</TableCell>
                        <TableCell className="text-sm max-w-xs truncate">{p.description || "-"}</TableCell>
                        <TableCell className="text-sm capitalize">{p.method}</TableCell>
                        <TableCell className="text-right font-semibold">{formatPrice(Number(p.amount))}</TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button variant="ghost" size="sm" onClick={() => router.push(`/finance/kwitansi/${p.id}`)}>
                            <Eye size={16} />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(p.id, p.paymentNumber)}>
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
