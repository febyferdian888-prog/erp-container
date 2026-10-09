import { loadSoCoverage } from "./so-procurement";
import type { Prisma } from "@prisma/client";

export type SoProgressTone = "slate" | "indigo" | "amber" | "blue" | "green" | "red";

export interface SoProgress {
  key: string;
  label: string;
  tone: SoProgressTone;
}

export interface SoProgressFacts {
  status: string;
  procurementSkipped: boolean;
  orderedQty: number;
  deliveredQty: number;
  hasDelivery: boolean;
  hasInvoice: boolean;
  poStatuses: string[];
  uncoveredItems?: number;
  deliveryDebt?: boolean;
}

export function deriveSoProgress(f: SoProgressFacts): SoProgress {
  if (f.status === "cancelled") return { key: "cancelled", label: "Dibatalkan", tone: "red" };

  // Closed by hand (e.g. non-PKP customer, no delivery note or invoice on record).
  if (f.status === "invoiced" && !f.hasInvoice && !f.hasDelivery) return { key: "done", label: "Selesai (ditutup manual)", tone: "green" };

  const fullyDelivered = f.hasDelivery && f.deliveredQty >= f.orderedQty;

  if (f.hasInvoice && fullyDelivered) return { key: "done", label: "Selesai", tone: "green" };
  if (f.hasInvoice && f.deliveryDebt) return { key: "delivery_debt", label: "Hutang kirim (sudah di-invoice)", tone: "amber" };
  if (f.hasInvoice) return { key: "waiting_delivery", label: "Waiting delivery", tone: "amber" };
  if (f.hasDelivery && f.deliveryDebt && !fullyDelivered) return { key: "delivery_debt", label: "Hutang kirim", tone: "amber" };
  if (f.hasDelivery) {
    return fullyDelivered
      ? { key: "waiting_invoice", label: "Menunggu invoice", tone: "blue" }
      : { key: "partial_delivery", label: "Kirim sebagian", tone: "amber" };
  }

  if (f.poStatuses.length > 0 && (f.uncoveredItems ?? 0) > 0) {
    return { key: "partial_purchasing", label: `Pengadaan sebagian (${f.uncoveredItems} item belum di-PO)`, tone: "amber" };
  }
  if (f.poStatuses.length > 0) {
    const receivedAll = f.poStatuses.every((s) => s === "received" || s === "invoiced");
    const receivedAny = f.poStatuses.some((s) => s === "received" || s === "partial_received" || s === "invoiced");
    if (receivedAll) return { key: "ready_to_ship", label: "Barang siap kirim", tone: "indigo" };
    if (receivedAny) return { key: "partial_received", label: "Barang datang sebagian", tone: "indigo" };
    return { key: "waiting_vendor", label: "Menunggu barang vendor", tone: "indigo" };
  }
  if (f.procurementSkipped) return { key: "ready_to_ship", label: "Siap kirim (dari stok)", tone: "indigo" };
  return { key: "needs_purchasing", label: "Perlu diproses purchasing", tone: "slate" };
}

type Db = Prisma.TransactionClient | import("@prisma/client").PrismaClient;

export async function loadSoProgress(db: Db, soIds: string[]): Promise<Record<string, SoProgress>> {
  if (!soIds.length) return {};
  const coverage = await loadSoCoverage(db, soIds);
  const [orders, deliveries, invoices, pos] = await Promise.all([
    db.salesOrder.findMany({
      where: { id: { in: soIds } },
      select: { id: true, status: true, procurementSkippedAt: true, deliveryDebtAt: true, items: { select: { quantity: true } } },
    }),
    db.delivery.findMany({
      where: { soId: { in: soIds }, deletedAt: null, status: { not: "cancelled" } },
      select: { soId: true, items: { select: { quantity: true } } },
    }),
    db.invoice.findMany({
      where: { soId: { in: soIds }, deletedAt: null, status: { not: "cancelled" } },
      select: { soId: true },
    }),
    db.purchaseOrder.findMany({
      where: {
        deletedAt: null,
        status: { not: "cancelled" },
        OR: [{ soId: { in: soIds } }, { sources: { some: { soId: { in: soIds } } } }],
      },
      select: { status: true, soId: true, sources: { select: { soId: true } } },
    }),
  ]);

  const out: Record<string, SoProgress> = {};
  for (const o of orders) {
    const myDeliveries = deliveries.filter((d) => d.soId === o.id);
    const poStatuses = pos
      .filter((p) => p.soId === o.id || p.sources.some((s) => s.soId === o.id))
      .map((p) => p.status);
    out[o.id] = deriveSoProgress({
      status: o.status,
      procurementSkipped: !!o.procurementSkippedAt,
      orderedQty: o.items.reduce((s, i) => s + Number(i.quantity), 0),
      deliveredQty: myDeliveries.reduce((s, d) => s + d.items.reduce((a, i) => a + Number(i.quantity), 0), 0),
      hasDelivery: myDeliveries.length > 0,
      hasInvoice: invoices.some((i) => i.soId === o.id),
      poStatuses,
      uncoveredItems: coverage[o.id]?.outstandingItems ?? 0,
      deliveryDebt: !!o.deliveryDebtAt,
    });
  }
  return out;
}
