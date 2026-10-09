import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { loadPoStages, ownerOf } from "@/lib/po-workflow";

// Open purchase orders for the Supply Chain task list: what SCM has to do next, and what
// is waiting on someone else (director approval, vendor, Finance). Finished POs are left out.
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

    const pos = await prisma.purchaseOrder.findMany({
      where: {
        companyId: { in: user.memberships.map((m) => m.companyId) },
        deletedAt: null,
        status: { notIn: ["cancelled", "invoiced"] },
      },
      select: {
        id: true,
        poNumber: true,
        poDate: true,
        deliveryDate: true,
        status: true,
        supplier: { select: { name: true } },
        items: { select: { description: true, quantity: true, unit: true, unitPrice: true, subtotal: true, receivedQty: true, invoicedQty: true }, orderBy: { lineNumber: "asc" } },
        salesOrder: { select: { id: true, soNumber: true, poNumber: true, customer: { select: { name: true } } } },
        sources: { select: { salesOrder: { select: { id: true, soNumber: true, poNumber: true, customer: { select: { name: true } } } } } },
      },
      orderBy: { createdAt: "asc" },
    });

    const stages = await loadPoStages(prisma, pos.map((p) => p.id));

    const rows = pos
      .map((po) => {
        const stage = stages[po.id];
        const sos = new Map<string, { id: string; soNumber: string; customerPoNumber: string; customerName: string }>();
        for (const so of [po.salesOrder, ...po.sources.map((x) => x.salesOrder)]) {
          if (so) sos.set(so.id, { id: so.id, soNumber: so.soNumber, customerPoNumber: so.poNumber, customerName: so.customer.name });
        }
        return {
          id: po.id,
          poNumber: po.poNumber,
          poDate: po.poDate,
          deliveryDate: po.deliveryDate,
          status: po.status,
          supplierName: po.supplier?.name ?? "-",
          total: po.items.reduce((s, i) => s + Number(i.subtotal), 0),
          items: po.items.map((i) => ({ description: i.description, quantity: Number(i.quantity), unit: i.unit, received: Number(i.receivedQty), invoiced: Number(i.invoicedQty) })),
          salesOrders: [...sos.values()],
          stage,
          owner: ownerOf(stage.key),
        };
      })
      .filter((r) => r.stage.key !== "billed" && r.owner !== "none");

    return NextResponse.json(rows);
  } catch (error) {
    console.error("GET /api/purchase-orders/queue error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
