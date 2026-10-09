import type { Prisma } from "@prisma/client";
import { prisma } from "./db";

type Db = Prisma.TransactionClient;

// Documents at or above these totals must be approved before they leave "draft".
export const APPROVAL_THRESHOLDS: Record<string, number> = {
  PurchaseOrder: 10_000_000,
  Quotation: 50_000_000,
};

// Sequential approval tiers per document type, expressed as the Role name
// (see prisma.Role) that must decide each stage. PurchaseOrder gets a real
// two-tier chain — Purchasing reviews first, then Owner (this ERP's closest
// equivalent to "Direktur") signs off — matching the Procurement/Direktur
// split in the locked PO design without inventing roles that don't exist
// in this system's RBAC. Every other approval-gated type stays single-tier
// (Owner) exactly as before.
export const APPROVAL_TIERS: Record<string, string[]> = {
  PurchaseOrder: ["Purchasing", "Owner"],
  Quotation: ["Owner"],
};

// Admin can always stand in for any tier (matches the original single-tier
// design where Owner/Admin were interchangeable deciders).
const ADMIN_OVERRIDE_ROLE = "Admin";

export class ApprovalRequiredError extends Error {
  constructor(public threshold: number) {
    super(`Dokumen ini bernilai di atas Rp ${threshold.toLocaleString("id-ID")} dan harus disetujui dulu sebelum dikirim.`);
  }
}

export type TierStatus = "none" | "pending" | "approved" | "rejected";
export type ApprovalState = "not_required" | "none" | "pending" | "approved" | "rejected";

export interface TierInfo {
  role: string;
  status: TierStatus;
  approval: {
    id: string;
    notes: string | null;
    requestedBy: string | null;
    approvedBy: string | null;
    approvedAt: Date | null;
  } | null;
}

export function isApprovalType(t: string) {
  return t in APPROVAL_THRESHOLDS;
}

export function tiersFor(type: string): string[] {
  return APPROVAL_TIERS[type] || ["Owner"];
}

export async function documentInfo(db: Db, type: string, id: string) {
  if (type === "PurchaseOrder") {
    const po = await db.purchaseOrder.findUnique({
      where: { id },
      include: {
        items: { orderBy: { lineNumber: "asc" } },
        supplier: { select: { name: true } },
        salesOrder: { select: { id: true, soNumber: true, poNumber: true, customer: { select: { name: true } } } },
        sources: { select: { salesOrder: { select: { id: true, soNumber: true, poNumber: true, customer: { select: { name: true } } } } } },
      },
    });
    if (!po) return null;
    const soMap = new Map<string, { id: string; soNumber: string; customerPoNumber: string; customerName: string }>();
    for (const so of [po.salesOrder, ...po.sources.map((x) => x.salesOrder)]) {
      if (so) soMap.set(so.id, { id: so.id, soNumber: so.soNumber, customerPoNumber: so.poNumber, customerName: so.customer.name });
    }
    return {
      companyId: po.companyId,
      status: po.status,
      label: po.poNumber,
      amount: po.items.reduce((s, i) => s + Number(i.subtotal), 0),
      partyName: po.supplier?.name ?? null,
      salesOrders: [...soMap.values()],
      items: po.items.map((i) => ({ description: i.description, quantity: Number(i.quantity), unit: i.unit })),
    };
  }
  if (type === "Quotation") {
    const q = await db.quotation.findUnique({
      where: { id },
      include: { items: { orderBy: { lineNumber: "asc" } }, customer: { select: { name: true } } },
    });
    if (!q) return null;
    const sub = q.items.reduce((s, i) => s + Number(i.subtotal), 0);
    return {
      companyId: q.companyId,
      status: q.status,
      label: q.number,
      amount: sub + (sub * Number(q.ppnPercent)) / 100 - (sub * Number(q.pphPercent)) / 100,
      partyName: q.customer?.name ?? null,
      items: q.items.map((i) => ({ description: i.description, quantity: Number(i.quantity), unit: i.unit })),
    };
  }
  return null;
}

// Walks the tier chain for this document. Only the latest round of requests counts: a
// rejection closes a round, and the next request after it starts a fresh one, so an old
// rejection never keeps blocking a document that was fixed and approved afterwards. Within
// the round each tier is matched to its row by role, and sign-off by the last tier (Owner)
// releases the document even if an earlier tier did not sign off in that round.
export async function tierState(db: Db, type: string, id: string, amount: number): Promise<{ state: ApprovalState; tiers: TierInfo[]; threshold: number; currentApproval: TierInfo["approval"] }> {
  const threshold = APPROVAL_THRESHOLDS[type];
  const tiers = tiersFor(type);
  if (threshold === undefined || amount < threshold) {
    return { state: "not_required", tiers: tiers.map((role) => ({ role, status: "none", approval: null })), threshold, currentApproval: null };
  }

  const allRows = await db.approval.findMany({
    where: { referenceType: type, referenceId: id },
    orderBy: { createdAt: "asc" },
  });
  const rounds: (typeof allRows)[] = [];
  let current: typeof allRows = [];
  for (const r of allRows) {
    current.push(r);
    if (r.status === "rejected") {
      rounds.push(current);
      current = [];
    }
  }
  if (current.length) rounds.push(current);
  const rows = rounds[rounds.length - 1] ?? [];

  const tierInfos: TierInfo[] = tiers.map((role) => {
    const row = [...rows].reverse().find((r) => r.approverRole === role);
    if (!row) return { role, status: "none", approval: null };
    // A tier's approval only covers the amount it was requested against —
    // if the document grew past that since, treat this tier as un-requested
    // again rather than silently trusting a stale sign-off.
    if (row.status === "approved" && Number(row.amount ?? 0) + 0.5 < amount) {
      return { role, status: "none", approval: null };
    }
    return {
      role,
      status: row.status as TierStatus,
      approval: { id: row.id, notes: row.notes, requestedBy: row.requestedBy, approvedBy: row.approvedBy, approvedAt: row.approvedAt },
    };
  });

  let state: ApprovalState = "approved";
  let currentApproval: TierInfo["approval"] = null;
  const finalTier = tierInfos[tierInfos.length - 1];
  if (finalTier.status === "approved") {
    return { state, tiers: tierInfos, threshold, currentApproval };
  }
  for (const t of tierInfos) {
    if (t.status === "rejected") {
      state = "rejected";
      currentApproval = t.approval;
      break;
    }
    if (t.status === "pending") {
      state = "pending";
      currentApproval = t.approval;
      break;
    }
    if (t.status === "none") {
      state = "none";
      currentApproval = null;
      break;
    }
  }

  return { state, tiers: tierInfos, threshold, currentApproval };
}

// Legacy single-approval shape, kept for callers that only need the
// aggregate state (assertReleaseAllowed) rather than the full tier list.
export async function approvalState(db: Db, type: string, id: string, amount: number) {
  const { state, threshold, currentApproval } = await tierState(db, type, id, amount);
  return { state, approval: currentApproval, threshold };
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
  const roleNames = new Set(memberships.map((m) => m.role.name));
  return Array.from(roleNames).some((r) => r === ADMIN_OVERRIDE_ROLE || Object.values(APPROVAL_TIERS).flat().includes(r));
}

// Whether this user can decide THIS specific tier (its approverRole),
// vs. just being able to decide approvals in general.
export async function canDecideTier(userId: string, approverRole: string) {
  const memberships = await prisma.userMembership.findMany({
    where: { userId, isActive: true },
    include: { role: true },
  });
  return memberships.some((m) => m.role.name === approverRole || m.role.name === ADMIN_OVERRIDE_ROLE);
}
