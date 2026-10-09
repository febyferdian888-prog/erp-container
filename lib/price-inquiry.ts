import { prisma } from "@/lib/db";

export async function nextInquiryNumber(companyId: string, year: number) {
  const prefix = `PH-${year}-`;
  const last = await prisma.priceInquiry.findFirst({
    where: { companyId, number: { startsWith: prefix } },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  const seq = last ? parseInt(last.number.slice(prefix.length), 10) || 0 : 0;
  return `${prefix}${String(seq + 1).padStart(4, "0")}`;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

// One draft purchase order per awarded vendor. Lines already turned into a PO are skipped.
export async function createPurchaseOrdersFromAward(inquiryId: string, userEmail: string) {
  const inquiry = await prisma.priceInquiry.findUnique({
    where: { id: inquiryId },
    include: { items: { include: { quotes: true }, orderBy: { lineNumber: "asc" } } },
  });
  if (!inquiry || inquiry.deletedAt) throw new Error("Permintaan harga tidak ditemukan");

  const pending = inquiry.items.filter((i) => i.awardedSupplierId && !i.poId);
  if (!pending.length) throw new Error("Belum ada item terpilih yang perlu dibuatkan PO");

  const bySupplier = new Map<string, typeof pending>();
  for (const item of pending) {
    const quote = item.quotes.find((q) => q.supplierId === item.awardedSupplierId);
    if (!quote) throw new Error(`Item "${item.description}" belum punya harga dari vendor yang dipilih`);
    if (!bySupplier.has(item.awardedSupplierId!)) bySupplier.set(item.awardedSupplierId!, []);
    bySupplier.get(item.awardedSupplierId!)!.push(item);
  }

  const year = new Date().getUTCFullYear();
  const prefix = `PO-${year}-`;
  const last = await prisma.purchaseOrder.findFirst({
    where: { companyId: inquiry.companyId, poNumber: { startsWith: prefix } },
    orderBy: { poNumber: "desc" },
    select: { poNumber: true },
  });
  let seq = last ? parseInt(last.poNumber.slice(prefix.length), 10) || 0 : 0;

  const soItemIds = pending.map((i) => i.soItemId).filter((v): v is string => !!v);
  const soItemRows = soItemIds.length
    ? await prisma.salesOrderItem.findMany({ where: { id: { in: soItemIds } }, select: { id: true, soId: true } })
    : [];
  const soOfItem = new Map(soItemRows.map((r) => [r.id, r.soId]));

  const products = await prisma.product.findMany({ where: { companyId: inquiry.companyId }, select: { id: true, sku: true } });
  const productBySku = new Map(products.map((p) => [p.sku.trim().toLowerCase(), p.id]));

  const created: { id: string; poNumber: string; supplierId: string; total: number; lines: number }[] = [];
  for (const [supplierId, items] of bySupplier) {
    seq++;
    const poNumber = `${prefix}${String(seq).padStart(4, "0")}`;
    const lines = items.map((item, idx) => {
      const price = Number(item.quotes.find((q) => q.supplierId === supplierId)!.unitPrice);
      return {
        item,
        data: {
          lineNumber: idx + 1,
          productId: item.partNumber ? productBySku.get(item.partNumber.trim().toLowerCase()) ?? null : null,
          soItemId: item.soItemId && soOfItem.has(item.soItemId) ? item.soItemId : null,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: price,
          subtotal: r2(Number(item.quantity) * price),
          notes: item.partNumber ? `Part: ${item.partNumber}` : null,
        },
      };
    });
    const poSoIds = [...new Set(items.map((i) => (i.soItemId ? soOfItem.get(i.soItemId) : undefined)).filter((v): v is string => !!v))];
    if (!poSoIds.length && inquiry.soId) poSoIds.push(inquiry.soId);
    const po = await prisma.purchaseOrder.create({
      data: {
        companyId: inquiry.companyId,
        supplierId,
        soId: poSoIds[0] ?? inquiry.soId,
        sources: { create: poSoIds.map((soId) => ({ soId })) },
        poNumber,
        poDate: new Date(),
        status: "draft",
        notes: `Dari permintaan harga ${inquiry.number}`,
        createdBy: userEmail,
        items: { create: lines.map((l) => l.data) },
      },
    });
    await prisma.priceInquiryItem.updateMany({ where: { id: { in: items.map((i) => i.id) } }, data: { poId: po.id } });
    created.push({ id: po.id, poNumber, supplierId, total: r2(lines.reduce((s, l) => s + l.data.subtotal, 0)), lines: lines.length });
  }

  const remaining = await prisma.priceInquiryItem.count({ where: { inquiryId, poId: null } });
  if (remaining === 0) await prisma.priceInquiry.update({ where: { id: inquiryId }, data: { status: "awarded" } });
  return created;
}
