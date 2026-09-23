import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { recalcBillStatus } from "@/lib/workflow";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    { const denied = await guard(["finance", "purchasing"], "view"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const bill = await prisma.bill.findUnique({
      where: { id },
      include: {
        company: true,
        supplier: true,
        purchaseOrder: { select: { id: true, poNumber: true } },
        salesOrder: { select: { id: true, soNumber: true } },
        items: { orderBy: { lineNumber: "asc" } },
      },
    });

    if (!bill) {
      return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    }

    return NextResponse.json(bill);
  } catch (error) {
    console.error("GET /api/bills/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    { const denied = await guard(["finance", "purchasing"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const {
      supplierId,
      soId,
      vendorInvoiceNumber,
      pphAmount,
      pphProofNumber,
      pphProofDate,
      pphRemittedAt,
      billDate,
      dueDate,
      paymentTerms,
      ppnPercent,
      status,
      notes,
      items,
    } = body;

    const current = await prisma.bill.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    let totalsUpdate = {};
    let newGrand = Number(current.grandTotal);
    let newBase = Number(current.totalAmount);
    if (items) {
      await prisma.billItem.deleteMany({ where: { billId: id } });
      const totalAmount = items.reduce(
        (sum: number, item: any) => sum + Number(item.quantity) * Number(item.unitPrice),
        0
      );
      const ppn = ppnPercent ?? 11;
      const taxAmount = (totalAmount * Number(ppn)) / 100;
      totalsUpdate = { totalAmount, ppnPercent: ppn, taxAmount, grandTotal: totalAmount + taxAmount };
      newGrand = totalAmount + taxAmount;
      newBase = totalAmount;
    }

    const newPph = pphAmount === undefined ? Number(current.pphAmount) : Math.min(Math.max(Number(pphAmount) || 0, 0), newGrand);
    const pphDelta = newPph - Number(current.pphAmount);

    const bill = await prisma.bill.update({
      where: { id },
      data: {
        pphAmount: newPph,
        pphPercent: newBase > 0 ? Math.round((newPph / newBase) * 10000) / 100 : 0,
        ...(pphDelta !== 0 ? { paidAmount: { increment: pphDelta } } : {}),
        ...(pphProofNumber !== undefined ? { pphProofNumber: pphProofNumber || null } : {}),
        ...(pphProofDate !== undefined ? { pphProofDate: pphProofDate ? new Date(pphProofDate) : null } : {}),
        ...(pphRemittedAt !== undefined ? { pphRemittedAt: pphRemittedAt ? new Date(pphRemittedAt) : null } : {}),
        supplierId,
        ...(soId !== undefined ? { soId: soId || null } : {}),
        ...(vendorInvoiceNumber !== undefined ? { vendorInvoiceNumber: String(vendorInvoiceNumber).trim() || null } : {}),
        billDate: billDate ? new Date(billDate) : undefined,
        dueDate: dueDate ? new Date(dueDate) : null,
        paymentTerms,
        status,
        notes,
        ...totalsUpdate,
        ...(items
          ? {
              items: {
                create: items.map((item: any, index: number) => ({
                  lineNumber: index + 1,
                  partNumber: item.partNumber || null,
                  soId: item.soId || null,
                  description: item.description,
                  quantity: item.quantity,
                  unit: item.unit,
                  unitPrice: item.unitPrice,
                  subtotal: Number(item.quantity) * Number(item.unitPrice),
                  notes: item.notes,
                })),
              },
            }
          : {}),
      },
      include: { items: true, supplier: true },
    });

    if (!status || status === current.status) await recalcBillStatus(prisma, id);

    return NextResponse.json(bill);
  } catch (error) {
    console.error("PUT /api/bills/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    { const denied = await guard(["finance", "purchasing"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    await prisma.bill.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/bills/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
