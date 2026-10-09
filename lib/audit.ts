import type { PrismaClient } from "@prisma/client";
import { rowAuditSkipped } from "./audit-context";

const AUDITED = new Set([
  "RFQ", "Quotation", "SalesOrder", "Delivery", "Invoice", "Payment",
  "PurchaseRequest", "PurchaseOrder", "GoodsReceipt", "Bill",
  "Customer", "Supplier", "Product", "Project", "WorkOrder", "Employee",
  "Warehouse", "Approval", "Attachment", "UserMembership", "PriceInquiry",
]);

const LABEL_FIELDS = [
  "number", "poNumber", "soNumber", "invoiceNumber", "paymentNumber", "deliveryNumber", "receiptNumber",
  "billNumber", "documentLabel", "requestNumber", "projectNumber", "orderNumber", "employeeNumber", "sku", "code", "name", "fileName",
];

const IGNORED = new Set(["updatedAt", "createdAt", "data"]);

function scalar(v: unknown): string | number | boolean | null | undefined {
  if (v === null || v === undefined) return v as null | undefined;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "object" && v !== null && "toFixed" in v && typeof (v as { toString(): string }).toString === "function") {
    return (v as { toString(): string }).toString();
  }
  return undefined;
}

function snapshot(row: Record<string, unknown> | null) {
  const out: Record<string, unknown> = {};
  if (!row) return out;
  for (const [k, v] of Object.entries(row)) {
    if (IGNORED.has(k)) continue;
    const s = scalar(v);
    if (s !== undefined) out[k] = s;
  }
  return out;
}

function labelOf(row: Record<string, unknown> | null) {
  if (!row) return "";
  for (const f of LABEL_FIELDS) if (typeof row[f] === "string" && row[f]) return row[f] as string;
  return "";
}

async function currentUserId(): Promise<string | null> {
  try {
    const [{ getServerSession }, { authOptions }] = await Promise.all([import("next-auth"), import("./auth")]);
    const session = await getServerSession(authOptions);
    return (session?.user as { id?: string } | undefined)?.id ?? null;
  } catch {
    return null;
  }
}

// Field names, in priority order, that a model might carry naming who wrote the row.
const ACTOR_FIELDS = ["createdBy", "requestedBy", "reportedBy", "inspectedByName"];

function looksLikeEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

// No browser session (an import script, a batch backfill) — fall back to
// whatever the row itself says about who wrote it, resolving a real userId
// when that value is an email matching an actual account, so as much history
// as possible is a real person rather than an anonymous "Sistem" (Tahap 8 audit).
async function resolveFallbackActor(
  client: PrismaClient,
  after: Record<string, unknown> | null,
  before: Record<string, unknown> | null
): Promise<{ userId: string | null; actorLabel: string | null }> {
  for (const field of ACTOR_FIELDS) {
    const raw = (after?.[field] ?? before?.[field]) as unknown;
    if (typeof raw !== "string" || !raw.trim()) continue;
    if (looksLikeEmail(raw)) {
      const user = await client.user.findUnique({ where: { email: raw }, select: { id: true } }).catch(() => null);
      if (user) return { userId: user.id, actorLabel: null };
    }
    return { userId: null, actorLabel: raw };
  }
  return { userId: null, actorLabel: null };
}

export function installAudit(client: PrismaClient) {
  const flagged = client as unknown as { __auditInstalled?: boolean };
  if (flagged.__auditInstalled) return;
  flagged.__auditInstalled = true;

  client.$use(async (params, next) => {
    const model = params.model;
    if (!model || !AUDITED.has(model) || !["create", "update", "delete"].includes(params.action) || rowAuditSkipped()) {
      return next(params);
    }

    let before: Record<string, unknown> | null = null;
    if (params.action !== "create") {
      try {
        const delegate = (client as unknown as Record<string, { findUnique: (a: unknown) => Promise<unknown> }>)[
          model.charAt(0).toLowerCase() + model.slice(1)
        ];
        before = (await delegate.findUnique({ where: params.args.where })) as Record<string, unknown> | null;
      } catch {
        before = null;
      }
    }

    const result = (await next(params)) as Record<string, unknown> | null;

    try {
      const after = snapshot(result);
      const oldSnap = snapshot(before);
      let action = "";
      let oldValue: unknown = null;
      let newValue: unknown = null;
      let description = "";

      if (params.action === "create") {
        action = "CREATE";
        newValue = after;
      } else if (params.action === "delete") {
        action = "DELETE";
        oldValue = oldSnap;
      } else {
        const deleting = params.args?.data && "deletedAt" in params.args.data && params.args.data.deletedAt;
        if (deleting) {
          action = "DELETE";
          oldValue = oldSnap;
        } else {
          const changedOld: Record<string, unknown> = {};
          const changedNew: Record<string, unknown> = {};
          for (const k of Object.keys(after)) {
            if (String(after[k] ?? "") !== String(oldSnap[k] ?? "")) {
              changedOld[k] = oldSnap[k] ?? null;
              changedNew[k] = after[k];
            }
          }
          const itemsTouched = params.args?.data && "items" in params.args.data;
          if (!Object.keys(changedNew).length && !itemsTouched) return result;
          action = "UPDATE";
          oldValue = changedOld;
          newValue = changedNew;
          if (itemsTouched) description = "Item diubah";
        }
      }

      const label = labelOf(result) || labelOf(before);
      let userId = await currentUserId();
      let actorLabel: string | null = null;
      if (!userId) {
        const fallback = await resolveFallbackActor(client, after, oldSnap);
        userId = fallback.userId;
        actorLabel = fallback.actorLabel;
      }
      await client.auditLog.create({
        data: {
          userId,
          actorLabel,
          entityType: model,
          entityId: String((result as { id?: string } | null)?.id ?? params.args?.where?.id ?? ""),
          action,
          oldValue: oldValue ? JSON.stringify(oldValue) : null,
          newValue: newValue ? JSON.stringify(newValue) : null,
          description: [label, description].filter(Boolean).join(" · ") || null,
        },
      });
    } catch (err) {
      console.error("audit log failed:", err);
    }
    return result;
  });
}
