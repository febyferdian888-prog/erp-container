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
import { Plus, Search, Edit, Trash2, Landmark } from "lucide-react";

interface VendorPayment {
  id: string;
  paymentNumber: string;
  paymentDate: string;
  amount: string;
  method: string;
  status: string;
  description: string | null;
  supplier: { name: string; code: string };
}

const STATUS_STYLES: Record<string, string> = {
  recorded: "bg-yellow-100 text-yellow-800",
  cleared: "bg-green-100 text-green-800",
  reversed: "bg-slate-100 text-slate-500",
};

export default function VendorPaymentsPage() {
  const { status } = useSession();
  const router = useRouter();
  const [payments, setPayments] = useState<VendorPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
    if (status === "authenticated") fetchPayments();
  }, [status, router]);

  const fetchPayments = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/vendor-payments");
      if (!res.ok) throw new Error("Failed to fetch vendor payments");
      setPayments(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading vendor payments");
      setPayments([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, number: string) => {
    if (confirm(`Delete vendor payment "${number}"? This reverses its effect on the linked bill.`)) {
      try {
        const res = await fetch(`/api/vendor-payments/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to delete");
        setPayments(payments.filter((p) => p.id !== id));
      } catch (err) {
        alert(err instanceof Error ? err.message : "Error deleting vendor payment");
      }
    }
  };

  const filtered = payments.filter(
    (p) =>
      p.paymentNumber.toLowerCase().includes(search.toLowerCase()) ||
      p.supplier.name.toLowerCase().includes(search.toLowerCase())
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
              <Landmark className="text-yellow-600" size={28} />
              Vendor Payments
            </h1>
            <p className="text-slate-600 mt-1">Money paid out to vendors, with optional link to a Bill</p>
          </div>
          <Button
            onClick={() => router.push("/supply-chain/vendor-payments/new")}
            className="gap-2"
          >
            <Plus size={18} />
            New Payment
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
            <CardTitle className="text-base">{filtered.length} Vendor Payment(s)</CardTitle>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-slate-500">No vendor payments found</p>
                <Button variant="link" onClick={() => router.push("/supply-chain/vendor-payments/new")} className="mt-2">
                  Record first payment
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Payment Number</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>For Payment Of</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-sm">{p.paymentNumber}</TableCell>
                        <TableCell>{new Date(p.paymentDate).toLocaleDateString("id-ID")}</TableCell>
                        <TableCell className="font-medium">{p.supplier.name}</TableCell>
                        <TableCell className="text-sm text-slate-500">{p.description || "-"}</TableCell>
                        <TableCell className="text-right font-semibold">{formatPrice(Number(p.amount))}</TableCell>
                        <TableCell>
                          <span
                            className={`px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${
                              STATUS_STYLES[p.status] || "bg-slate-100 text-slate-800"
                            }`}
                          >
                            {p.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button variant="ghost" size="sm" onClick={() => router.push(`/supply-chain/vendor-payments/${p.id}`)}>
                            <Edit size={16} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleDelete(p.id, p.paymentNumber)}
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
