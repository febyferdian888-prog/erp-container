import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { loadSoProgress } from "@/lib/so-progress";

const r2 = (n: number) => Math.round(n * 100) / 100;
const normPart = (s: string | null) => (s ? s.toUpperCase().replace(/[^A-Z0-9]/g, "") : "");
const keyOf = (partNumber: string | null, description: string) => normPart(partNumber) || description.trim().toLowerCase();

// Sales outstanding, in the order a deal travels: issued quotations still waiting to become a
// customer PO, sales orders not yet (fully) delivered, and sales orders not yet invoiced.
export async function GET() {
  try {
    { const denied = await guard(["sales"], "view"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { memberships: { where: { isActive: true } } },
    });
    if (!user?.memberships.length) return NextResponse.json({ error: "No company access" }, { status: 403 });
    const companyIds = user.memberships.map((m) => m.companyId);
    const now = new Date();

    const quotes = await prisma.quotation.findMany({
      where: {
        companyId: { in: companyIds },
        deletedAt: null,
        status: { in: ["sent", "accepted"] },
        salesOrders: { none: { deletedAt: null, status: { not: "cancelled" } } },
      },
      select: {
        id: true, number: true, status: true, quotationDate: true, expiryDate: true, salesPic: true, nextFollowUpAt: true,
        ppnPercent: true, pphPercent: true,
        customer: { select: { name: true } },
        items: { select: { description: true, quantity: true, unit: true, subtotal: true }, orderBy: { lineNumber: "asc" } },
      },
      orderBy: { quotationDate: "asc" },
    });

    const quotations = quotes.map((q) => {
      const sub = q.items.reduce((s, i) => s + Number(i.subtotal), 0);
      return {
        id: q.id,
        number: q.number,
        status: q.status,
        customerName: q.customer.name,
        quotationDate: q.quotationDate,
        expiryDate: q.expiryDate,
        expired: q.expiryDate < now,
        ageDays: Math.floor((now.getTime() - q.quotationDate.getTime()) / 86400000),
        salesPic: q.salesPic,
        nextFollowUpAt: q.nextFollowUpAt,
        followUpOverdue: !!q.nextFollowUpAt && q.nextFollowUpAt < now,
        value: r2(sub + (sub * Number(q.ppnPercent)) / 100 - (sub * Number(q.pphPercent)) / 100),
        items: q.items.map((i) => ({ description: i.description, quantity: Number(i.quantity), unit: i.unit })),
      };
    });

    const orders = await prisma.salesOrder.findMany({
      where: { companyId: { in: companyIds }, deletedAt: null, status: { not: "cancelled" } },
      select: {
        id: true, soNumber: true, poNumber: true, poDate: true, deliveryDate: true, deliveryDebtAt: true, deliveryDebtNote: true,
        customer: { select: { name: true } },
        items: { select: { id: true, lineNumber: true, partNumber: true, description: true, quantity: true, unit: true, subtotal: true }, orderBy: { lineNumber: "asc" } },
        deliveries: { where: { deletedAt: null, status: { not: "cancelled" } }, select: { items: { select: { partNumber: true, description: true, quantity: true } } } },
        invoices: { where: { deletedAt: null, status: { not: "cancelled" } }, select: { id: true } },
      },
      orderBy: { poDate: "asc" },
    });
    const progress = await loadSoProgress(prisma, orders.map((o) => o.id));

    const open = orders.filter((o) => progress[o.id]?.key !== "done");

    const deliveryAll = open
      .map((o) => {
        const pool = new Map<string, number>();
        for (const d of o.deliveries) for (const di of d.items) pool.set(keyOf(di.partNumber, di.description), (pool.get(keyOf(di.partNumber, di.description)) ?? 0) + Number(di.quantity));
        const lines = o.items.map((i) => {
          const k = keyOf(i.partNumber, i.description);
          const ordered = Number(i.quantity);
          const take = Math.min(pool.get(k) ?? 0, ordered);
          pool.set(k, (pool.get(k) ?? 0) - take);
          return { description: i.description, partNumber: i.partNumber, unit: i.unit, ordered, delivered: take, remaining: ordered - take };
        });
        return { o, lines };
      })
      .filter(({ lines }) => lines.some((l) => l.remaining > 0.0001))
      .map(({ o, lines }) => ({
        id: o.id,
        soNumber: o.soNumber,
        customerPoNumber: o.poNumber,
        customerName: o.customer.name,
        deliveryDate: o.deliveryDate,
        late: !!o.deliveryDate && o.deliveryDate < now,
        stage: progress[o.id]?.label ?? "-",
        hasDelivery: o.deliveries.length > 0,
        debtAt: o.deliveryDebtAt,
        debtNote: o.deliveryDebtNote,
        lines: lines.filter((l) => l.remaining > 0.0001),
      }));
    const delivery = deliveryAll.filter((d) => !d.debtAt);
    const debt = deliveryAll.filter((d) => !!d.debtAt);

    const invoicing = open
      .filter((o) => o.invoices.length === 0)
      .map((o) => {
        const delivered = o.deliveries.reduce((s, d) => s + d.items.reduce((a, i) => a + Number(i.quantity), 0), 0);
        const ordered = o.items.reduce((s, i) => s + Number(i.quantity), 0);
        return {
          id: o.id,
          soNumber: o.soNumber,
          customerPoNumber: o.poNumber,
          customerName: o.customer.name,
          value: r2(o.items.reduce((s, i) => s + Number(i.subtotal), 0)),
          deliveredShare: ordered > 0 ? Math.min(Math.round((delivered / ordered) * 100), 100) : 0,
          stage: progress[o.id]?.label ?? "-",
          poDate: o.poDate,
          items: o.items.map((i) => ({ description: i.description, quantity: Number(i.quantity), unit: i.unit })),
        };
      })
      .sort((a, b) => b.deliveredShare - a.deliveredShare);

    return NextResponse.json({
      quotations,
      quotationValue: r2(quotations.reduce((s, q) => s + q.value, 0)),
      delivery,
      deliveryItems: delivery.reduce((s, d) => s + d.lines.length, 0),
      debt,
      debtItems: debt.reduce((s, d) => s + d.lines.length, 0),
      invoicing,
      invoicingValue: r2(invoicing.reduce((s, i) => s + i.value, 0)),
    });
  } catch (error) {
    console.error("GET /api/sales/outstanding error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
