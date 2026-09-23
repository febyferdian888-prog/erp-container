import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardList, Truck, Users, Package, PackageCheck, Receipt, Landmark, Warehouse, Boxes, ChevronRight } from "lucide-react";

const sections = [
  {
    href: "/supply-chain/purchase-requests",
    icon: ClipboardList,
    title: "Purchase Requests",
    description: "Internal requests before a PO is issued to a vendor",
  },
  {
    href: "/supply-chain/price-inquiries",
    icon: ClipboardList,
    title: "Perbandingan harga vendor",
    description: "Compare quotes from several vendors and turn the winners into POs",
  },
  {
    href: "/supply-chain/purchase-orders",
    icon: Truck,
    title: "Purchase Orders",
    description: "Orders issued to vendors for goods and materials",
  },
  {
    href: "/supply-chain/goods-receipts",
    icon: PackageCheck,
    title: "Goods Receipts",
    description: "Confirm goods received from vendors against a PO",
  },
  {
    href: "/supply-chain/bills",
    icon: Receipt,
    title: "Vendor Bills",
    description: "Payables from vendors, with optional link to a PO",
  },
  {
    href: "/supply-chain/import",
    icon: Receipt,
    title: "Impor rekap pembelian",
    description: "Upload an Excel purchase recap and match it to sales orders",
  },
  {
    href: "/supply-chain/vendor-payments",
    icon: Landmark,
    title: "Vendor Payments",
    description: "Money paid out to vendors, with optional link to a Bill",
  },
  {
    href: "/supply-chain/warehouses",
    icon: Warehouse,
    title: "Warehouses",
    description: "Physical locations that hold sparepart and material stock",
  },
  {
    href: "/supply-chain/stock",
    icon: Boxes,
    title: "Stock Levels",
    description: "Current quantity on hand per warehouse",
  },
  {
    href: "/supply-chain/suppliers",
    icon: Users,
    title: "Vendors",
    description: "Manage vendor records and contacts",
  },
  {
    href: "/operational/products",
    icon: Package,
    title: "Sparepart Master Data",
    description: "Manage sparepart and material master data",
  },
];

export default function SupplyChainPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Supply Chain</h1>
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
