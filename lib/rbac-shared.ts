// Role definitions and route rules. No server imports, so client components can use it too.

export type Area = "sales" | "purchasing" | "finance" | "operational" | "hr" | "reports" | "admin";
export type Level = "none" | "view" | "edit";
export type Permissions = Record<Area, Level>;

export const AREAS: { key: Area; label: string }[] = [
  { key: "sales", label: "Penjualan" },
  { key: "purchasing", label: "Pengadaan & stok" },
  { key: "finance", label: "Keuangan" },
  { key: "operational", label: "Operasional" },
  { key: "hr", label: "HR" },
  { key: "reports", label: "Laporan" },
  { key: "admin", label: "Pengaturan & tim" },
];

const none: Permissions = { sales: "none", purchasing: "none", finance: "none", operational: "none", hr: "none", reports: "none", admin: "none" };
const all = (level: Level): Permissions => ({ sales: level, purchasing: level, finance: level, operational: level, hr: level, reports: level, admin: level });

export const ROLES: { name: string; description: string; perms: Permissions }[] = [
  { name: "Owner", description: "Akses penuh ke semua modul dan pengaturan", perms: all("edit") },
  { name: "Admin", description: "Akses penuh, termasuk mengelola tim", perms: all("edit") },
  { name: "Sales", description: "Mengelola RFQ, quotation, Sales Order, dan surat jalan", perms: { ...none, sales: "edit", reports: "view" } },
  { name: "Purchasing", description: "Mengelola PR, PO, penerimaan barang, stok, dan input bill vendor", perms: { ...none, purchasing: "edit", sales: "view" } },
  { name: "Finance", description: "Mengelola invoice, kwitansi, bill, jurnal, dan laporan keuangan", perms: { ...none, finance: "edit", sales: "view", purchasing: "view", reports: "edit" } },
  { name: "Operational", description: "Mengelola proyek, BOM, dan SPK", perms: { ...none, operational: "edit", sales: "view", purchasing: "view" } },
  { name: "HR", description: "Mengelola karyawan, cuti, dan reimbursement", perms: { ...none, hr: "edit" } },
  { name: "Viewer", description: "Hanya melihat, tidak bisa mengubah apa pun (kecuali HR dan pengaturan)", perms: { ...all("view"), hr: "none", admin: "none" } },
];

const RANK: Record<Level, number> = { none: 0, view: 1, edit: 2 };

export function permissionsFor(roleNames: string[]): Permissions {
  const out: Permissions = { ...none };
  for (const name of roleNames) {
    const role = ROLES.find((r) => r.name.toLowerCase() === name.toLowerCase());
    if (!role) continue;
    for (const a of Object.keys(out) as Area[]) {
      if (RANK[role.perms[a]] > RANK[out[a]]) out[a] = role.perms[a];
    }
  }
  return out;
}

export function can(perms: Permissions, areas: Area[] | "any", level: Exclude<Level, "none">) {
  if (areas === "any") return Object.values(perms).some((l) => RANK[l] >= RANK.view);
  return areas.some((a) => RANK[perms[a]] >= RANK[level]);
}

// Which area(s) a page needs. First matching prefix wins.
const PAGE_RULES: { prefix: string; areas: Area[] | "any" }[] = [
  { prefix: "/settings/team", areas: ["admin"] },
  { prefix: "/settings/audit-log", areas: ["admin"] },
  { prefix: "/settings", areas: "any" },
  { prefix: "/approvals", areas: "any" },
  { prefix: "/dashboard", areas: "any" },
  { prefix: "/reports/sales", areas: ["reports", "finance"] },
  { prefix: "/reports", areas: ["reports", "finance"] },
  { prefix: "/sales", areas: ["sales"] },
  { prefix: "/supply-chain/bills", areas: ["finance", "purchasing"] },
  { prefix: "/supply-chain/vendor-payments", areas: ["finance"] },
  { prefix: "/supply-chain/import", areas: ["finance", "purchasing"] },
  { prefix: "/supply-chain", areas: ["purchasing", "finance"] },
  { prefix: "/operational/products", areas: ["operational", "purchasing"] },
  { prefix: "/operational", areas: ["operational"] },
  { prefix: "/finance", areas: ["finance"] },
  { prefix: "/hr", areas: ["hr"] },
];

export function pageAllowed(pathname: string, perms: Permissions) {
  const rule = PAGE_RULES.find((r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/"));
  if (!rule) return true;
  return can(perms, rule.areas, "view");
}
