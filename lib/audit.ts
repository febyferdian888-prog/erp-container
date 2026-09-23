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
      const userId = await currentUserId();
      await client.auditLog.create({
        data: {
          userId,
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
