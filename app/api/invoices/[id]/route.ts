import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { recalcInvoiceStatus, recalcSalesOrderStatus } from "@/lib/workflow";
import { guard } from "@/lib/rbac";
import { parseTaxInvoiceNumber } from "@/lib/tax-invoice";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    { const denied = await guard(["finance"], "view"); if (denied) return denied; }
    const { id } = await params;
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        customer: true,
        items: { orderBy: { lineNumber: "asc" } },
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    return NextResponse.json(invoice);
  } catch (error) {
    console.error("GET /api/invoices/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    { const denied = await guard(["finance"], "edit"); if (denied) return denied; }
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const membership = await prisma.userMembership.findFirst({
      where: { userId: session.user.id, companyId: invoice.companyId },
    });
    if (!membership) {
      return NextResponse.json({ error: "No access" }, { status: 403 });
    }

    const body = await req.json();
    const { items, invoiceDate, dueDate, ppnPercent, pphAmount, pphProofNumber, pphProofDate, taxInvoiceNumber, taxInvoiceDate, ...rest } = body;

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
    const ppn = ppnPercent ?? Number(invoice.ppnPercent);
    const taxAmount = (subtotal * ppn) / 100;
    const grandTotal = subtotal + taxAmount;
    const newPph = pphAmount === undefined ? Number(invoice.pphAmount) : Math.min(Math.max(Number(pphAmount) || 0, 0), grandTotal);
    const pphDelta = newPph - Number(invoice.pphAmount);

    // Faktur pajak: nomor is 16 digits and unique per company. An invoice with PPN cannot be
    // validated (draft -> sent) before it carries one.
    let fpData: Record<string, unknown> = {};
    if (taxInvoiceNumber !== undefined) {
      const raw = String(taxInvoiceNumber ?? "").trim();
      if (!raw) {
        fpData = { taxInvoiceNumber: null, taxInvoiceDate: null, taxInvoiceCheckedBy: null, taxInvoiceCheckedAt: null };
      } else {
        const fp = parseTaxInvoiceNumber(raw);
        if (!fp.ok) return NextResponse.json({ error: fp.error }, { status: 400 });
        const clash = await prisma.invoice.findFirst({ where: { companyId: invoice.companyId, taxInvoiceNumber: fp.value, id: { not: id }, deletedAt: null }, select: { invoiceNumber: true } });
        if (clash) return NextResponse.json({ error: "Nomor faktur pajak ini sudah dipakai invoice " + clash.invoiceNumber }, { status: 400 });
        const fpDate = taxInvoiceDate ? new Date(taxInvoiceDate) : null;
        if (fpDate && Number.isNaN(fpDate.getTime())) return NextResponse.json({ error: "Tanggal faktur pajak tidak valid" }, { status: 400 });
        const changed = fp.value !== invoice.taxInvoiceNumber;
        fpData = {
          taxInvoiceNumber: fp.value,
          taxInvoiceDate: fpDate,
          ...(changed || !invoice.taxInvoiceCheckedAt ? { taxInvoiceCheckedBy: session.user.email, taxInvoiceCheckedAt: new Date() } : {}),
        };
      }
    }
    const nextFp = "taxInvoiceNumber" in fpData ? (fpData.taxInvoiceNumber as string | null) : invoice.taxInvoiceNumber;
    if (rest.status === "sent" && invoice.status === "draft" && ppn > 0 && !nextFp) {
      return NextResponse.json({ error: "Isi nomor faktur pajak dulu sebelum invoice divalidasi (status sent)" }, { status: 400 });
    }

    await prisma.invoiceItem.deleteMany({ where: { invoiceId: id } });

    const updated = await prisma.invoice.update({
      where: { id },
      data: {
        ...rest,
        ...fpData,
        invoiceDate: invoiceDate ? new Date(invoiceDate) : undefined,
        dueDate: dueDate ? new Date(dueDate) : null,
        ppnPercent: ppn,
        totalAmount: subtotal,
        taxAmount,
        grandTotal,
        pphAmount: newPph,
        pphPercent: subtotal > 0 ? Math.round((newPph / subtotal) * 10000) / 100 : 0,
        ...(pphDelta !== 0 ? { paidAmount: { increment: pphDelta } } : {}),
        ...(pphProofNumber !== undefined ? { pphProofNumber: pphProofNumber || null } : {}),
        ...(pphProofDate !== undefined ? { pphProofDate: pphProofDate ? new Date(pphProofDate) : null } : {}),
        items: { create: lineItems },
      },
      include: { customer: true, items: true },
    });

    // Always resync status from the post-edit totals — grandTotal/paidAmount just
    // changed above, so any client-sent `status` is stale and must not be trusted
    // (see Tahap 1 audit: this guard used to skip recalc whenever the client's
    // status differed from the pre-edit value, letting an item edit raise
    // grandTotal without ever re-checking whether the invoice was still paid).
    await recalcInvoiceStatus(prisma, id);
    await recalcSalesOrderStatus(prisma, updated.soId);

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT /api/invoices/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    { const denied = await guard(["finance"], "edit"); if (denied) return denied; }
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const membership = await prisma.userMembership.findFirst({
      where: { userId: session.user.id, companyId: invoice.companyId },
    });
    if (!membership) {
      return NextResponse.json({ error: "No access" }, { status: 403 });
    }

    await prisma.invoice.update({ where: { id }, data: { deletedAt: new Date() } });
    await recalcSalesOrderStatus(prisma, invoice.soId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/invoices/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
