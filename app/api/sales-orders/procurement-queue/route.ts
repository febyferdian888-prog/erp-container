import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { loadSoCoverage } from "@/lib/so-procurement";

// Open sales orders that still have items nobody has bought yet: no PO at all, or a PO
// that covers only some of the lines (one SO can be split across several vendors).
// Orders marked "no purchase needed" never appear.
export async function GET() {
  try {
    { const denied = await guard(["purchasing"], "view"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { memberships: { where: { isActive: true } } },
    });
    if (!user?.memberships.length) return NextResponse.json({ error: "No company access" }, { status: 403 });

    const orders = await prisma.salesOrder.findMany({
      where: {
        companyId: { in: user.memberships.map((m) => m.companyId) },
        deletedAt: null,
        status: { in: ["draft", "confirmed"] },
        procurementSkippedAt: null,
      },
      select: {
        id: true,
        soNumber: true,
        poNumber: true,
        poDate: true,
        deliveryDate: true,
        status: true,
        customer: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const coverage = await loadSoCoverage(prisma, orders.map((o) => o.id));

    return NextResponse.json(
      orders
        .map((o) => {
          const c = coverage[o.id];
          const outstanding = c.items.filter((i) => i.outstandingQty > 0);
          return {
            id: o.id,
            soNumber: o.soNumber,
            poNumber: o.poNumber,
            poDate: o.poDate,
            deliveryDate: o.deliveryDate,
            status: o.status,
            customerName: o.customer.name,
            itemCount: c.items.length,
            outstandingCount: outstanding.length,
            partiallyOrdered: outstanding.length < c.items.length,
            outstandingItems: outstanding.slice(0, 6).map((i) => ({
              description: i.description,
              quantity: i.outstandingQty,
              unit: i.unit,
            })),
            existingPos: [...new Map(c.items.flatMap((i) => i.orders).map((p) => [p.poId, p])).values()].map((p) => ({
              poId: p.poId,
              poNumber: p.poNumber,
              supplierName: p.supplierName,
            })),
          };
        })
        .filter((r) => r.outstandingCount > 0)
    );
  } catch (error) {
    console.error("GET /api/sales-orders/procurement-queue error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
