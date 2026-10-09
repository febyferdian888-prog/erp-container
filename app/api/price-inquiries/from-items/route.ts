import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { getAccess, guard } from "@/lib/rbac";
import { nextInquiryNumber } from "@/lib/price-inquiry";
import { loadSoCoverage } from "@/lib/so-procurement";

// Starts a vendor price inquiry straight from outstanding sales-order lines. Each line keeps
// its link to the SO line, so the PO made from the award stays tied to the right order.
export async function POST(req: NextRequest) {
  try {
    { const denied = await guard(["purchasing"], "edit"); if (denied) return denied; }
    const access = await getAccess();
    const { soItemIds } = await req.json();
    if (!Array.isArray(soItemIds) || soItemIds.length === 0) {
      return NextResponse.json({ error: "Pilih minimal satu item" }, { status: 400 });
    }

    const memberships = await prisma.userMembership.findMany({ where: { userId: access!.userId, isActive: true }, select: { companyId: true } });
    const companyIds = memberships.map((m) => m.companyId);

    const soItems = await prisma.salesOrderItem.findMany({
      where: { id: { in: soItemIds }, salesOrder: { companyId: { in: companyIds }, deletedAt: null } },
      select: { id: true, soId: true, lineNumber: true, partNumber: true, description: true, unit: true, salesOrder: { select: { companyId: true, soNumber: true } } },
    });
    if (!soItems.length) return NextResponse.json({ error: "Item tidak ditemukan" }, { status: 404 });
    const companyId = soItems[0].salesOrder.companyId;
    if (soItems.some((i) => i.salesOrder.companyId !== companyId)) {
      return NextResponse.json({ error: "Item berasal dari perusahaan berbeda" }, { status: 400 });
    }

    const soIds = [...new Set(soItems.map((i) => i.soId))];
    const coverage = await loadSoCoverage(prisma, soIds);
    const outstanding = new Map<string, number>();
    for (const id of soIds) for (const c of coverage[id].items) if (c.outstandingQty > 0) outstanding.set(c.id, c.outstandingQty);

    const alreadyRequested = await prisma.priceInquiryItem.findMany({
      where: { soItemId: { in: soItems.map((i) => i.id) }, poId: null, inquiry: { deletedAt: null, status: { notIn: ["cancelled", "closed"] } } },
      select: { soItemId: true, inquiry: { select: { number: true } } },
    });
    const skipped = new Set(alreadyRequested.map((r) => r.soItemId));

    const usable = soItems.filter((i) => outstanding.has(i.id) && !skipped.has(i.id));
    if (!usable.length) {
      return NextResponse.json({ error: "Semua item yang dipilih sudah dipesan atau sudah masuk permintaan penawaran lain" }, { status: 400 });
    }
    usable.sort((a, b) => a.salesOrder.soNumber.localeCompare(b.salesOrder.soNumber) || a.lineNumber - b.lineNumber);

    const single = new Set(usable.map((i) => i.soId)).size === 1;
    const now = new Date();
    const number = await nextInquiryNumber(companyId, now.getUTCFullYear());
    const created = await prisma.priceInquiry.create({
      data: {
        companyId,
        number,
        title: single ? `Penawaran ${usable[0].salesOrder.soNumber}` : `Penawaran ${usable.length} item dari ${new Set(usable.map((i) => i.soId)).size} SO`,
        inquiryDate: now,
        soId: single ? usable[0].soId : null,
        notes: `Dari item belum dipesan: ${[...new Set(usable.map((i) => i.salesOrder.soNumber))].join(", ")}`,
        createdBy: access!.email,
        items: {
          create: usable.map((i, idx) => ({
            lineNumber: idx + 1,
            soItemId: i.id,
            partNumber: i.partNumber,
            description: i.description,
            quantity: outstanding.get(i.id)!,
            unit: i.unit,
          })),
        },
      },
      select: { id: true, number: true },
    });

    return NextResponse.json({ ...created, itemCount: usable.length, skippedCount: soItems.length - usable.length }, { status: 201 });
  } catch (error) {
    console.error("POST /api/price-inquiries/from-items error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
