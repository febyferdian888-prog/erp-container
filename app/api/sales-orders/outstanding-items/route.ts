import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { loadSoCoverage } from "@/lib/so-procurement";

// Every sales-order line nobody has bought yet, across all open orders, so purchasing can
// look for what is missing and ask vendors for quotes without opening a PO first.
// Quantities only, never selling prices.
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
        deliveryDate: true,
        notes: true,
        customer: { select: { name: true } },
        items: { select: { id: true, notes: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const coverage = await loadSoCoverage(prisma, orders.map((o) => o.id));

    const lines = orders.flatMap((o) =>
      coverage[o.id].items
        .filter((i) => i.outstandingQty > 0)
        .map((i) => ({
          soItemId: i.id,
          soId: o.id,
          soNumber: o.soNumber,
          customerPoNumber: o.poNumber,
          customerName: o.customer.name,
          deliveryDate: o.deliveryDate,
          partNumber: i.partNumber,
          description: i.description,
          quantity: i.outstandingQty,
          unit: i.unit,
          itemNotes: o.items.find((x) => x.id === i.id)?.notes ?? null,
        }))
    );

    const requested = lines.length
      ? await prisma.priceInquiryItem.findMany({
          where: {
            soItemId: { in: lines.map((l) => l.soItemId) },
            poId: null,
            inquiry: { deletedAt: null, status: { notIn: ["cancelled", "closed"] } },
          },
          select: { soItemId: true, inquiry: { select: { id: true, number: true } } },
        })
      : [];
    const inquiryOf = new Map(requested.map((r) => [r.soItemId as string, r.inquiry]));

    return NextResponse.json(lines.map((l) => ({ ...l, inquiry: inquiryOf.get(l.soItemId) ?? null })));
  } catch (error) {
    console.error("GET /api/sales-orders/outstanding-items error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
