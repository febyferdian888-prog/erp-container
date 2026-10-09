import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SalesBoard } from "@/components/sales-board";
import { Users, ClipboardList, FileText, ShoppingCart, Truck, ChevronRight, TrendingUp } from "lucide-react";

const sections = [
  {
    href: "/sales/pipeline",
    icon: TrendingUp,
    title: "Pipeline penjualan",
    description: "Peluang terbuka dari RFQ dan penawaran, dengan probabilitas dan target closing",
  },
  {
    href: "/sales/customers",
    icon: Users,
    title: "Customers",
    description: "Manage customer records and contacts",
  },
  {
    href: "/sales/rfq",
    icon: ClipboardList,
    title: "RFQ",
    description: "Requests for quotation from customers",
  },
  {
    href: "/sales/quotations",
    icon: FileText,
    title: "Quotations",
    description: "Price quotations sent to customers",
  },
  {
    href: "/sales/orders",
    icon: ShoppingCart,
    title: "Sales Orders",
    description: "Confirmed orders, from quotation to fulfillment",
  },
  {
    href: "/sales/delivery",
    icon: Truck,
    title: "Surat Jalan",
    description: "Delivery notes for goods shipped to customers",
  },
];

export default function SalesPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Sales</h1>
          <p className="text-slate-600 mt-1">Choose a section to manage</p>
        </div>

        <SalesBoard />

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
