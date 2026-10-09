import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { formatDocumentNumber, currentYearRange } from "@/lib/document-number";
import { guard } from "@/lib/rbac";
import { loadPoStages } from "@/lib/po-workflow";
import { findUnlinkedProductLines, unlinkedProductMessage } from "@/lib/part-registry";

export async function GET(req: NextRequest) {
  try {
    { const denied = await guard(["purchasing"], "view"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { memberships: true },
    });

    if (!user?.memberships.length) {
      return NextResponse.json({ error: "No company access" }, { status: 403 });
    }

    const companyIds = user.memberships.map((m: any) => m.companyId);

    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where: {
        companyId: { in: companyIds },
        deletedAt: null,
      },
      include: {
        supplier: { select: { id: true, name: true, code: true } },
        purchaseRequest: { select: { id: true, requestNumber: true } },
        salesOrder: { select: { id: true, soNumber: true, poNumber: true } },
        sources: { select: { salesOrder: { select: { id: true, soNumber: true, poNumber: true } } } },
        items: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const stages = await loadPoStages(prisma, purchaseOrders.map((po) => po.id));
    return NextResponse.json(
      purchaseOrders.map((po) => {
        const sos = new Map<string, { id: string; soNumber: string }>();
        for (const so of [po.salesOrder, ...po.sources.map((x) => x.salesOrder)]) if (so) sos.set(so.id, { id: so.id, soNumber: so.soNumber });
        return { ...po, salesOrders: [...sos.values()], stage: stages[po.id] };
      })
    );
  } catch (error) {
    console.error("GET /api/purchase-orders error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    { const denied = await guard(["purchasing"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      companyId,
      supplierId,
      projectId,
      prId,
      soId,
      soIds,
      poDate,
      deliveryDate,
      paymentTerms,
      shipToAddress,
      ppnPercent,
      pphPercent,
      dpPercent,
      notes,
      items,
    } = body;

    if (!companyId || !supplierId || !poDate || !items?.length) {
      return NextResponse.json(
        { error: "companyId, supplierId, poDate, and at least one item are required" },
        { status: 400 }
      );
    }

    {
      const bad = await findUnlinkedProductLines(prisma, companyId, items);
      if (bad.length) return NextResponse.json({ error: unlinkedProductMessage(bad), code: "PRODUCT_NOT_LINKED" }, { status: 400 });
    }

    const { year, start, end } = currentYearRange();
    const count = await prisma.purchaseOrder.count({
      where: { companyId, createdAt: { gte: start, lt: end } },
    });
    const poNumber = formatDocumentNumber("PO", year, count + 1);

    const sourceSoIds: string[] = [...new Set<string>([...(soIds || []), ...(soId ? [soId] : [])])];

    const validSoItemIds = new Set(
      sourceSoIds.length
        ? (await prisma.salesOrderItem.findMany({ where: { soId: { in: sourceSoIds } }, select: { id: true } })).map((x) => x.id)
        : []
    );

    const purchaseOrder = await prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.create({
        data: {
          companyId,
          supplierId,
          projectId: projectId || null,
          prId: prId || null,
          soId: sourceSoIds[0] || null,
          sources: { create: sourceSoIds.map((id) => ({ soId: id })) },
          poNumber,
          poDate: new Date(poDate),
          deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
          paymentTerms,
          shipToAddress: shipToAddress || null,
          ppnPercent: ppnPercent ?? 11,
          pphPercent: pphPercent ?? 0,
          dpPercent: Math.min(Math.max(Number(dpPercent) || 0, 0), 100),
          notes,
          createdBy: session.user.email,
          items: {
            create: items.map((item: any, index: number) => ({
              productId: item.productId || null,
              soItemId: item.soItemId && validSoItemIds.has(item.soItemId) ? item.soItemId : null,
              lineNumber: index + 1,
              description: item.description,
              brand: item.brand || null,
              quantity: item.quantity,
              unit: item.unit,
              unitPrice: item.unitPrice,
              subtotal: Number(item.quantity) * Number(item.unitPrice),
              notes: item.notes,
            })),
          },
        },
        include: { items: true, supplier: true },
      });

      if (prId) {
        await tx.purchaseRequest.update({
          where: { id: prId },
          data: { status: "converted_to_po" },
        });
      }

      return po;
    });

    return NextResponse.json(purchaseOrder, { status: 201 });
  } catch (error) {
    console.error("POST /api/purchase-orders error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
