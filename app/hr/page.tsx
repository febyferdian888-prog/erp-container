import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users2, CalendarDays, Wallet, ChevronRight } from "lucide-react";

const sections = [
  {
    href: "/hr/employees",
    icon: Users2,
    title: "Employees",
    description: "Employee master data and profiles",
  },
  {
    href: "/hr/leaves",
    icon: CalendarDays,
    title: "Leave Requests",
    description: "Employee time-off requests and approvals",
  },
  {
    href: "/hr/reimbursements",
    icon: Wallet,
    title: "Reimbursements",
    description: "Employee expense reimbursement requests",
  },
];

export default function HRPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">HR</h1>
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
