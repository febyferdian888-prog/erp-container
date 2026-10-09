import type { Prisma, PrismaClient } from "@prisma/client";

export type ReferenceType =
  | "RFQ"
  | "Quotation"
  | "SalesOrder"
  | "Delivery"
  | "Invoice"
  | "Payment"
  | "PaymentReport"
  | "PurchaseRequest"
  | "PurchaseOrder"
  | "GoodsReceipt"
  | "PriceInquiry"
  | "Bill"
  | "Project"
  | "WorkOrder";

type Db = PrismaClient | Prisma.TransactionClient;

export async function referenceCompanyId(db: Db, referenceType: string, referenceId: string) {
  switch (referenceType as ReferenceType) {
    case "RFQ": return (await db.rFQ.findUnique({ where: { id: referenceId }, select: { companyId: true } }))?.companyId ?? null;
    case "Quotation": return (await db.quotation.findUnique({ where: { id: referenceId }, select: { companyId: true } }))?.companyId ?? null;
    case "SalesOrder": return (await db.salesOrder.findUnique({ where: { id: referenceId }, select: { companyId: true } }))?.companyId ?? null;
    case "Delivery": return (await db.delivery.findUnique({ where: { id: referenceId }, select: { companyId: true } }))?.companyId ?? null;
    case "Invoice": return (await db.invoice.findUnique({ where: { id: referenceId }, select: { companyId: true } }))?.companyId ?? null;
    case "Payment": return (await db.payment.findUnique({ where: { id: referenceId }, select: { companyId: true } }))?.companyId ?? null;
    case "PaymentReport": return (await db.paymentReport.findUnique({ where: { id: referenceId }, select: { companyId: true } }))?.companyId ?? null;
    case "PurchaseRequest": return (await db.purchaseRequest.findUnique({ where: { id: referenceId }, select: { companyId: true } }))?.companyId ?? null;
    case "PurchaseOrder": return (await db.purchaseOrder.findUnique({ where: { id: referenceId }, select: { companyId: true } }))?.companyId ?? null;
    case "GoodsReceipt": return (await db.goodsReceipt.findUnique({ where: { id: referenceId }, select: { companyId: true } }))?.companyId ?? null;
    case "PriceInquiry": return (await db.priceInquiry.findUnique({ where: { id: referenceId }, select: { companyId: true } }))?.companyId ?? null;
    case "Bill": return (await db.bill.findUnique({ where: { id: referenceId }, select: { companyId: true } }))?.companyId ?? null;
    case "Project": return (await db.project.findUnique({ where: { id: referenceId }, select: { companyId: true } }))?.companyId ?? null;
    case "WorkOrder": return (await db.workOrder.findUnique({ where: { id: referenceId }, select: { companyId: true } }))?.companyId ?? null;
    default: return null;
  }
}

export async function userHasCompanyAccess(db: Db, userId: string, companyId: string) {
  const membership = await db.userMembership.findFirst({
    where: { userId, companyId, isActive: true },
    select: { id: true },
  });
  return !!membership;
}

export async function assertReferenceAccess(
  db: Db,
  userId: string,
  referenceType: string,
  referenceId: string,
) {
  const companyId = await referenceCompanyId(db, referenceType, referenceId);
  if (!companyId || !(await userHasCompanyAccess(db, userId, companyId))) return null;
  return companyId;
}

export async function entityCompanyId(db: Db, entityType: string, entityId: string) {
  const direct = await referenceCompanyId(db, entityType, entityId);
  if (direct) return direct;
  switch (entityType) {
    case "Customer": return (await db.customer.findUnique({ where: { id: entityId }, select: { companyId: true } }))?.companyId ?? null;
    case "Supplier": return (await db.supplier.findUnique({ where: { id: entityId }, select: { companyId: true } }))?.companyId ?? null;
    case "Product": return (await db.product.findUnique({ where: { id: entityId }, select: { companyId: true } }))?.companyId ?? null;
    case "Warehouse": return (await db.warehouse.findUnique({ where: { id: entityId }, select: { companyId: true } }))?.companyId ?? null;
    case "Employee": return (await db.employee.findUnique({ where: { id: entityId }, select: { companyId: true } }))?.companyId ?? null;
    case "ChartOfAccount": return (await db.chartOfAccount.findUnique({ where: { id: entityId }, select: { companyId: true } }))?.companyId ?? null;
    case "JournalEntry": return (await db.journalEntry.findUnique({ where: { id: entityId }, select: { companyId: true } }))?.companyId ?? null;
    case "Company": return (await db.company.findUnique({ where: { id: entityId }, select: { id: true } }))?.id ?? null;
    case "UserMembership": return (await db.userMembership.findUnique({ where: { id: entityId }, select: { companyId: true } }))?.companyId ?? null;
    default: return null;
  }
}
