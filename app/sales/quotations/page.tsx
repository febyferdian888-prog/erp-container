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
import { TableSkeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";
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
  const { confirm, dialog } = useConfirm();

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
    const ok = await confirm({
      title: `Hapus penawaran ${number}?`,
      description: "Tindakan ini tidak dapat dibatalkan.",
      confirmLabel: "Hapus",
      tone: "destructive",
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/quotations/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      setQuotations(quotations.filter((q) => q.id !== id));
      toast.success(`Penawaran ${number} dihapus.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menghapus penawaran");
    }
  };

  const filteredQuotations = quotations.filter(
    (q) =>
      q.number.toLowerCase().includes(search.toLowerCase()) ||
      q.customer.name.toLowerCase().includes(search.toLowerCase())
  );

  const formatPrice = (price: number | undefined) => {
    if (!price) return "-";
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(price);
  };

  if (status === "loading") {
    return <div className="erp-session-loading" role="status">Memuat ruang kerja…</div>;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[var(--foreground)]">Penawaran</h1>
            <p className="text-[var(--neutral-600)] mt-1">Kelola penawaran harga untuk pelanggan</p>
          </div>
          <Button onClick={() => router.push("/sales/quotations/new")} className="gap-2">
            <Plus size={18} />
            Penawaran baru
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Search size={20} className="text-[var(--neutral-400)]" />
              <Input
                placeholder="Cari nomor penawaran atau nama pelanggan..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="border-0"
              />
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="rounded-lg p-4 text-sm" style={{ background: "var(--status-danger-bg)", color: "var(--status-danger-fg)" }} role="alert">
            {error}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {loading ? "Memuat penawaran…" : `${filteredQuotations.length} Penawaran`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0" aria-busy={loading}>
            {loading ? (
              <TableSkeleton rows={6} cols={6} />
            ) : filteredQuotations.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-[var(--neutral-500)]">
                  {search ? "Tidak ada penawaran yang cocok dengan pencarian" : "Belum ada penawaran tercatat"}
                </p>
                <Button
                  variant="link"
                  onClick={() => router.push("/sales/quotations/new")}
                  className="mt-2"
                >
                  Buat penawaran pertama
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>No. Penawaran</TableHead>
                      <TableHead>Pelanggan</TableHead>
                      <TableHead>Revisi</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Nilai</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
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
                            <User size={14} className="text-[var(--neutral-400)]" />
                            {q.customer.name}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="bg-[var(--neutral-100)] px-2 py-1 rounded text-xs">
                            v{q.revisionNumber}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1">
                              <Calendar size={14} />
                              {new Date(q.quotationDate).toLocaleDateString("id-ID")}
                            </div>
                            <div className="flex items-center gap-1 text-[var(--neutral-600)]">
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
                          <StatusBadge status={q.status} />
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              router.push(`/sales/quotations/${q.id}`)
                            }
                            aria-label={`Lihat penawaran ${q.number}`}
                          >
                            <Eye size={16} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-[var(--destructive)] hover:text-[var(--destructive)] hover:bg-[var(--status-danger-bg)]"
                            onClick={() => handleDelete(q.id, q.number)}
                            aria-label={`Hapus penawaran ${q.number}`}
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
      {dialog}
    </DashboardLayout>
  );
}
