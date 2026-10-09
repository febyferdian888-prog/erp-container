import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { userHasCompanyAccess } from "@/lib/company-access";
import { formatDocumentNumber, currentYearRange } from "@/lib/document-number";
import { applyGoodsReceiptToStock, ensureAutoGoodsReceipt } from "@/lib/goods-receipt";

// Marks ticked PO lines as received straight from the SCM summary: records a goods receipt for
// them (full outstanding quantity unless SCM types less), posts stock and PO receivedQty,
// and re-syncs the waiting draft receipt to whatever is still outstanding.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    { const denied = await guard(["purchasing"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const { items } = (await req.json()) as { items?: { poItemId: string; quantity?: number }[] };
    if (!Array.isArray(items) || items.length === 0) return NextResponse.json({ error: "Pilih minimal satu item" }, { status: 400 });

    const po = await prisma.purchaseOrder.findFirst({ where: { id, deletedAt: null }, include: { items: true } });
    if (!po || !(await userHasCompanyAccess(prisma, session.user.id, po.companyId))) {
      return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });
    }
    if (!["sent", "confirmed", "partial_received", "received"].includes(po.status)) {
      return NextResponse.json({ error: "PO harus sudah dikirim ke vendor sebelum penerimaan dicatat" }, { status: 400 });
    }

    const lines: { item: (typeof po.items)[number]; qty: number }[] = [];
    for (const req of items) {
      const item = po.items.find((i) => i.id === req.poItemId);
      if (!item) return NextResponse.json({ error: "Item bukan bagian dari PO ini" }, { status: 400 });
      const remaining = Number(item.quantity) - Number(item.receivedQty);
      const qty = req.quantity === undefined ? remaining : Number(req.quantity);
      if (!Number.isFinite(qty) || qty <= 0) return NextResponse.json({ error: `Qty diterima "${item.description}" harus lebih dari 0` }, { status: 400 });
      if (qty > remaining + 0.0001) return NextResponse.json({ error: `Qty "${item.description}" melebihi sisa yang belum diterima (${remaining})` }, { status: 400 });
      lines.push({ item, qty });
    }

    const warehouse = await prisma.warehouse.findFirst({
      where: { companyId: po.companyId, OR: [{ code: "WH-01" }, { name: { contains: "Utama" } }] },
    });

    const result = await prisma.$transaction(async (tx) => {
      const { year, start, end } = currentYearRange();
      const count = await tx.goodsReceipt.count({ where: { companyId: po.companyId, createdAt: { gte: start, lt: end } } });
      const gr = await tx.goodsReceipt.create({
        data: {
          companyId: po.companyId,
          poId: po.id,
          warehouseId: warehouse?.id ?? null,
          receiptNumber: formatDocumentNumber("GR", year, count + 1),
          receiptDate: new Date(),
          status: "received",
          stockApplied: true,
          autoCreated: false,
          notes: "Ditandai diterima dari ringkasan SCM",
          createdBy: session.user!.email,
          items: {
            create: lines.map((l) => ({
              poItemId: l.item.id,
              productId: l.item.productId,
              quantity: l.qty,
              unit: l.item.unit,
              condition: "good",
            })),
          },
        },
        include: { items: true },
      });
      await applyGoodsReceiptToStock(tx, { id: gr.id, poId: po.id, warehouseId: gr.warehouseId, receiptNumber: gr.receiptNumber }, gr.items, session.user!.email!);
      await ensureAutoGoodsReceipt(tx, po.id, session.user!.email!);
      return gr;
    });

    return NextResponse.json({ ok: true, receiptNumber: result.receiptNumber });
  } catch (error) {
    console.error("POST /api/purchase-orders/[id]/receive error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
