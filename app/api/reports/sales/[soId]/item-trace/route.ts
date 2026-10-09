import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { normPart } from "@/lib/part-match";

// Per-item buy-vs-sell trace for one Sales Order: what was bought (which vendor,
// what price) matched against what was sold (which customer, what price), by part number.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ soId: string }> }) {
  try {
    { const denied = await guard(["reports", "finance"], "view"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { soId } = await params;

    const so = await prisma.salesOrder.findUnique({
      where: { id: soId },
      include: {
        customer: { select: { name: true } },
        items: { orderBy: { lineNumber: "asc" } },
        purchaseOrders: { where: { deletedAt: null }, select: { id: true } },
        poSources: { select: { purchaseOrder: { select: { id: true } } } },
      },
    });
    if (!so) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const membership = await prisma.userMembership.findFirst({ where: { userId: session.user.id, companyId: so.companyId } });
    if (!membership) return NextResponse.json({ error: "No access" }, { status: 403 });

    const poIds = [...new Set([...so.purchaseOrders.map((p) => p.id), ...so.poSources.map((s) => s.purchaseOrder.id)])];

    const [directBillItems, poBillItems] = await Promise.all([
      prisma.billItem.findMany({
        where: { soId: so.id, bill: { deletedAt: null, status: { not: "cancelled" } } },
        select: { partNumber: true, description: true, quantity: true, unitPrice: true, bill: { select: { billNumber: true, billDate: true, supplier: { select: { name: true } } } } },
      }),
      poIds.length
        ? prisma.billItem.findMany({
            where: { bill: { poId: { in: poIds }, deletedAt: null, status: { not: "cancelled" } } },
            select: { partNumber: true, description: true, quantity: true, unitPrice: true, bill: { select: { billNumber: true, billDate: true, supplier: { select: { name: true } } } } },
          })
        : Promise.resolve([]),
    ]);
    const buys = [...directBillItems, ...poBillItems];

    const items = so.items.map((item) => {
      const key = normPart(item.partNumber || item.description);
      const matches = buys
        .filter((b) => normPart(b.partNumber || b.description) === key && key)
        .map((b) => ({
          billNumber: b.bill.billNumber,
          billDate: b.bill.billDate,
          supplierName: b.bill.supplier.name,
          quantity: Number(b.quantity),
          unitPrice: Number(b.unitPrice),
        }));
      const boughtQty = matches.reduce((s, m) => s + m.quantity, 0);
      const boughtCost = matches.reduce((s, m) => s + m.quantity * m.unitPrice, 0);
      const avgBuyPrice = boughtQty > 0 ? boughtCost / boughtQty : null;
      const sellPrice = Number(item.unitPrice);
      return {
        lineNumber: item.lineNumber,
        partNumber: item.partNumber,
        description: item.description,
        qty: Number(item.quantity),
        sellPrice,
        sellSubtotal: Number(item.subtotal),
        avgBuyPrice,
        marginPerUnit: avgBuyPrice !== null ? sellPrice - avgBuyPrice : null,
        marginPct: avgBuyPrice !== null && sellPrice > 0 ? ((sellPrice - avgBuyPrice) / sellPrice) * 100 : null,
        purchases: matches,
      };
    });

    return NextResponse.json({
      soNumber: so.soNumber,
      poNumber: so.poNumber,
      customerName: so.customer.name,
      items,
    });
  } catch (error) {
    console.error("GET /api/reports/sales/[soId]/item-trace error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
