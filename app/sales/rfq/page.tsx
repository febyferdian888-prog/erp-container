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
import { Plus, Search, Edit, Trash2, FileText, Calendar, User } from "lucide-react";

interface RFQ {
  id: string;
  number: string;
  customer: { name: string };
  title: string;
  requestDate: string;
  targetDate: string;
  status: string;
  createdAt: string;
}

export default function RFQPage() {
  const { status } = useSession();
  const router = useRouter();
  const [rfqs, setRfqs] = useState<RFQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
    if (status === "authenticated") {
      fetchRFQs();
    }
  }, [status, router]);

  const fetchRFQs = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/rfqs");
      if (!res.ok) throw new Error("Failed to fetch RFQs");
      const data = await res.json();
      setRfqs(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading RFQs");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, number: string) => {
    if (confirm(`Delete RFQ "${number}"?`)) {
      try {
        const res = await fetch(`/api/rfqs/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to delete");
        setRfqs(rfqs.filter((r) => r.id !== id));
      } catch (err) {
        alert(err instanceof Error ? err.message : "Error deleting RFQ");
      }
    }
  };

  const filteredRFQs = rfqs.filter(
    (r) =>
      r.number.toLowerCase().includes(search.toLowerCase()) ||
      r.customer.name.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: "bg-slate-100 text-slate-800",
      sent: "bg-blue-100 text-blue-800",
      quoted: "bg-green-100 text-green-800",
      closed: "bg-gray-100 text-gray-800",
      cancelled: "bg-red-100 text-red-800",
    };
    return colors[status] || "bg-slate-100 text-slate-800";
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
            <h1 className="text-3xl font-bold text-slate-900">
              Requests for Quotation
            </h1>
            <p className="text-slate-600 mt-1">
              Manage customer quotation requests
            </p>
          </div>
          <Button onClick={() => router.push("/sales/rfq/new")} className="gap-2">
            <Plus size={18} />
            New RFQ
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Search size={20} className="text-slate-400" />
              <Input
                placeholder="Search by RFQ number or customer..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="border-0"
              />
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">
            {error}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{filteredRFQs.length} RFQ(s)</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredRFQs.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-slate-500">No RFQs found</p>
                <Button
                  variant="link"
                  onClick={() => router.push("/sales/rfq/new")}
                  className="mt-2"
                >
                  Create first RFQ
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>RFQ Number</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Dates</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRFQs.map((rfq) => (
                      <TableRow key={rfq.id}>
                        <TableCell className="font-mono text-sm font-semibold">
                          {rfq.number}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User size={14} className="text-slate-400" />
                            {rfq.customer.name}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {rfq.title || "-"}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1">
                              <Calendar size={14} />
                              Req: {new Date(rfq.requestDate).toLocaleDateString("id-ID")}
                            </div>
                            {rfq.targetDate && (
                              <div className="flex items-center gap-1 text-slate-600">
                                Target: {new Date(rfq.targetDate).toLocaleDateString("id-ID")}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${getStatusColor(
                              rfq.status
                            )}`}
                          >
                            {rfq.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push(`/sales/rfq/${rfq.id}`)}
                          >
                            <Edit size={16} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleDelete(rfq.id, rfq.number)}
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
