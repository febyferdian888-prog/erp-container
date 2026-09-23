import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { formatDocumentNumber, currentYearRange } from "@/lib/document-number";
import { guard } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  try {
    { const denied = await guard(["finance", "purchasing"], "view"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { memberships: true },
    });

    if (!user?.memberships.length) {
      return NextResponse.json({ error: "No company access" }, { status: 403 });
    }

    const companyIds = user.memberships.map((m: any) => m.companyId);

    const bills = await prisma.bill.findMany({
      where: {
        companyId: { in: companyIds },
        deletedAt: null,
      },
      include: {
        supplier: { select: { id: true, name: true, code: true } },
        purchaseOrder: { select: { id: true, poNumber: true } },
        salesOrder: { select: { id: true, soNumber: true } },
        items: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(bills);
  } catch (error) {
    console.error("GET /api/bills error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    { const denied = await guard(["finance", "purchasing"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      companyId,
      supplierId,
      poId,
      soId,
      vendorInvoiceNumber,
      status,
      pphAmount,
      pphProofNumber,
      pphProofDate,
      pphRemittedAt,
      billDate,
      dueDate,
      paymentTerms,
      ppnPercent,
      notes,
      items,
    } = body;

    if (!companyId || !supplierId || !billDate || !items?.length) {
      return NextResponse.json(
        { error: "companyId, supplierId, billDate, and at least one item are required" },
        { status: 400 }
      );
    }

    const vendorRef = typeof vendorInvoiceNumber === "string" ? vendorInvoiceNumber.trim() : "";
    if (vendorRef) {
      const dup = await prisma.bill.findFirst({
        where: { companyId, supplierId, deletedAt: null, vendorInvoiceNumber: { equals: vendorRef, mode: "insensitive" } },
        select: { billNumber: true },
      });
      if (dup) {
        return NextResponse.json(
          { error: `Invoice vendor ${vendorRef} sudah pernah diinput sebagai ${dup.billNumber}` },
          { status: 400 }
        );
      }
    }

    const { year, start, end } = currentYearRange();
    const count = await prisma.bill.count({
      where: { companyId, createdAt: { gte: start, lt: end } },
    });
    const billNumber = formatDocumentNumber("BILL", year, count + 1);

    const totalAmount = items.reduce(
      (sum: number, item: any) => sum + Number(item.quantity) * Number(item.unitPrice),
      0
    );
    const ppn = ppnPercent ?? 11;
    const taxAmount = (totalAmount * Number(ppn)) / 100;
    const grandTotal = totalAmount + taxAmount;
    const pph = Math.min(Math.max(Number(pphAmount) || 0, 0), grandTotal);

    const bill = await prisma.bill.create({
      data: {
        companyId,
        supplierId,
        poId: poId || null,
        soId: soId || null,
        vendorInvoiceNumber: vendorRef || null,
        status: status === "draft" ? "draft" : "received",
        billNumber,
        billDate: new Date(billDate),
        dueDate: dueDate ? new Date(dueDate) : null,
        paymentTerms,
        ppnPercent: ppn,
        totalAmount,
        taxAmount,
        grandTotal,
        paidAmount: pph, // tax we withhold counts as settled with the vendor
        pphAmount: pph,
        pphPercent: totalAmount > 0 ? Math.round((pph / totalAmount) * 10000) / 100 : 0,
        pphProofNumber: pphProofNumber || null,
        pphProofDate: pphProofDate ? new Date(pphProofDate) : null,
        pphRemittedAt: pphRemittedAt ? new Date(pphRemittedAt) : null,
        notes,
        createdBy: session.user.email,
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
      },
      include: { items: true, supplier: true },
    });

    return NextResponse.json(bill, { status: 201 });
  } catch (error) {
    console.error("POST /api/bills error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
