import type { Prisma } from "@prisma/client";
import { computeInvoiceMoney, nextDocumentStatus } from "./invoice-money";

type Tx = Prisma.TransactionClient;

export async function recalcInvoiceStatus(tx: Tx, invoiceId: string) {
  const inv = await tx.invoice.findUnique({ where: { id: invoiceId } });
  if (!inv || inv.status === "cancelled") return;
  const money = computeInvoiceMoney(inv);
  const next = nextDocumentStatus(inv.status, money);
  if (next !== inv.status) await tx.invoice.update({ where: { id: invoiceId }, data: { status: next } });
}

export async function recalcSalesOrderStatus(tx: Tx, soId: string | null | undefined) {
  if (!soId) return;
  const so = await tx.salesOrder.findUnique({
    where: { id: soId },
    include: { items: true },
  });
  if (!so || so.status === "cancelled") return;

  const invoiceCount = await tx.invoice.count({
    where: { soId, deletedAt: null, status: { not: "cancelled" } },
  });
  if (invoiceCount > 0) {
    if (so.status !== "invoiced") await tx.salesOrder.update({ where: { id: soId }, data: { status: "invoiced" } });
    return;
  }

  const delivered = await tx.deliveryItem.aggregate({
    _sum: { quantity: true },
    where: { delivery: { soId, deletedAt: null, status: { not: "cancelled" } } },
  });
  const deliveredQty = Number(delivered._sum.quantity || 0);
  const orderedQty = so.items.reduce((s, i) => s + Number(i.quantity), 0);

  // A draft order with nothing shipped or billed stays draft; once a document exists it is no longer a draft.
  if (deliveredQty <= 0 && so.status === "draft") return;

  const next =
    deliveredQty <= 0 ? "confirmed" : deliveredQty >= orderedQty ? "delivered" : "partially_delivered";
  if (next !== so.status) await tx.salesOrder.update({ where: { id: soId }, data: { status: next } });
}

// Delivery items are matched to the sparepart master by part number == product SKU.
export async function applyDeliveryStock(
  tx: Tx,
  delivery: { id: string; deliveryNumber: string; companyId: string; warehouseId: string | null },
  items: { partNumber: string | null; quantity: unknown }[],
  userEmail: string
) {
  if (!delivery.warehouseId) return;

  for (const item of items) {
    const sku = (item.partNumber || "").trim();
    if (!sku) continue;
    const product = await tx.product.findFirst({
      where: { companyId: delivery.companyId, sku: { equals: sku, mode: "insensitive" } },
    });
    if (!product) continue;

    const qty = Number(item.quantity);
    const stock = await tx.stock.findFirst({
      where: { warehouseId: delivery.warehouseId, productId: product.id, locationId: null },
    });
    const onHand = stock ? Number(stock.quantity) : 0;
    if (onHand < qty) {
      throw new Error(`Insufficient stock for ${product.sku}: ${onHand} on hand, ${qty} needed`);
    }
    await tx.stock.update({ where: { id: stock!.id }, data: { quantity: { decrement: qty } } });
    await tx.stockMovement.create({
      data: {
        warehouseId: delivery.warehouseId,
        productId: product.id,
        unitId: product.unitId,
        referenceType: "Delivery",
        referenceId: delivery.id,
        quantity: qty,
        type: "OUT",
        reason: "Delivery to customer",
        notes: `Shipped on ${delivery.deliveryNumber}`,
        createdBy: userEmail,
      },
    });
  }
}

export async function reverseDeliveryStock(tx: Tx, deliveryId: string) {
  const movements = await tx.stockMovement.findMany({
    where: { referenceType: "Delivery", referenceId: deliveryId },
  });
  for (const m of movements) {
    const stock = await tx.stock.findFirst({
      where: { warehouseId: m.warehouseId, productId: m.productId, locationId: null },
    });
    if (stock) {
      await tx.stock.update({ where: { id: stock.id }, data: { quantity: { increment: m.quantity } } });
    } else {
      await tx.stock.create({ data: { warehouseId: m.warehouseId, productId: m.productId, quantity: m.quantity } });
    }
  }
  await tx.stockMovement.deleteMany({ where: { referenceType: "Delivery", referenceId: deliveryId } });
}

export async function recalcBillStatus(tx: Tx, billId: string) {
  const bill = await tx.bill.findUnique({ where: { id: billId } });
  if (!bill || bill.status === "cancelled") return;
  const money = computeInvoiceMoney(bill);
  const next = nextDocumentStatus(bill.status, money, "received");
  if (next !== bill.status) await tx.bill.update({ where: { id: billId }, data: { status: next } });
}
