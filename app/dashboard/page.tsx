"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ShoppingCart,
  TrendingUp,
  Clock,
  AlertCircle,
  DollarSign,
  Users,
} from "lucide-react";

export default function DashboardPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Welcome Section */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-lg p-6 text-white">
          <h2 className="text-3xl font-bold mb-2">Selamat Datang ke ERP System</h2>
          <p className="opacity-90">
            PT Maju Jaya Kontainer - Container Procurement & Fabrication Management
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Active Orders */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <ShoppingCart className="text-blue-600" size={18} />
                Pesanan Aktif
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">0</div>
              <p className="text-xs text-slate-500 mt-1">Belum ada data</p>
            </CardContent>
          </Card>

          {/* Revenue This Month */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="text-green-600" size={18} />
                Pendapatan Bulan Ini
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">Rp 0</div>
              <p className="text-xs text-slate-500 mt-1">Belum ada data</p>
            </CardContent>
          </Card>

          {/* Overdue Invoices */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertCircle className="text-red-600" size={18} />
                Piutang Jatuh Tempo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">0</div>
              <p className="text-xs text-slate-500 mt-1">Invoice jatuh tempo</p>
            </CardContent>
          </Card>

          {/* Projects in Progress */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="text-purple-600" size={18} />
                Proyek Berjalan
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">0</div>
              <p className="text-xs text-slate-500 mt-1">Proyek sedang dikerjakan</p>
            </CardContent>
          </Card>
        </div>

        {/* Content Sections */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Aksi Cepat</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <button className="w-full text-left px-4 py-2 rounded hover:bg-slate-100 transition-colors text-sm">
                ➕ Buat Penawaran Baru
              </button>
              <button className="w-full text-left px-4 py-2 rounded hover:bg-slate-100 transition-colors text-sm">
                📋 Lihat Pesanan
              </button>
              <button className="w-full text-left px-4 py-2 rounded hover:bg-slate-100 transition-colors text-sm">
                💰 Buat Invoice
              </button>
              <button className="w-full text-left px-4 py-2 rounded hover:bg-slate-100 transition-colors text-sm">
                🔧 Kelola Proyek
              </button>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Aktivitas Terbaru</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-slate-500 text-center py-4">
                <p>Belum ada aktivitas</p>
                <p className="text-xs mt-1">Sistem baru disetup</p>
              </div>
            </CardContent>
          </Card>

          {/* System Status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status Sistem</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span>Database</span>
                <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium">
                  Connected
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Authentication</span>
                <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium">
                  Active
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Data Sync</span>
                <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium">
                  Synced
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Information Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ℹ️ Informasi Sistem</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600 space-y-2">
            <p>
              🎯 <strong>Tahap Implementasi:</strong> Tahap 1 - Fondasi (Multi-company,
              Authentication, Database Schema)
            </p>
            <p>
              📅 <strong>Next Phase:</strong> Tahap 2 - Sales Module (RFQ, Quotation,
              Invoice)
            </p>
            <p>
              📚 <strong>Dokumentasi:</strong> Lihat folder{" "}
              <code className="bg-slate-100 px-2 py-1 rounded text-xs">docs/</code> untuk
              detail lengkap
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
