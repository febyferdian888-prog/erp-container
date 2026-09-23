import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { getAccess, guard } from "@/lib/rbac";
import { nextInquiryNumber } from "@/lib/price-inquiry";

export async function GET() {
  try {
    { const denied = await guard(["purchasing"], "view"); if (denied) return denied; }
    const access = await getAccess();
    const memberships = await prisma.userMembership.findMany({ where: { userId: access!.userId, isActive: true }, select: { companyId: true } });

    const rows = await prisma.priceInquiry.findMany({
      where: { companyId: { in: memberships.map((m) => m.companyId) }, deletedAt: null },
      include: {
        salesOrder: { select: { soNumber: true } },
        vendors: { select: { supplierId: true } },
        items: { select: { id: true, poId: true, awardedSupplierId: true, quotes: { select: { supplierId: true } } } },
      },
      orderBy: { inquiryDate: "desc" },
    });

    return NextResponse.json(
      rows.map((r) => ({
        id: r.id, number: r.number, title: r.title, inquiryDate: r.inquiryDate, neededDate: r.neededDate, status: r.status,
        soNumber: r.salesOrder?.soNumber ?? null,
        vendorCount: r.vendors.length,
        itemCount: r.items.length,
        quotedCount: r.items.filter((i) => i.quotes.length > 0).length,
        awardedCount: r.items.filter((i) => i.awardedSupplierId).length,
        poCount: new Set(r.items.map((i) => i.poId).filter(Boolean)).size,
      }))
    );
  } catch (error) {
    console.error("GET /api/price-inquiries error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    { const denied = await guard(["purchasing"], "edit"); if (denied) return denied; }
    const access = await getAccess();
    const body = await req.json();
    const { companyId, title, inquiryDate, neededDate, soId, notes, vendorIds, items } = body;

    const member = await prisma.userMembership.findFirst({ where: { userId: access!.userId, companyId, isActive: true } });
    if (!member) return NextResponse.json({ error: "No access" }, { status: 403 });
    if (!title?.trim() || !inquiryDate) return NextResponse.json({ error: "Judul dan tanggal wajib diisi" }, { status: 400 });
    const cleanItems = (items || []).filter((i: { description?: string; quantity?: number }) => i.description?.trim() && Number(i.quantity) > 0);
    if (!cleanItems.length) return NextResponse.json({ error: "Isi minimal satu item dengan qty" }, { status: 400 });

    const date = new Date(inquiryDate);
    const number = await nextInquiryNumber(companyId, date.getUTCFullYear());
    const created = await prisma.priceInquiry.create({
      data: {
        companyId,
        number,
        title: title.trim(),
        inquiryDate: date,
        neededDate: neededDate ? new Date(neededDate) : null,
        soId: soId || null,
        notes: notes || null,
        createdBy: access!.email,
        vendors: { create: [...new Set<string>(vendorIds || [])].map((supplierId) => ({ supplierId })) },
        items: {
          create: cleanItems.map((i: { partNumber?: string; description: string; quantity: number; unit?: string }, idx: number) => ({
            lineNumber: idx + 1,
            partNumber: i.partNumber?.trim() || null,
            description: i.description.trim(),
            quantity: Number(i.quantity),
            unit: i.unit?.trim() || null,
          })),
        },
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("POST /api/price-inquiries error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
