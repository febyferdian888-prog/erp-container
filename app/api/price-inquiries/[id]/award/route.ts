import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { getAccess, guard } from "@/lib/rbac";
import { createPurchaseOrdersFromAward } from "@/lib/price-inquiry";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    { const denied = await guard(["purchasing"], "edit"); if (denied) return denied; }
    const access = await getAccess();
    const { id } = await params;
    const inquiry = await prisma.priceInquiry.findUnique({ where: { id }, select: { companyId: true, deletedAt: true } });
    if (!inquiry || inquiry.deletedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const member = await prisma.userMembership.findFirst({ where: { userId: access!.userId, companyId: inquiry.companyId, isActive: true } });
    if (!member) return NextResponse.json({ error: "No access" }, { status: 403 });

    const created = await createPurchaseOrdersFromAward(id, access!.email);
    const suppliers = await prisma.supplier.findMany({ where: { id: { in: created.map((c) => c.supplierId) } }, select: { id: true, name: true } });
    return NextResponse.json({
      purchaseOrders: created.map((c) => ({ ...c, supplierName: suppliers.find((s) => s.id === c.supplierId)?.name ?? "" })),
    });
  } catch (error) {
    if (error instanceof Error && /belum|tidak ditemukan/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("POST /api/price-inquiries/[id]/award error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
