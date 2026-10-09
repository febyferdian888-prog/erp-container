import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { computeInvoiceMoney } from "@/lib/invoice-money";
import { computeProjectFinancials, type ProjectPO } from "@/lib/project-money";

// Unified project workspace (Tahap 3B): pulls every linked entity together
// read-only, plus the profitability calc (Tahap 3A). Separate from the
// existing GET /api/projects/[id] (used by the edit form) so this addition
// carries zero risk to that already-working endpoint.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    { const denied = await guard(["operational"], "view"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true, code: true } },
        stages: { orderBy: { stageNumber: "asc" } },
        workOrders: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
        boms: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, include: { items: { include: { product: { select: { name: true, sku: true } }, unit: { select: { name: true } } } } } },
        purchaseRequests: { where: { deletedAt: null }, select: { id: true, requestNumber: true, status: true, requestDate: true } },
        purchaseOrders: {
          where: { deletedAt: null },
          select: {
            id: true, poNumber: true, status: true, poDate: true, supplier: { select: { name: true } },
            items: { select: { subtotal: true } },
            bills: { where: { deletedAt: null }, select: { id: true, billNumber: true, status: true, totalAmount: true, grandTotal: true, paidAmount: true, pphAmount: true, dueDate: true } },
          },
        },
        timesheets: { select: { hoursWorked: true, workDate: true, employee: { select: { name: true } } }, orderBy: { workDate: "desc" }, take: 20 },
        reimbursements: { select: { id: true, amount: true, status: true, category: true, submissionDate: true, employee: { select: { name: true } } } },
        changeOrders: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
        qualityChecks: { orderBy: { createdAt: "desc" } },
        handoverDocuments: { where: { deletedAt: null }, orderBy: { handoverDate: "desc" } },
        salesOrder: {
          select: {
            id: true, soNumber: true, poNumber: true, poDate: true, status: true,
            items: { select: { subtotal: true } },
            deliveries: { where: { deletedAt: null }, select: { id: true, deliveryNumber: true, status: true, deliveryDate: true } },
            invoices: { where: { deletedAt: null }, select: { id: true, invoiceNumber: true, status: true, dueDate: true, grandTotal: true, paidAmount: true, pphAmount: true } },
            quotation: { select: { id: true, number: true } },
          },
        },
      },
    });

    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const responsibleUser = project.responsible
      ? await prisma.user.findUnique({ where: { id: project.responsible }, select: { name: true, email: true } })
      : null;

    const attachmentCount = await prisma.attachment.count({ where: { referenceType: "Project", referenceId: id } });

    const itemsSubtotal = (items: { subtotal: unknown }[]) => items.reduce((s, i) => s + Number(i.subtotal || 0), 0);

    const now = new Date();
    const poRows: ProjectPO[] = project.purchaseOrders.map((po) => ({
      id: po.id,
      poNumber: po.poNumber,
      status: po.status,
      itemsSubtotal: itemsSubtotal(po.items),
      billedSubtotal: po.bills.filter((b) => b.status !== "cancelled").reduce((s, b) => s + Number(b.totalAmount), 0),
    }));

    const approvedReimbursements = project.reimbursements.filter((r) => r.status === "approved" || r.status === "paid").reduce((s, r) => s + Number(r.amount), 0);

    const contractValue = project.salesOrder ? itemsSubtotal(project.salesOrder.items) : null;
    const invoices = project.salesOrder?.invoices ?? [];
    const invoicedRevenue = invoices.filter((i) => i.status !== "cancelled").reduce((s, i) => s + Number(i.grandTotal), 0);
    const cashInReceived = invoices.reduce((s, i) => {
      const m = computeInvoiceMoney(i, now);
      return s + m.cashPaid;
    }, 0);

    const allBills = project.purchaseOrders.flatMap((po) => po.bills.map((b) => ({ ...b, poId: po.id })));
    const cashOutPaid = allBills.reduce((s, b) => {
      const m = computeInvoiceMoney(b, now);
      return s + m.cashPaid;
    }, 0);

    const financials = computeProjectFinancials({
      budget: Number(project.budget),
      contractValue,
      estimatedCostToComplete: project.estimatedCostToComplete !== null ? Number(project.estimatedCostToComplete) : null,
      pos: poRows,
      unlinkedBillsSubtotal: 0, // this app always ties a Bill to a PO; no separate direct-cost path exists yet
      approvedReimbursements,
      approvedChangeOrders: project.changeOrders.filter((c) => c.status === "approved").map((c) => ({ valueImpact: Number(c.valueImpact), budgetImpact: Number(c.budgetImpact) })),
      invoicedRevenue,
      cashInReceived,
      cashOutPaid,
    });

    return NextResponse.json({
      id: project.id,
      projectNumber: project.projectNumber,
      projectName: project.projectName,
      executionMethod: project.executionMethod,
      status: project.status,
      startDate: project.startDate,
      targetEndDate: project.targetEndDate,
      actualEndDate: project.actualEndDate,
      company: project.company,
      customer: project.customer,
      responsible: project.responsible ? { id: project.responsible, name: responsibleUser?.name ?? null, email: responsibleUser?.email ?? null } : null,
      estimatedCostToComplete: project.estimatedCostToComplete !== null ? Number(project.estimatedCostToComplete) : null,
      estimatedCostNote: project.estimatedCostNote,
      estimatedCostUpdatedAt: project.estimatedCostUpdatedAt,
      estimatedCostUpdatedBy: project.estimatedCostUpdatedBy,
      financials,
      salesOrder: project.salesOrder,
      quotation: project.salesOrder?.quotation ?? null,
      stages: project.stages,
      workOrders: project.workOrders,
      boms: project.boms.map((b) => ({ ...b, items: b.items })),
      purchaseRequests: project.purchaseRequests,
      purchaseOrders: project.purchaseOrders.map((po) => ({
        id: po.id, poNumber: po.poNumber, status: po.status, poDate: po.poDate, supplierName: po.supplier.name,
        subtotal: itemsSubtotal(po.items),
        bills: po.bills.map((b) => ({ id: b.id, billNumber: b.billNumber, status: b.status, ...computeInvoiceMoney(b, now) })),
      })),
      timesheets: { recent: project.timesheets, totalHours: project.timesheets.reduce((s, t) => s + Number(t.hoursWorked), 0) },
      reimbursements: project.reimbursements,
      changeOrders: project.changeOrders.map((c) => ({ ...c, valueImpact: Number(c.valueImpact), budgetImpact: Number(c.budgetImpact) })),
      qualityChecks: project.qualityChecks,
      handoverDocuments: project.handoverDocuments,
      attachmentCount,
    });
  } catch (error) {
    console.error("GET /api/projects/[id]/overview error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Save the manual estimate-to-complete (the one number Tahap 3 cannot derive automatically).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    { const denied = await guard(["operational"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;

    const body = await req.json();
    const value = body.estimatedCostToComplete;
    const parsed = value === null || value === "" || value === undefined ? null : Number(value);
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
      return NextResponse.json({ error: "Estimasi biaya harus berupa angka positif" }, { status: 400 });
    }

    const updated = await prisma.project.update({
      where: { id },
      data: {
        estimatedCostToComplete: parsed,
        estimatedCostNote: typeof body.note === "string" ? body.note.trim() || null : undefined,
        estimatedCostUpdatedAt: new Date(),
        estimatedCostUpdatedBy: session.user.email,
      },
      select: { id: true, estimatedCostToComplete: true, estimatedCostNote: true, estimatedCostUpdatedAt: true, estimatedCostUpdatedBy: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH /api/projects/[id]/overview error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
