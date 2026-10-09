"use client";

import { useEffect, useRef, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import Link, { useLinkStatus } from "next/link";
import Image from "next/image";
import { usePermissions } from "@/components/permissions";
import { pageAllowed } from "@/lib/rbac-shared";
import { ToastRegion } from "@/components/ui/toast-region";
import { Menu, X, LayoutDashboard, ShoppingCart, Truck, Wrench, Wallet, Users, BarChart3, Settings, LogOut, PanelLeftClose, PanelLeftOpen, ChevronDown } from "lucide-react";

/** Small dot that fades in only while its enclosing <Link> is navigating, confirming the click registered. */
function NavPendingHint() {
  const { pending } = useLinkStatus();
  return <span aria-hidden="true" className={`erp-nav-pending ${pending ? "is-pending" : ""}`} />;
}

const menuItems = [
  { icon: LayoutDashboard, label: "Ringkasan", href: "/dashboard" },
  { icon: ShoppingCart, label: "Penjualan", href: "/sales" },
  { icon: Truck, label: "Pembelian & Persediaan", href: "/supply-chain" },
  { icon: Wrench, label: "Operasional", href: "/operational" },
  { icon: Wallet, label: "Keuangan", href: "/finance" },
  { icon: Users, label: "SDM", href: "/hr" },
  { icon: BarChart3, label: "Laporan", href: "/reports" },
  { icon: Settings, label: "Pengaturan", href: "/settings" },
];

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const { me, loaded } = usePermissions();
  const visibleItems = menuItems.filter((item) => !me || pageAllowed(item.href, me.perms));
  const blocked = loaded && !!me && !pageAllowed(pathname, me.perms);
  const homeHref = visibleItems[0]?.href ?? "/settings";
  const router = useRouter();

  useEffect(() => {
    if (blocked && pathname === "/dashboard") router.replace(homeHref);
  }, [blocked, pathname, homeHref, router]);
  const [collapsed, setCollapsed] = useState(false);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [companyError, setCompanyError] = useState(false);
  const mobileDialog = useRef<HTMLDialogElement>(null);
  const userMenu = useRef<HTMLDetailsElement>(null);
  const section = menuItems.find((item) => pathname === item.href || pathname.startsWith(item.href + "/"));

  useEffect(() => {
    if (!session?.user?.email) return;
    const controller = new AbortController();
    fetch("/api/companies", { signal: controller.signal })
      .then((res) => { if (!res.ok) throw new Error("Company unavailable"); return res.json(); })
      .then((companies: { name: string }[]) => { setCompanyName(companies[0]?.name ?? "Belum ada perusahaan"); setCompanyError(false); })
      .catch((error: Error) => { if (error.name !== "AbortError") setCompanyError(true); });
    return () => controller.abort();
  }, [session?.user?.email]);

  useEffect(() => {
    const closeMenu = (event: KeyboardEvent) => {
      if (event.key === "Escape" && userMenu.current?.open) {
        userMenu.current.open = false;
        userMenu.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("keydown", closeMenu);
    return () => document.removeEventListener("keydown", closeMenu);
  }, []);

  const navigation = (mobile = false) => (
    <>
      <Link href="/dashboard" className="erp-brand" onClick={() => mobileDialog.current?.close()} aria-label="PT. MDA Amanah Sejahtera, dashboard">
        <Image src="/logo-mark.svg" alt="" width={42} height={42} priority />
        <span className="erp-nav-label"><strong>PT. MDA</strong><small>Amanah Sejahtera</small></span>
      </Link>
      <p className="erp-nav-heading erp-nav-label">Ruang kerja</p>
      <nav aria-label={mobile ? "Navigasi mobile" : "Navigasi utama"} className="erp-nav">
        {visibleItems.map((item) => {
          const active = section?.href === item.href;
          return <Link key={item.href} href={item.href} title={item.label} aria-current={active ? "page" : undefined} onClick={() => mobileDialog.current?.close()} className={`erp-nav-link ${item.href === "/reports" ? "erp-nav-divider" : ""}`}>
            <NavPendingHint /><item.icon size={19} strokeWidth={1.7} aria-hidden="true" /><span className="erp-nav-label">{item.label}</span>
          </Link>;
        })}
      </nav>
      <div className="erp-sidebar-note erp-nav-label"><span>Container & fabrication</span><p>Pengadaan hingga penyelesaian.</p></div>
    </>
  );

  return (
    <div className={`erp-shell ${collapsed ? "erp-collapsed" : ""}`}>
      <a href="#main-content" className="erp-skip">Lewati navigasi</a>
      <aside className="erp-sidebar">
        {navigation()}
        <button className="erp-collapse" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Perluas sidebar" : "Ringkas sidebar"} aria-expanded={!collapsed}>
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}<span className="erp-nav-label">Ringkas menu</span>
        </button>
      </aside>
      <dialog ref={mobileDialog} className="erp-mobile-dialog" aria-label="Menu navigasi" onClick={(event) => { if (event.target === event.currentTarget) mobileDialog.current?.close(); }}>
        <div className="erp-mobile-inner"><button className="erp-icon-button erp-mobile-close" onClick={() => mobileDialog.current?.close()} aria-label="Tutup menu"><X size={20} /></button>{navigation(true)}</div>
      </dialog>
      <div className="erp-workspace">
        <header className="erp-header">
          <div className="erp-breadcrumb"><button className="erp-mobile-toggle" onClick={() => mobileDialog.current?.showModal()}><Menu size={19} />Menu</button><span className="erp-header-context">Workspace</span><span className="erp-header-context" aria-hidden="true">/</span><span>{section?.label ?? "ERP"}</span></div>
          <details ref={userMenu} className="erp-user-menu">
            <summary><span className="erp-avatar">{(session?.user?.name || session?.user?.email || "U").slice(0, 1).toUpperCase()}</span><span className="erp-user-label">{session?.user?.name || session?.user?.email || "Akun"}</span><ChevronDown size={15} /></summary>
            <div className="erp-user-popover"><p>{session?.user?.email}</p>{me && <p>Peran: {me.roles.join(", ")}</p>}<Link href="/settings/account" onClick={() => { if (userMenu.current) userMenu.current.open = false; }}>Akun dan password</Link><button onClick={() => signOut({ callbackUrl: "/auth/login" })}><LogOut size={16} />Keluar dari akun</button></div>
          </details>
        </header>
        <main id="main-content" className="erp-main" tabIndex={-1}>{blocked ? (
          <div className="mx-auto max-w-lg py-24 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Akses dibatasi</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900">Peran Anda tidak punya akses ke halaman ini</h1>
            <p className="mt-2 text-sm text-slate-500">Peran saat ini: {me?.roles.join(", ")}. Hubungi admin bila Anda perlu akses.</p>
            <Link href={homeHref} className="mt-6 inline-block border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Kembali ke halaman utama</Link>
          </div>
        ) : children}</main>
        <footer className="erp-footer"><span>{companyError ? "Informasi perusahaan tidak tersedia" : companyName ?? "Memuat perusahaan…"}</span><span>ERP · Pengadaan & fabrikasi</span></footer>
      </div>
      <ToastRegion />
    </div>
  );
}
