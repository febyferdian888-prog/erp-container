import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users2, ShieldCheck, History, DatabaseBackup, FileUp, ChevronRight } from "lucide-react";

const sections = [
  {
    href: "/settings/company",
    icon: Building2,
    title: "Company Profile",
    description: "Edit company details, address, and banking information",
  },
  {
    href: "/settings/team",
    icon: Users2,
    title: "Team Members",
    description: "Everyone with access to this company and their role",
  },
  {
    href: "/approvals",
    icon: ShieldCheck,
    title: "Persetujuan",
    description: "Approve or reject purchase orders and quotations above the value limit",
  },
  {
    href: "/settings/audit-log",
    icon: History,
    title: "Audit log",
    description: "Who created, changed, or deleted documents and master data",
  },
  {
    href: "/settings/backup",
    icon: DatabaseBackup,
    title: "Backup & ekspor",
    description: "Download all data, or one module, as an Excel file",
  },
  {
    href: "/settings/import",
    icon: FileUp,
    title: "Impor data master",
    description: "Upload Excel for spareparts, customers, and opening stock",
  },
];

export default function SettingsPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Pengaturan</h1>
          <p className="text-slate-600 mt-1">Company, users, and system preferences</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {sections.map((section) => (
            <Link key={section.href} href={section.href} className="block">
              <Card className="h-full hover:border-slate-400 transition-colors">
                <CardHeader>
                  <CardTitle className="text-base flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <section.icon size={20} className="text-slate-500" />
                      {section.title}
                    </span>
                    <ChevronRight size={18} className="text-slate-400" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-500">{section.description}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
