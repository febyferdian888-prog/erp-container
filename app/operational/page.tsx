import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, FolderKanban, Wrench, Layers, ChevronRight } from "lucide-react";

const sections = [
  {
    href: "/operational/projects",
    icon: FolderKanban,
    title: "Projects",
    description: "Container fabrication and modification projects",
  },
  {
    href: "/operational/work-orders",
    icon: Wrench,
    title: "Work Orders (SPK)",
    description: "Shop-floor work instructions tied to a project",
  },
  {
    href: "/operational/boms",
    icon: Layers,
    title: "Bill of Materials",
    description: "Material requirements per project",
  },
  {
    href: "/operational/products",
    icon: Package,
    title: "Products",
    description: "Manage product catalog and pricing",
  },
];

export default function OperationalPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Operational</h1>
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
