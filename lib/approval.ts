import type { Prisma } from "@prisma/client";
import { prisma } from "./db";

type Db = Prisma.TransactionClient;

// Documents at or above these totals must be approved before they leave "draft".
export const APPROVAL_THRESHOLDS: Record<string, number> = {
  PurchaseOrder: 10_000_000,
  Quotation: 50_000_000,
};

export const APPROVER_ROLES = ["Owner", "Admin"];

export class ApprovalRequiredError extends Error {
  constructor(public threshold: number) {
    super(`Dokumen ini bernilai di atas Rp ${threshold.toLocaleString("id-ID")} dan harus disetujui dulu sebelum dikirim.`);
  }
}

export type ApprovalState = "not_required" | "none" | "pending" | "approved" | "rejected";

export function isApprovalType(t: string) {
  return t in APPROVAL_THRESHOLDS;
}

export async function documentInfo(db: Db, type: string, id: string) {
  if (type === "PurchaseOrder") {
    const po = await db.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
    if (!po) return null;
    return {
      companyId: po.companyId,
      status: po.status,
      label: po.poNumber,
      amount: po.items.reduce((s, i) => s + Number(i.subtotal), 0),
    };
  }
  if (type === "Quotation") {
    const q = await db.quotation.findUnique({ where: { id }, include: { items: true } });
    if (!q) return null;
    const sub = q.items.reduce((s, i) => s + Number(i.subtotal), 0);
    return {
      companyId: q.companyId,
      status: q.status,
      label: q.number,
      amount: sub + (sub * Number(q.ppnPercent)) / 100 - (sub * Number(q.pphPercent)) / 100,
    };
  }
  return null;
}

export async function approvalState(db: Db, type: string, id: string, amount: number) {
  const threshold = APPROVAL_THRESHOLDS[type];
  if (threshold === undefined || amount < threshold) return { state: "not_required" as ApprovalState, approval: null, threshold };
  const latest = await db.approval.findFirst({
    where: { referenceType: type, referenceId: id },
    orderBy: { createdAt: "desc" },
  });
  if (!latest) return { state: "none" as ApprovalState, approval: null, threshold };
  if (latest.status === "approved") {
    // Approval only covers the amount that was approved.
    const covers = Number(latest.amount ?? 0) + 0.5 >= amount;
    return { state: (covers ? "approved" : "none") as ApprovalState, approval: latest, threshold };
  }
  return { state: latest.status as ApprovalState, approval: latest, threshold };
}

export async function assertReleaseAllowed(
  db: Db,
  type: string,
  id: string,
  amount: number,
  oldStatus: string,
  newStatus: string | undefined
) {
  if (!newStatus || newStatus === oldStatus) return;
  if (oldStatus !== "draft" || newStatus === "draft" || newStatus === "cancelled") return;
  const { state, threshold } = await approvalState(db, type, id, amount);
  if (state === "not_required" || state === "approved") return;
  throw new ApprovalRequiredError(threshold);
}

export async function canDecideApprovals(userId: string) {
  const memberships = await prisma.userMembership.findMany({
    where: { userId, isActive: true },
    include: { role: true },
  });
  return memberships.some((m) => APPROVER_ROLES.includes(m.role.name));
}
