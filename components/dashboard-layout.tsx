"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Menu,
  LayoutDashboard,
  ShoppingCart,
  Truck,
  Wrench,
  DollarSign,
  Users,
  BarChart3,
  Settings,
  LogOut,
  ChevronDown,
} from "lucide-react";

const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
  { icon: ShoppingCart, label: "Sales", href: "/sales" },
  { icon: Truck, label: "Supply Chain", href: "/supply-chain" },
  { icon: Wrench, label: "Operational", href: "/operational" },
  { icon: DollarSign, label: "Finance", href: "/finance" },
  { icon: Users, label: "HR", href: "/hr" },
  { icon: BarChart3, label: "Laporan", href: "/reports" },
  { icon: Settings, label: "Pengaturan", href: "/settings" },
];

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const handleLogout = async () => {
    await signOut({ redirect: false });
    router.push("/auth/login");
  };

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "w-64" : "w-20"
        } bg-slate-900 text-white transition-all duration-300 flex flex-col`}
      >
        {/* Logo */}
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <div className={`font-bold ${sidebarOpen ? "text-lg" : "hidden"}`}>
            ERP PT-A
          </div>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1 hover:bg-slate-800 rounded"
          >
            <Menu size={20} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-2">
          {menuItems.map((item) => (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors text-sm"
              title={!sidebarOpen ? item.label : ""}
            >
              <item.icon size={20} />
              {sidebarOpen && <span>{item.label}</span>}
            </button>
          ))}
        </nav>

        {/* User Profile */}
        <div className="border-t border-slate-700 p-4">
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors text-sm"
            >
              <div className="w-8 h-8 bg-slate-600 rounded-full flex items-center justify-center text-xs">
                {session?.user?.email?.[0].toUpperCase()}
              </div>
              {sidebarOpen && (
                <>
                  <div className="flex-1 text-left truncate">
                    <div className="text-xs opacity-75">{session?.user?.email}</div>
                  </div>
                  <ChevronDown size={16} />
                </>
              )}
            </button>

            {showUserMenu && sidebarOpen && (
              <div className="absolute bottom-full mb-2 w-full bg-slate-800 rounded-lg shadow-lg p-2 space-y-1">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-slate-700 transition-colors text-sm text-red-400"
                >
                  <LogOut size={16} />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
            <p className="text-sm text-slate-500">Welcome to ERP System</p>
          </div>
          <div className="text-right text-sm text-slate-600">
            <p className="font-medium">{session?.user?.email}</p>
            <p className="text-xs opacity-75">Logged in to PT Maju Jaya Kontainer</p>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
