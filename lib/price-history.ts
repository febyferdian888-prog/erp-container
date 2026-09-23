import { prisma } from "@/lib/db";

export interface VendorPrice {
  supplierId: string;
  supplierName: string;
  last: number;
  lastDate: string;
  lastRef: string;
  min: number;
  max: number;
  avg: number;
  count: number;
}

export interface PriceGroup {
  key: string;
  partNumber: string;
  description: string;
  vendors: VendorPrice[];
}

interface Point {
  supplierId: string;
  supplierName: string;
  partNumber: string;
  description: string;
  unitPrice: number;
  date: Date;
  ref: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function summarize(points: Point[]): VendorPrice[] {
  const byVendor = new Map<string, Point[]>();
  for (const p of points) {
    if (!byVendor.has(p.supplierId)) byVendor.set(p.supplierId, []);
    byVendor.get(p.supplierId)!.push(p);
  }
  return [...byVendor.values()]
    .map((list) => {
      list.sort((a, b) => b.date.getTime() - a.date.getTime());
      const prices = list.map((p) => p.unitPrice);
      return {
        supplierId: list[0].supplierId,
        supplierName: list[0].supplierName,
        last: list[0].unitPrice,
        lastDate: list[0].date.toISOString().slice(0, 10),
        lastRef: list[0].ref,
        min: Math.min(...prices),
        max: Math.max(...prices),
        avg: r2(prices.reduce((s, x) => s + x, 0) / prices.length),
        count: list.length,
      };
    })
    .sort((a, b) => a.last - b.last);
}

// Every purchase price we have on record: vendor bills and non-cancelled purchase orders. Prices are before PPN.
async function collect(companyIds: string[], where: { partNumbers?: string[]; q?: string }): Promise<Point[]> {
  const partFilter = where.partNumbers?.length
    ? { OR: where.partNumbers.map((p) => ({ partNumber: { equals: p, mode: "insensitive" as const } })) }
    : where.q
    ? { OR: [{ partNumber: { contains: where.q, mode: "insensitive" as const } }, { description: { contains: where.q, mode: "insensitive" as const } }] }
    : {};

  const billItems = await prisma.billItem.findMany({
    where: {
      ...partFilter,
      bill: { companyId: { in: companyIds }, deletedAt: null, status: { notIn: ["draft", "cancelled"] } },
    },
    select: {
      partNumber: true, description: true, unitPrice: true,
      bill: { select: { billNumber: true, billDate: true, supplierId: true, supplier: { select: { name: true } } } },
    },
    take: 20000,
  });

  const points: Point[] = billItems.map((i) => ({
    supplierId: i.bill.supplierId,
    supplierName: i.bill.supplier.name,
    partNumber: i.partNumber ?? "",
    description: i.description,
    unitPrice: Number(i.unitPrice),
    date: i.bill.billDate,
    ref: i.bill.billNumber,
  }));

  // purchase orders identify parts through the linked sparepart (SKU)
  const products = await prisma.product.findMany({
    where: {
      companyId: { in: companyIds },
      ...(where.partNumbers?.length
        ? { OR: where.partNumbers.map((p) => ({ sku: { equals: p, mode: "insensitive" as const } })) }
        : where.q
        ? { OR: [{ sku: { contains: where.q, mode: "insensitive" as const } }, { name: { contains: where.q, mode: "insensitive" as const } }] }
        : {}),
    },
    select: { id: true, sku: true },
  });
  if (products.length) {
    const skuById = new Map(products.map((p) => [p.id, p.sku]));
    const poItems = await prisma.purchaseOrderItem.findMany({
      where: {
        productId: { in: products.map((p) => p.id) },
        purchaseOrder: { companyId: { in: companyIds }, deletedAt: null, status: { notIn: ["draft", "cancelled"] } },
      },
      select: {
        productId: true, description: true, unitPrice: true,
        purchaseOrder: { select: { poNumber: true, poDate: true, supplierId: true, supplier: { select: { name: true } } } },
      },
      take: 20000,
    });
    for (const i of poItems) {
      points.push({
        supplierId: i.purchaseOrder.supplierId,
        supplierName: i.purchaseOrder.supplier.name,
        partNumber: skuById.get(i.productId as string) ?? "",
        description: i.description,
        unitPrice: Number(i.unitPrice),
        date: i.purchaseOrder.poDate,
        ref: i.purchaseOrder.poNumber,
      });
    }
  }
  return points;
}

const groupKey = (p: { partNumber: string; description: string }) =>
  (p.partNumber.trim() ? `p:${p.partNumber.trim().toLowerCase()}` : `d:${p.description.trim().toLowerCase()}`);

export async function searchPriceHistory(companyIds: string[], q: string): Promise<PriceGroup[]> {
  const points = await collect(companyIds, { q });
  const groups = new Map<string, Point[]>();
  for (const p of points) {
    const k = groupKey(p);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(p);
  }
  return [...groups.entries()]
    .map(([key, list]) => ({
      key,
      partNumber: list.find((p) => p.partNumber)?.partNumber ?? "",
      description: list.sort((a, b) => b.date.getTime() - a.date.getTime())[0].description,
      vendors: summarize(list),
    }))
    .sort((a, b) => b.vendors.reduce((s, v) => s + v.count, 0) - a.vendors.reduce((s, v) => s + v.count, 0))
    .slice(0, 100);
}

// Vendor price history for a list of inquiry items (matched on part number).
export async function historyForItems(companyIds: string[], items: { partNumber?: string | null; description: string }[]) {
  const partNumbers = [...new Set(items.map((i) => (i.partNumber || "").trim()).filter(Boolean))];
  const points = partNumbers.length ? await collect(companyIds, { partNumbers }) : [];
  const byPart = new Map<string, Point[]>();
  for (const p of points) {
    const k = p.partNumber.trim().toLowerCase();
    if (!byPart.has(k)) byPart.set(k, []);
    byPart.get(k)!.push(p);
  }
  return items.map((i) => {
    const k = (i.partNumber || "").trim().toLowerCase();
    return k && byPart.has(k) ? summarize(byPart.get(k)!) : [];
  });
}
