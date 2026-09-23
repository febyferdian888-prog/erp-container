import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { getAccess, guard } from "@/lib/rbac";

interface QuoteInput { unitPrice: number | null; leadTimeDays?: number | null; notes?: string | null }
interface ItemInput {
  id?: string;
  partNumber?: string;
  description: string;
  quantity: number;
  unit?: string;
  awardedSupplierId?: string | null;
  quotes?: Record<string, QuoteInput | null>;
}

async function load(id: string) {
  return prisma.priceInquiry.findUnique({
    where: { id },
    include: {
      salesOrder: { select: { id: true, soNumber: true, poNumber: true } },
      vendors: { include: { supplier: { select: { id: true, code: true, name: true } } }, orderBy: { createdAt: "asc" } },
      items: {
        orderBy: { lineNumber: "asc" },
        include: { quotes: true, purchaseOrder: { select: { id: true, poNumber: true } } },
      },
    },
  });
}

async function checkAccess(companyId: string) {
  const access = await getAccess();
  const m = await prisma.userMembership.findFirst({ where: { userId: access!.userId, companyId, isActive: true } });
  return m ? access : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    { const denied = await guard(["purchasing"], "view"); if (denied) return denied; }
    const { id } = await params;
    const inquiry = await load(id);
    if (!inquiry || inquiry.deletedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!(await checkAccess(inquiry.companyId))) return NextResponse.json({ error: "No access" }, { status: 403 });

    return NextResponse.json({
      ...inquiry,
      items: inquiry.items.map((i) => ({
        id: i.id, lineNumber: i.lineNumber, partNumber: i.partNumber, description: i.description, quantity: Number(i.quantity), unit: i.unit,
        awardedSupplierId: i.awardedSupplierId, poId: i.poId, poNumber: i.purchaseOrder?.poNumber ?? null,
        quotes: Object.fromEntries(i.quotes.map((q) => [q.supplierId, { unitPrice: Number(q.unitPrice), leadTimeDays: q.leadTimeDays, notes: q.notes }])),
      })),
    });
  } catch (error) {
    console.error("GET /api/price-inquiries/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    { const denied = await guard(["purchasing"], "edit"); if (denied) return denied; }
    const { id } = await params;
    const existing = await prisma.priceInquiry.findUnique({ where: { id }, include: { items: true, vendors: true } });
    if (!existing || existing.deletedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!(await checkAccess(existing.companyId))) return NextResponse.json({ error: "No access" }, { status: 403 });

    const body = await req.json();
    const { title, inquiryDate, neededDate, soId, notes, status } = body;
    const vendorIds: string[] = [...new Set<string>(body.vendorIds || [])];
    const items: ItemInput[] = body.items || [];
    if (!title?.trim() || !inquiryDate) return NextResponse.json({ error: "Judul dan tanggal wajib diisi" }, { status: 400 });

    const vendorSet = new Set(vendorIds);
    const locked = new Set(existing.items.filter((i) => i.poId).map((i) => i.id));

    await prisma.$transaction(async (tx) => {
      await tx.priceInquiry.update({
        where: { id },
        data: {
          title: title.trim(),
          inquiryDate: new Date(inquiryDate),
          neededDate: neededDate ? new Date(neededDate) : null,
          soId: soId || null,
          notes: notes || null,
          ...(status ? { status } : {}),
        },
      });

      // vendors: add new ones, drop removed ones together with their quotes
      const have = new Set(existing.vendors.map((v) => v.supplierId));
      const removed = [...have].filter((s) => !vendorSet.has(s));
      if (removed.length) {
        await tx.priceInquiryVendor.deleteMany({ where: { inquiryId: id, supplierId: { in: removed } } });
        await tx.priceQuote.deleteMany({ where: { item: { inquiryId: id }, supplierId: { in: removed } } });
        await tx.priceInquiryItem.updateMany({ where: { inquiryId: id, awardedSupplierId: { in: removed }, poId: null }, data: { awardedSupplierId: null } });
      }
      for (const s of vendorIds) if (!have.has(s)) await tx.priceInquiryVendor.create({ data: { inquiryId: id, supplierId: s } });

      // items: keep the ones sent, delete the rest (except lines that already became a PO)
      const keepIds = new Set(items.filter((i) => i.id).map((i) => i.id as string));
      const drop = existing.items.filter((i) => !keepIds.has(i.id) && !locked.has(i.id)).map((i) => i.id);
      if (drop.length) await tx.priceInquiryItem.deleteMany({ where: { id: { in: drop } } });

      let nextLine = existing.items.reduce((m, i) => Math.max(m, i.lineNumber), 0);
      for (const it of items) {
        if (!it.description?.trim() || !(Number(it.quantity) > 0)) continue;
        if (it.id && locked.has(it.id)) continue; // already ordered, read-only

        const awarded = it.awardedSupplierId && vendorSet.has(it.awardedSupplierId) ? it.awardedSupplierId : null;
        const base = {
          partNumber: it.partNumber?.trim() || null,
          description: it.description.trim(),
          quantity: Number(it.quantity),
          unit: it.unit?.trim() || null,
          awardedSupplierId: awarded,
        };
        let itemId = it.id;
        if (itemId && existing.items.some((e) => e.id === itemId)) {
          await tx.priceInquiryItem.update({ where: { id: itemId }, data: base });
        } else {
          nextLine++;
          itemId = (await tx.priceInquiryItem.create({ data: { inquiryId: id, lineNumber: nextLine, ...base } })).id;
        }

        for (const [supplierId, q] of Object.entries(it.quotes || {})) {
          if (!vendorSet.has(supplierId)) continue;
          if (!q || q.unitPrice === null || q.unitPrice === undefined || !(Number(q.unitPrice) >= 0)) {
            await tx.priceQuote.deleteMany({ where: { itemId, supplierId } });
            continue;
          }
          const data = {
            unitPrice: Number(q.unitPrice),
            leadTimeDays: q.leadTimeDays === null || q.leadTimeDays === undefined || q.leadTimeDays === ("" as unknown) ? null : Number(q.leadTimeDays),
            notes: q.notes?.trim() || null,
          };
          await tx.priceQuote.upsert({
            where: { itemId_supplierId: { itemId: itemId!, supplierId } },
            update: data,
            create: { itemId: itemId!, supplierId, ...data },
          });
        }
        // a line can only be awarded to a vendor that quoted it
        if (awarded) {
          const has = await tx.priceQuote.findUnique({ where: { itemId_supplierId: { itemId: itemId!, supplierId: awarded } } });
          if (!has) await tx.priceInquiryItem.update({ where: { id: itemId! }, data: { awardedSupplierId: null } });
        }
      }
    }, { timeout: 30000, maxWait: 10000 });

    return NextResponse.json(await load(id));
  } catch (error) {
    console.error("PUT /api/price-inquiries/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    { const denied = await guard(["purchasing"], "edit"); if (denied) return denied; }
    const { id } = await params;
    const existing = await prisma.priceInquiry.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!(await checkAccess(existing.companyId))) return NextResponse.json({ error: "No access" }, { status: 403 });
    await prisma.priceInquiry.update({ where: { id }, data: { deletedAt: new Date() } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/price-inquiries/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
