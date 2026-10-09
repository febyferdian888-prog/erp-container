import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";

const r2 = (n: number) => Math.round(n * 100) / 100;

// Lists behind the Supply Chain summary: PO lines the vendor has not billed yet (SCM ticks
// the lines on the vendor's invoice), and PO lines not yet received (SCM ticks what arrived).
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
        status: { notIn: ["draft", "cancelled"] },
      },
      select: {
        id: true,
        poNumber: true,
        status: true,
        deliveryDate: true,
        ppnPercent: true,
        supplier: { select: { name: true } },
        items: {
          select: { id: true, description: true, quantity: true, receivedQty: true, invoicedQty: true, unit: true, unitPrice: true, subtotal: true },
          orderBy: { lineNumber: "asc" },
        },
        bills: {
          where: { deletedAt: null, status: { not: "cancelled" } },
          select: { status: true, billKind: true, totalAmount: true, items: { select: { poItemId: true } } },
        },
        receipts: { where: { deletedAt: null }, select: { id: true, receiptNumber: true, autoCreated: true, stockApplied: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const invoicing = pos
      .map((po) => {
        // A vendor bill recorded before per-line tracking (no PO line linked) covers the whole PO.
        const legacyBilled = po.bills.some((b) => b.billKind !== "down_payment" && b.status !== "draft" && !b.items.some((i) => i.poItemId));
        if (legacyBilled) return null;
        const lines = po.items
          .map((i) => ({
            id: i.id,
            description: i.description,
            unit: i.unit,
            quantity: Number(i.quantity),
            invoiced: Number(i.invoicedQty),
            remaining: Number(i.quantity) - Number(i.invoicedQty),
            unitPrice: Number(i.unitPrice),
          }))
          .filter((l) => l.remaining > 0.0001);
        if (!lines.length) return null;
        const dpBilled = po.bills.filter((b) => b.billKind === "down_payment" && b.status !== "draft").reduce((s, b) => s + Number(b.totalAmount), 0);
        return {
          poId: po.id,
          poNumber: po.poNumber,
          status: po.status,
          supplierName: po.supplier?.name ?? "-",
          ppnPercent: Number(po.ppnPercent),
          poSubtotal: r2(po.items.reduce((s, i) => s + Number(i.subtotal), 0)),
          dpBilled: r2(dpBilled),
          lines,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const goods = pos
      .filter((po) => ["sent", "confirmed", "partial_received"].includes(po.status) || po.receipts.some((r) => r.autoCreated && !r.stockApplied))
      .map((po) => {
        const lines = po.items
          .map((i) => ({ id: i.id, description: i.description, unit: i.unit, ordered: Number(i.quantity), received: Number(i.receivedQty) }))
          .filter((i) => i.ordered - i.received > 0);
        const draft = po.receipts.find((r) => r.autoCreated && !r.stockApplied) ?? null;
        const orderedTotal = po.items.reduce((s, i) => s + Number(i.quantity), 0);
        const receivedTotal = po.items.reduce((s, i) => s + Math.min(Number(i.receivedQty), Number(i.quantity)), 0);
        return {
          poId: po.id,
          poNumber: po.poNumber,
          status: po.status,
          supplierName: po.supplier?.name ?? "-",
          deliveryDate: po.deliveryDate,
          lines,
          progress: orderedTotal > 0 ? Math.round((receivedTotal / orderedTotal) * 100) : 0,
          draftGr: draft ? { id: draft.id, receiptNumber: draft.receiptNumber } : null,
        };
      })
      .filter((g) => g.lines.length > 0);

    return NextResponse.json({
      invoicing,
      invoicingItems: invoicing.reduce((s, p) => s + p.lines.length, 0),
      goods,
      goodsItems: goods.reduce((s, g) => s + g.lines.length, 0),
      grWaiting: goods.filter((g) => g.draftGr).length,
    });
  } catch (error) {
    console.error("GET /api/purchase-orders/scm-summary error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
