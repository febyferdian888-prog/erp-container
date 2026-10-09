import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rbac";

// Sales pipeline (Tahap 4A): open opportunities only. An RFQ with no
// quotation yet is an early-stage, unpriced opportunity; a quotation still
// draft/sent is priced and open. The moment a quotation is accepted (won) or
// rejected/expired/cancelled (lost), it leaves this list — pipeline forecast
// is deliberately kept separate from confirmed orders (see /sales/orders).
const OPEN_QUOTATION_STATUSES = ["draft", "sent"];
const OPEN_RFQ_STATUSES = ["draft", "sent"];

export async function GET(req: NextRequest) {
  try {
    { const denied = await guard(["sales"], "view"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { memberships: { where: { isActive: true }, include: { company: true } } },
    });
    if (!user?.memberships.length) return NextResponse.json({ error: "No company access" }, { status: 403 });

    const accessibleIds = user.memberships.map((m) => m.companyId);
    const params = req.nextUrl.searchParams;
    const companyId = params.get("companyId");
    const companyIds = companyId && accessibleIds.includes(companyId) ? [companyId] : accessibleIds;
    const pic = params.get("pic");

    const [openRfqs, openQuotations] = await Promise.all([
      prisma.rFQ.findMany({
        where: { companyId: { in: companyIds }, deletedAt: null, status: { in: OPEN_RFQ_STATUSES } },
        select: { id: true, number: true, requestDate: true, targetDate: true, companyId: true, customer: { select: { id: true, name: true } }, createdBy: true },
        orderBy: { requestDate: "desc" },
      }),
      prisma.quotation.findMany({
        where: {
          companyId: { in: companyIds },
          deletedAt: null,
          status: { in: OPEN_QUOTATION_STATUSES },
          ...(pic ? { salesPic: pic } : {}),
        },
        select: {
          id: true, number: true, status: true, quotationDate: true, expiryDate: true, companyId: true,
          salesPic: true, probability: true, targetCloseDate: true, nextFollowUpAt: true, createdBy: true,
          customer: { select: { id: true, name: true } },
          items: { select: { subtotal: true } },
          rfq: { select: { id: true, number: true } },
        },
        orderBy: { quotationDate: "desc" },
      }),
    ]);

    const quotedRfqIds = new Set(openQuotations.map((q) => q.rfq?.id).filter(Boolean));
    const value = (items: { subtotal: unknown }[]) => items.reduce((s, i) => s + Number(i.subtotal || 0), 0);

    const rows = [
      ...openRfqs
        .filter((r) => !quotedRfqIds.has(r.id))
        .map((r) => ({
          kind: "rfq" as const,
          id: r.id,
          number: r.number,
          stage: "RFQ — belum ada harga",
          companyId: r.companyId,
          customerName: r.customer.name,
          value: null as number | null,
          probability: null as number | null,
          weightedValue: null as number | null,
          salesPic: r.createdBy,
          targetCloseDate: r.targetDate,
          nextFollowUpAt: null as string | null,
          href: `/sales/rfq/${r.id}`,
          actionHref: `/sales/quotations/new?rfqId=${r.id}`,
          actionLabel: "Buat penawaran",
        })),
      ...openQuotations.map((q) => {
        const v = value(q.items);
        const prob = q.probability ?? 50;
        return {
          kind: "quotation" as const,
          id: q.id,
          number: q.number,
          stage: q.status === "sent" ? "Menunggu keputusan" : "Menyiapkan penawaran",
          companyId: q.companyId,
          customerName: q.customer.name,
          value: v,
          probability: prob,
          weightedValue: Math.round(v * (prob / 100)),
          salesPic: q.salesPic || q.createdBy,
          targetCloseDate: q.targetCloseDate ?? q.expiryDate,
          nextFollowUpAt: q.nextFollowUpAt,
          href: `/sales/quotations/${q.id}`,
          actionHref: `/sales/orders/new?quotationId=${q.id}`,
          actionLabel: "Buat sales order",
        };
      }),
    ];

    rows.sort((a, b) => {
      const da = a.targetCloseDate ? new Date(a.targetCloseDate).getTime() : Infinity;
      const db = b.targetCloseDate ? new Date(b.targetCloseDate).getTime() : Infinity;
      return da - db;
    });

    const totalValue = rows.reduce((s, r) => s + (r.value ?? 0), 0);
    const totalWeightedValue = rows.reduce((s, r) => s + (r.weightedValue ?? 0), 0);
    const picOptions = [...new Set(rows.map((r) => r.salesPic).filter((p): p is string => !!p))];

    // Won/lost in the last 90 days, for context only — not part of the open pipeline totals.
    const since90 = new Date(Date.now() - 90 * 86400000);
    const recentClosed = await prisma.quotation.findMany({
      where: { companyId: { in: companyIds }, deletedAt: null, status: { in: ["accepted", "rejected", "expired", "cancelled"] }, updatedAt: { gte: since90 } },
      select: { id: true, number: true, status: true, updatedAt: true, winLossReason: true, customer: { select: { name: true } }, items: { select: { subtotal: true } } },
      orderBy: { updatedAt: "desc" },
      take: 20,
    });

    return NextResponse.json({
      rows,
      summary: { totalValue, totalWeightedValue, openCount: rows.length },
      filters: { pics: picOptions, companies: user.memberships.filter((m) => !m.company.deletedAt).map((m) => ({ id: m.companyId, name: m.company.name })) },
      recentClosed: recentClosed.map((q) => ({ id: q.id, number: q.number, status: q.status, updatedAt: q.updatedAt, winLossReason: q.winLossReason, customerName: q.customer.name, value: value(q.items), href: `/sales/quotations/${q.id}` })),
    });
  } catch (error) {
    console.error("GET /api/sales/pipeline error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
