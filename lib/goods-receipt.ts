import type { Prisma } from "@prisma/client";
import { formatDocumentNumber, currentYearRange } from "./document-number";

type Tx = Prisma.TransactionClient;

/**
 * Raises (or re-syncs) the draft goods receipt that's waiting for SCM once a PO
 * is sent/confirmed to a vendor — so there's always something to check against
 * when the delivery actually shows up, pre-filled with the ordered quantities
 * and the default warehouse, instead of SCM having to start a GR from a blank
 * form. Safe to call on every PO save: it no-ops once an active GR already
 * exists and has been confirmed (stockApplied), and re-syncs the draft's items
 * to the PO's current items if the PO was edited before SCM got to it.
 */
export async function ensureAutoGoodsReceipt(tx: Tx, poId: string, actorEmail: string | null) {
  const po = await tx.purchaseOrder.findUnique({ where: { id: poId }, include: { items: true } });
  if (!po || po.status === "cancelled") return;

  // Only an unconfirmed auto-draft blocks/needs re-syncing — a confirmed receipt (full or
  // partial) is a done historical record, not something to keep editing in place; any
  // quantity still outstanding after it gets a fresh draft of its own below.
  const pendingDraft = await tx.goodsReceipt.findFirst({
    where: { poId, deletedAt: null, autoCreated: true, stockApplied: false },
  });
  const outstanding = po.items.filter((item) => Number(item.quantity) - Number(item.receivedQty) > 0);

  if (pendingDraft) {
    await tx.goodsReceiptItem.deleteMany({ where: { grId: pendingDraft.id } });
    if (!outstanding.length) {
      await tx.goodsReceipt.update({ where: { id: pendingDraft.id }, data: { deletedAt: new Date() } });
      return;
    }
    await tx.goodsReceiptItem.createMany({
      data: outstanding.map((item) => ({
        grId: pendingDraft.id,
        poItemId: item.id,
        productId: item.productId,
        quantity: Number(item.quantity) - Number(item.receivedQty),
        unit: item.unit,
        condition: "good",
      })),
    });
    return;
  }

  if (!outstanding.length) return;

  const warehouse = await tx.warehouse.findFirst({
    where: { companyId: po.companyId, OR: [{ code: "WH-01" }, { name: { contains: "Utama" } }] },
  });

  const { year, start, end } = currentYearRange();
  const count = await tx.goodsReceipt.count({ where: { companyId: po.companyId, createdAt: { gte: start, lt: end } } });
  const receiptNumber = formatDocumentNumber("GR", year, count + 1);

  await tx.goodsReceipt.create({
    data: {
      companyId: po.companyId,
      poId: po.id,
      warehouseId: warehouse?.id ?? null,
      receiptNumber,
      receiptDate: new Date(),
      status: "draft",
      stockApplied: false,
      autoCreated: true,
      notes: "Dibuat otomatis saat PO dikirim/dikonfirmasi ke vendor — qty masih sesuai pesanan, menunggu SCM cek qty aktual saat barang tiba.",
      createdBy: actorEmail,
      items: {
        create: outstanding.map((item) => ({
          poItemId: item.id,
          productId: item.productId,
          quantity: Number(item.quantity) - Number(item.receivedQty),
          unit: item.unit,
          condition: "good",
        })),
      },
    },
  });
}

interface StockItem {
  id: string;
  poItemId: string | null;
  productId: string | null;
  quantity: Prisma.Decimal | number;
  condition: string;
}

/** Posts a goods receipt's items to PO receivedQty and warehouse stock. Runs once, the
 * first time a receipt is confirmed (see GoodsReceipt.stockApplied) — never call twice
 * for the same receipt or quantities will be double-counted. */
export async function applyGoodsReceiptToStock(
  tx: Tx,
  gr: { id: string; poId: string; warehouseId: string | null; receiptNumber: string },
  items: StockItem[],
  actorEmail: string | null
) {
  for (const item of items) {
    const qty = Number(item.quantity);
    if (qty <= 0) continue;

    if (item.poItemId) {
      await tx.purchaseOrderItem.update({
        where: { id: item.poItemId },
        data: { receivedQty: { increment: qty } },
      });
    }

    if (gr.warehouseId && item.productId && item.condition !== "defect") {
      const product = await tx.product.findUnique({ where: { id: item.productId } });
      if (product) {
        const existingStock = await tx.stock.findFirst({
          where: { warehouseId: gr.warehouseId, productId: item.productId, locationId: null },
        });
        if (existingStock) {
          await tx.stock.update({ where: { id: existingStock.id }, data: { quantity: { increment: qty } } });
        } else {
          await tx.stock.create({ data: { warehouseId: gr.warehouseId, productId: item.productId, quantity: qty } });
        }

        await tx.stockMovement.create({
          data: {
            warehouseId: gr.warehouseId,
            productId: item.productId,
            unitId: product.unitId,
            referenceType: "GoodsReceipt",
            referenceId: gr.id,
            quantity: qty,
            type: "IN",
            reason: "Goods receipt",
            notes: `Received against ${gr.receiptNumber}`,
            createdBy: actorEmail,
          },
        });
      }
    }
  }

  const poItems = await tx.purchaseOrderItem.findMany({ where: { poId: gr.poId } });
  const allReceived = poItems.every((i) => Number(i.receivedQty) >= Number(i.quantity));
  const anyReceived = poItems.some((i) => Number(i.receivedQty) > 0);
  await tx.purchaseOrder.update({
    where: { id: gr.poId },
    data: { status: allReceived ? "received" : anyReceived ? "partial_received" : undefined },
  });
}
