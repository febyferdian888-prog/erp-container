import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { recalcSalesOrderStatus } from "@/lib/workflow";
import { formatMdaInvoiceNumber, nextInvoiceSequence } from "@/lib/document-number";
import { guard } from "@/lib/rbac";
import { dueDateFor } from "@/lib/payment-terms";
import { renderInvoiceKwitansi } from "@/lib/invoice-kwitansi";
import { findUnregisteredParts, unregisteredMessage } from "@/lib/part-registry";

export async function GET(req: NextRequest) {
  try {
    { const denied = await guard(["finance"], "view"); if (denied) return denied; }
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

    const invoices = await prisma.invoice.findMany({
      where: {
        companyId: { in: companyIds },
        deletedAt: null,
      },
      include: {
        customer: { select: { name: true } },
      },
      orderBy: { invoiceDate: "desc" },
    });

    return NextResponse.json(invoices);
  } catch (error) {
    console.error("GET /api/invoices error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    { const denied = await guard(["finance"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { companyId, customerId, soId, invoiceDate, dueDate, paymentTerms, ppnPercent, notes, items, pphAmount, pphProofNumber, pphProofDate } =
      body;

    const membership = await prisma.userMembership.findFirst({
      where: { userId: session.user.id, companyId },
    }).catch(() => null);

    if (!membership) {
      return NextResponse.json({ error: "No access" }, { status: 403 });
    }

    // Items copied from an existing sales order were already checked when it was created.
    if (!soId) {
      const missing = await findUnregisteredParts(prisma, companyId, items || []);
      if (missing.length) {
        return NextResponse.json({ error: unregisteredMessage(missing), code: "PART_NOT_REGISTERED", missing }, { status: 400 });
      }
    }

    if (soId) {
      const dup = await prisma.invoice.findFirst({
        where: { soId, deletedAt: null, status: { not: "cancelled" } },
        select: { invoiceNumber: true },
      });
      if (dup) {
        return NextResponse.json({ error: `Sales order ini sudah punya invoice ${dup.invoiceNumber}. Batalkan atau hapus dulu bila ingin membuat ulang.` }, { status: 400 });
      }
    }

    const termsDue = dueDateFor(String(invoiceDate || "").slice(0, 10), paymentTerms);

    const invDate = new Date(invoiceDate);
    const existingInvoiceNumbers = (
      await prisma.invoice.findMany({ where: { companyId }, select: { invoiceNumber: true } })
    ).map((i) => i.invoiceNumber);
    const invoiceNumber = formatMdaInvoiceNumber(nextInvoiceSequence(existingInvoiceNumbers, invDate), invDate);

    const lineItems = (items || []).map((item: any) => ({
      lineNumber: item.lineNumber,
      partNumber: item.partNumber,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
      notes: item.notes,
    }));
    const subtotal = lineItems.reduce((sum: number, i: any) => sum + Number(i.subtotal || 0), 0);
    const ppn = ppnPercent ?? 11;
    const taxAmount = (subtotal * ppn) / 100;
    const grandTotal = subtotal + taxAmount;
    const pph = Math.min(Math.max(Number(pphAmount) || 0, 0), grandTotal);

    const invoice = await prisma.invoice.create({
      data: {
        companyId,
        customerId,
        soId: soId || null,
        invoiceNumber,
        invoiceDate: new Date(invoiceDate),
        dueDate: termsDue ? new Date(termsDue) : dueDate ? new Date(dueDate) : null,
        paymentTerms,
        ppnPercent: ppn,
        totalAmount: subtotal,
        taxAmount,
        grandTotal,
        paidAmount: pph, // tax withheld by the customer counts as settled
        pphAmount: pph,
        pphPercent: subtotal > 0 ? Math.round((pph / subtotal) * 10000) / 100 : 0,
        pphProofNumber: pphProofNumber || null,
        pphProofDate: pphProofDate ? new Date(pphProofDate) : null,
        notes,
        status: "draft",
        items: { create: lineItems },
      },
      include: { customer: true, items: true },
    });

    await recalcSalesOrderStatus(prisma, invoice.soId);

    // Kwitansi is part of the billing pack, so it is issued together with the invoice.
    try {
      const kw = await renderInvoiceKwitansi(prisma, invoice.id);
      if (kw) {
        await prisma.attachment.create({
          data: {
            referenceType: "Invoice",
            referenceId: invoice.id,
            fileName: `${kw.number}.pdf`,
            fileSize: kw.buffer.length,
            fileType: "pdf",
            mimeType: "application/pdf",
            data: kw.buffer,
            uploadedBy: session.user.email,
          },
        });
      }
    } catch (e) {
      console.error("Auto kwitansi failed for invoice", invoice.id, e);
    }

    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    console.error("POST /api/invoices error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
