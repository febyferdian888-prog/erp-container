import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export interface CoverageOrder {
  poId: string;
  poNumber: string;
  supplierName: string;
  status: string;
  quantity: number | null; // null = PO covers the whole order without per-line links
}

export interface CoverageItem {
  id: string;
  lineNumber: number;
  partNumber: string | null;
  description: string;
  unit: string | null;
  quantity: number;
  orderedQty: number;
  outstandingQty: number;
  orders: CoverageOrder[];
}

export interface SoCoverage {
  items: CoverageItem[];
  outstandingItems: number;
  wholeOrderPos: CoverageOrder[];
}

interface SoItemRow {
  id: string;
  lineNumber: number;
  partNumber: string | null;
  description: string;
  unit: string | null;
  quantity: Prisma.Decimal | number;
}

interface PoRow {
  id: string;
  poNumber: string;
  status: string;
  soId: string | null;
  supplier: { name: string } | null;
  sources: { soId: string }[];
  items: { soItemId: string | null; quantity: Prisma.Decimal | number }[];
}

// A PO whose lines carry soItemId buys exactly those lines. A PO with no such links (made
// before per-line tracking, or a combined PO across several orders) is treated as covering
// the whole order, so existing orders do not suddenly reappear as unbought.
export function computeCoverage(soId: string, soItems: SoItemRow[], pos: PoRow[]): SoCoverage {
  const itemIds = new Set(soItems.map((i) => i.id));
  const ordered = new Map<string, number>();
  const ordersByItem = new Map<string, CoverageOrder[]>();
  const wholeOrderPos: CoverageOrder[] = [];

  for (const po of pos) {
    if (po.soId !== soId && !po.sources.some((s) => s.soId === soId)) continue;
    const base = { poId: po.id, poNumber: po.poNumber, supplierName: po.supplier?.name ?? "-", status: po.status };
    const linked = po.items.filter((i) => i.soItemId && itemIds.has(i.soItemId));
    if (linked.length === 0) {
      wholeOrderPos.push({ ...base, quantity: null });
      continue;
    }
    for (const li of linked) {
      const q = Number(li.quantity);
      ordered.set(li.soItemId!, (ordered.get(li.soItemId!) ?? 0) + q);
      ordersByItem.set(li.soItemId!, [...(ordersByItem.get(li.soItemId!) ?? []), { ...base, quantity: q }]);
    }
  }

  const items: CoverageItem[] = soItems
    .slice()
    .sort((a, b) => a.lineNumber - b.lineNumber)
    .map((i) => {
      const qty = Number(i.quantity);
      const done = wholeOrderPos.length > 0 ? qty : ordered.get(i.id) ?? 0;
      return {
        id: i.id,
        lineNumber: i.lineNumber,
        partNumber: i.partNumber,
        description: i.description,
        unit: i.unit,
        quantity: qty,
        orderedQty: done,
        outstandingQty: Math.max(qty - done, 0),
        orders: wholeOrderPos.length > 0 ? wholeOrderPos : ordersByItem.get(i.id) ?? [],
      };
    });

  return { items, outstandingItems: items.filter((i) => i.outstandingQty > 0).length, wholeOrderPos };
}

export async function loadSoCoverage(db: Db, soIds: string[]): Promise<Record<string, SoCoverage>> {
  if (!soIds.length) return {};
  const [soItems, pos] = await Promise.all([
    db.salesOrderItem.findMany({
      where: { soId: { in: soIds } },
      select: { id: true, soId: true, lineNumber: true, partNumber: true, description: true, unit: true, quantity: true },
    }),
    db.purchaseOrder.findMany({
      where: {
        deletedAt: null,
        status: { not: "cancelled" },
        OR: [{ soId: { in: soIds } }, { sources: { some: { soId: { in: soIds } } } }],
      },
      select: {
        id: true,
        poNumber: true,
        status: true,
        soId: true,
        supplier: { select: { name: true } },
        sources: { select: { soId: true } },
        items: { select: { soItemId: true, quantity: true } },
      },
    }),
  ]);

  const out: Record<string, SoCoverage> = {};
  for (const id of soIds) {
    out[id] = computeCoverage(id, soItems.filter((i) => i.soId === id), pos);
  }
  return out;
}
