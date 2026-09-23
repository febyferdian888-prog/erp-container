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
import { Plus, Search, Edit, Trash2, Mail, Phone, DollarSign } from "lucide-react";

interface Supplier {
  id: string;
  code: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  bankName: string;
  isActive: boolean;
  createdAt: string;
}

export default function SuppliersPage() {
  const { status } = useSession();
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }

    if (status === "authenticated") {
      fetchSuppliers();
    }
  }, [status, router]);

  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/suppliers");
      if (!res.ok) throw new Error("Failed to fetch suppliers");
      const data = await res.json();
      setSuppliers(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading suppliers");
      setSuppliers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Delete supplier "${name}"?`)) {
      try {
        const res = await fetch(`/api/suppliers/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to delete");
        setSuppliers(suppliers.filter((s) => s.id !== id));
      } catch (err) {
        alert(err instanceof Error ? err.message : "Error deleting supplier");
      }
    }
  };

  const filteredSuppliers = suppliers.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.code.toLowerCase().includes(search.toLowerCase())
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
            <h1 className="text-3xl font-bold text-slate-900">Suppliers</h1>
            <p className="text-slate-600 mt-1">Manage supplier data</p>
          </div>
          <Button
            onClick={() => router.push("/supply-chain/suppliers/new")}
            className="gap-2"
          >
            <Plus size={18} />
            Add Supplier
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Search size={20} className="text-slate-400" />
              <Input
                placeholder="Search by name or code..."
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
            <CardTitle className="text-base">
              {filteredSuppliers.length} Supplier(s)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredSuppliers.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-slate-500">No suppliers found</p>
                <Button
                  variant="link"
                  onClick={() => router.push("/supply-chain/suppliers/new")}
                  className="mt-2"
                >
                  Create first supplier
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>City</TableHead>
                      <TableHead>Bank</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSuppliers.map((supplier) => (
                      <TableRow key={supplier.id}>
                        <TableCell className="font-mono text-sm">
                          {supplier.code}
                        </TableCell>
                        <TableCell className="font-medium">
                          {supplier.name}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="space-y-1">
                            {supplier.email && (
                              <div className="flex items-center gap-1 text-slate-600">
                                <Mail size={14} />
                                <a href={`mailto:${supplier.email}`}>
                                  {supplier.email}
                                </a>
                              </div>
                            )}
                            {supplier.phone && (
                              <div className="flex items-center gap-1 text-slate-600">
                                <Phone size={14} />
                                {supplier.phone}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{supplier.city || "-"}</TableCell>
                        <TableCell>
                          {supplier.bankName ? (
                            <div className="flex items-center gap-1 text-slate-600 text-sm">
                              <DollarSign size={14} />
                              {supplier.bankName}
                            </div>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${
                              supplier.isActive
                                ? "bg-green-100 text-green-800"
                                : "bg-slate-100 text-slate-800"
                            }`}
                          >
                            {supplier.isActive ? "Active" : "Inactive"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              router.push(`/supply-chain/suppliers/${supplier.id}`)
                            }
                          >
                            <Edit size={16} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() =>
                              handleDelete(supplier.id, supplier.name)
                            }
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
