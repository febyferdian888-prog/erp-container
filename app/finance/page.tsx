import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Receipt, BookText, BookOpen, BarChart3, ChevronRight } from "lucide-react";

const sections = [
  {
    href: "/finance/invoices",
    icon: FileText,
    title: "Invoices",
    description: "Bill customers and track payment status",
  },
  {
    href: "/finance/kwitansi",
    icon: Receipt,
    title: "Kwitansi",
    description: "Issue payment receipts to customers",
  },
  {
    href: "/finance/journal-entries",
    icon: BookText,
    title: "Journal Entries",
    description: "General ledger postings. Invoices, receipts, and bills post automatically",
  },
  {
    href: "/finance/reports",
    icon: BarChart3,
    title: "Laporan keuangan",
    description: "Laba rugi, neraca, neraca saldo, buku besar, and PPN recap",
  },
  {
    href: "/finance/chart-of-accounts",
    icon: BookOpen,
    title: "Chart of Accounts",
    description: "Master list of accounts used in the general ledger",
  },
];

export default function FinancePage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Finance</h1>
          <p className="text-slate-600 mt-1">Choose a section to manage</p>
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
