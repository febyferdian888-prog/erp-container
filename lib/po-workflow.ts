import type { Prisma, PrismaClient } from "@prisma/client";
import { tierState } from "./approval";

type Db = PrismaClient | Prisma.TransactionClient;

export type PoOwner = "scm" | "director" | "finance" | "vendor" | "none";

// Who has to move the PO next; drives the Supply Chain task list.
export function ownerOf(key: string): PoOwner {
  switch (key) {
    case "needs_approval":
    case "approved":
    case "needs_dp":
    case "awaiting_vendor":
    case "needs_bill":
      return "scm";
    case "awaiting_approval":
      return "director";
    case "dp_pending":
    case "billed":
    case "awaiting_payment":
      return "finance";
    case "dp_awaiting_vendor_bill":
    case "awaiting_goods":
    case "partial_received":
      return "vendor";
    default:
      return "none";
  }
}

export type PoAction = "send" | "confirm" | "dp_bill" | "request_approval" | null;

export interface PoStage {
  key: string;
  label: string;
  next: string; // what the person holding the PO should do now
  action: PoAction; // one-click step available to purchasing, if any
  tone: "slate" | "amber" | "blue" | "indigo" | "green" | "red";
  dpBill?: { id: string; billNumber: string; status: string; grandTotal: number; paidAmount: number } | null;
  approval?: "not_required" | "none" | "pending" | "approved" | "rejected";
  dpPercent?: number;
  payment?: { poTotal: number; billed: number; paid: number; unpaid: number };
}

interface Facts {
  status: string;
  approval: "not_required" | "none" | "pending" | "approved" | "rejected";
  dpPercent: number;
  dpBill: { id: string; billNumber: string; status: string; grandTotal: number; paidAmount: number } | null;
  hasRegularBill: boolean;
  hasPendingGr: boolean;
  unpaid?: number;
}

const idrText = (n: number) => "Rp" + Math.round(n).toLocaleString("id-ID");

function paymentStage(base: { dpBill: PoStage["dpBill"] }, unpaid: number): PoStage {
  if (unpaid > 0.5) {
    return { ...base, key: "awaiting_payment", label: "Menunggu pelunasan", next: `Finance membayar sisa tagihan ${idrText(unpaid)}`, action: null, tone: "amber" };
  }
  return { ...base, key: "paid", label: "Lunas", next: "-", action: null, tone: "green" };
}

export function derivePoStage(f: Facts): PoStage {
  const dpBill = f.dpBill;
  const dpWaiting = !!dpBill && dpBill.status === "draft";
  const dpPaid = !!dpBill && !dpWaiting && dpBill.paidAmount + 0.5 >= dpBill.grandTotal;
  const base = { dpBill };

  if (f.status === "cancelled") return { ...base, key: "cancelled", label: "Dibatalkan", next: "-", action: null, tone: "red" };

  if (f.status === "draft") {
    if (f.approval === "pending") return { ...base, key: "awaiting_approval", label: "Menunggu persetujuan", next: "Menunggu direktur menyetujui", action: null, tone: "amber" };
    if (f.approval === "none" || f.approval === "rejected") {
      return { ...base, key: "needs_approval", label: f.approval === "rejected" ? "Persetujuan ditolak" : "Draft", next: f.approval === "rejected" ? "Perbaiki PO lalu ajukan persetujuan lagi" : "Ajukan persetujuan direktur", action: "request_approval", tone: f.approval === "rejected" ? "red" : "slate" };
    }
    return { ...base, key: "approved", label: "Disetujui", next: "Kirim PO ke vendor", action: "send", tone: "blue" };
  }

  if (f.status === "sent") {
    if (f.dpPercent > 0 && !dpBill) return { ...base, key: "needs_dp", label: "Terkirim, butuh DP", next: `Siapkan tagihan DP ${f.dpPercent}% lalu unggah PDF dari vendor`, action: "dp_bill", tone: "amber" };
    if (dpWaiting) return { ...base, key: "dp_awaiting_vendor_bill", label: "Menunggu tagihan DP dari vendor", next: "Saat vendor mengirim tagihan DP, unggah PDF-nya di bagian Tagihan vendor lalu tandai masuk", action: null, tone: "amber" };
    if (dpBill && !dpPaid) return { ...base, key: "dp_pending", label: "Menunggu pembayaran DP", next: `Finance membayar tagihan DP ${dpBill.billNumber}`, action: null, tone: "amber" };
    return { ...base, key: "awaiting_vendor", label: dpBill ? "DP dibayar, menunggu vendor" : "Terkirim ke vendor", next: "Catat konfirmasi dari vendor", action: "confirm", tone: "indigo" };
  }

  if (f.status === "confirmed") {
    if (f.dpPercent > 0 && !dpBill) return { ...base, key: "needs_dp", label: "Dikonfirmasi, butuh DP", next: `Siapkan tagihan DP ${f.dpPercent}% lalu unggah PDF dari vendor`, action: "dp_bill", tone: "amber" };
    if (dpWaiting) return { ...base, key: "dp_awaiting_vendor_bill", label: "Menunggu tagihan DP dari vendor", next: "Saat vendor mengirim tagihan DP, unggah PDF-nya di bagian Tagihan vendor lalu tandai masuk", action: null, tone: "amber" };
    if (dpBill && !dpPaid) return { ...base, key: "dp_pending", label: "Menunggu pembayaran DP", next: `Finance membayar tagihan DP ${dpBill.billNumber}`, action: null, tone: "amber" };
    return { ...base, key: "awaiting_goods", label: "Menunggu barang", next: f.hasPendingGr ? "SCM cek dan konfirmasi Goods Receipt saat barang tiba" : "Catat penerimaan barang (Goods Receipt)", action: null, tone: "indigo" };
  }

  if (f.status === "partial_received") return { ...base, key: "partial_received", label: "Barang datang sebagian", next: "Konfirmasi sisa barang saat tiba", action: null, tone: "indigo" };

  if (f.status === "received") {
    if (!f.hasRegularBill) return { ...base, key: "needs_bill", label: "Barang diterima", next: dpBill ? "Input tagihan vendor untuk sisa pembayaran (total dikurangi DP)" : "Input tagihan vendor ke Finance", action: null, tone: "blue" };
    return paymentStage(base, f.unpaid ?? 0);
  }

  if (f.status === "invoiced") return paymentStage(base, f.unpaid ?? 0);
  return { ...base, key: f.status, label: f.status, next: "-", action: null, tone: "slate" };
}

export async function loadPoStages(db: Db, poIds: string[]): Promise<Record<string, PoStage>> {
  if (!poIds.length) return {};
  const pos = await db.purchaseOrder.findMany({
    where: { id: { in: poIds } },
    select: {
      id: true,
      status: true,
      dpPercent: true,
      ppnPercent: true,
      items: { select: { subtotal: true } },
      bills: { where: { deletedAt: null, status: { not: "cancelled" } }, select: { id: true, billNumber: true, status: true, grandTotal: true, paidAmount: true, billKind: true } },
      receipts: { where: { deletedAt: null, autoCreated: true, stockApplied: false }, select: { id: true } },
    },
  });

  const out: Record<string, PoStage> = {};
  for (const po of pos) {
    let approval: Facts["approval"] = "not_required";
    if (po.status === "draft") {
      const total = po.items.reduce((s, i) => s + Number(i.subtotal), 0);
      approval = (await tierState(db, "PurchaseOrder", po.id, total)).state;
    }
    const received = po.bills.filter((b) => b.status !== "draft");
    const billed = received.reduce((sum, b) => sum + Number(b.grandTotal), 0);
    const paid = received.reduce((sum, b) => sum + Number(b.paidAmount), 0);
    const unpaid = received.reduce((sum, b) => sum + Math.max(Number(b.grandTotal) - Number(b.paidAmount), 0), 0);
    const subtotal = po.items.reduce((sum, i) => sum + Number(i.subtotal), 0);
    const dp = po.bills.find((b) => b.billKind === "down_payment");
    out[po.id] = { ...derivePoStage({
      status: po.status,
      approval,
      dpPercent: Number(po.dpPercent),
      dpBill: dp ? { id: dp.id, billNumber: dp.billNumber, status: dp.status, grandTotal: Number(dp.grandTotal), paidAmount: Number(dp.paidAmount) } : null,
      hasRegularBill: po.bills.some((b) => b.billKind !== "down_payment" && b.status !== "draft"),
      hasPendingGr: po.receipts.length > 0,
      unpaid,
    }), approval, dpPercent: Number(po.dpPercent), payment: { poTotal: Math.round(subtotal * (1 + Number(po.ppnPercent) / 100)), billed, paid, unpaid } };
  }
  return out;
}
