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
import { Plus, Search, Eye, Trash2, User, Calendar, DollarSign } from "lucide-react";

interface Quotation {
  id: string;
  number: string;
  customer: { name: string };
  revisionNumber: number;
  quotationDate: string;
  expiryDate: string;
  status: string;
  totalAmount?: number;
  createdAt: string;
}

export default function QuotationsPage() {
  const { status } = useSession();
  const router = useRouter();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
    if (status === "authenticated") {
      fetchQuotations();
    }
  }, [status, router]);

  const fetchQuotations = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/quotations");
      if (!res.ok) throw new Error("Failed to fetch quotations");
      const data = await res.json();
      setQuotations(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading quotations");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, number: string) => {
    if (confirm(`Delete quotation "${number}"?`)) {
      try {
        const res = await fetch(`/api/quotations/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to delete");
        setQuotations(quotations.filter((q) => q.id !== id));
      } catch (err) {
        alert(err instanceof Error ? err.message : "Error deleting quotation");
      }
    }
  };

  const filteredQuotations = quotations.filter(
    (q) =>
      q.number.toLowerCase().includes(search.toLowerCase()) ||
      q.customer.name.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: "bg-slate-100 text-slate-800",
      sent: "bg-blue-100 text-blue-800",
      accepted: "bg-green-100 text-green-800",
      rejected: "bg-red-100 text-red-800",
      expired: "bg-yellow-100 text-yellow-800",
      cancelled: "bg-gray-100 text-gray-800",
    };
    return colors[status] || "bg-slate-100 text-slate-800";
  };

  const formatPrice = (price: number | undefined) => {
    if (!price) return "—";
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(price);
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
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Quotations</h1>
            <p className="text-slate-600 mt-1">Manage customer quotations</p>
          </div>
          <Button
            onClick={() => router.push("/sales/quotations/new")}
            className="gap-2"
          >
            <Plus size={18} />
            New Quotation
          </Button>
        </div>

        {/* Search */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Search size={20} className="text-slate-400" />
              <Input
                placeholder="Search by quotation number or customer..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="border-0"
              />
            </div>
          </CardContent>
        </Card>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">
            {error}
          </div>
        )}

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {filteredQuotations.length} Quotation(s)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredQuotations.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-slate-500">No quotations found</p>
                <Button
                  variant="link"
                  onClick={() => router.push("/sales/quotations/new")}
                  className="mt-2"
                >
                  Create first quotation
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>QT Number</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Revision</TableHead>
                      <TableHead>Dates</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredQuotations.map((q) => (
                      <TableRow key={q.id}>
                        <TableCell className="font-mono text-sm font-semibold">
                          {q.number}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User size={14} className="text-slate-400" />
                            {q.customer.name}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="bg-slate-100 px-2 py-1 rounded text-xs">
                            v{q.revisionNumber}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1">
                              <Calendar size={14} />
                              {new Date(q.quotationDate).toLocaleDateString("id-ID")}
                            </div>
                            <div className="flex items-center gap-1 text-slate-600">
                              Exp: {new Date(q.expiryDate).toLocaleDateString("id-ID")}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 font-semibold">
                            <DollarSign size={14} />
                            {formatPrice(q.totalAmount)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(
                              q.status
                            )}`}
                          >
                            {q.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              router.push(`/sales/quotations/${q.id}`)
                            }
                          >
                            <Eye size={16} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleDelete(q.id, q.number)}
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
