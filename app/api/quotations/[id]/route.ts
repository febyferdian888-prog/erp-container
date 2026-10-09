import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { ApprovalRequiredError, assertReleaseAllowed } from "@/lib/approval";
import { guard } from "@/lib/rbac";
import { renderToBuffer } from "@react-pdf/renderer";
import { QuotationPdfDocument, QuotationPdfData } from "@/lib/quotation-pdf";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    { const denied = await guard(["sales"], "view"); if (denied) return denied; }
    const { id } = await params;
    const quotation = await prisma.quotation.findUnique({
      where: { id },
      include: {
        customer: true,
        items: { orderBy: { lineNumber: "asc" } },
        salesOrders: {
          where: { deletedAt: null },
          select: {
            id: true, soNumber: true, poNumber: true, poDate: true, status: true,
            items: { select: { quantity: true, unitPrice: true } },
            invoices: { where: { deletedAt: null }, select: { invoiceNumber: true, status: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!quotation) {
      return NextResponse.json(
        { error: "Quotation not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(quotation);
  } catch (error) {
    console.error("GET /api/quotations/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    { const denied = await guard(["sales"], "edit"); if (denied) return denied; }
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const quotation = await prisma.quotation.findUnique({
      where: { id },
    });

    if (!quotation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const membership = await prisma.userMembership.findFirst({
      where: {
        userId: session.user.id,
        companyId: quotation.companyId,
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "No access" }, { status: 403 });
    }

    const body = await req.json();
    const { items, ...quotationData } = body;

    const sub = (items || []).reduce((sum: number, i: any) => sum + Number(i.subtotal || 0), 0);
    const ppn = Number(quotationData.ppnPercent ?? quotation.ppnPercent);
    const pph = Number(quotationData.pphPercent ?? quotation.pphPercent);
    try {
      await assertReleaseAllowed(prisma, "Quotation", id, sub + (sub * ppn) / 100 - (sub * pph) / 100, quotation.status, quotationData.status);
    } catch (e) {
      if (e instanceof ApprovalRequiredError) return NextResponse.json({ error: e.message, code: "APPROVAL_REQUIRED" }, { status: 400 });
      throw e;
    }

    // Delete old items and create new ones
    await prisma.quotationItem.deleteMany({
      where: { quotationId: id },
    });

    const updated = await prisma.quotation.update({
      where: { id },
      data: {
        ...quotationData,
        ...(quotationData.quotationDate ? { quotationDate: new Date(quotationData.quotationDate) } : {}),
        ...(quotationData.expiryDate ? { expiryDate: new Date(quotationData.expiryDate) } : {}),
        ...(quotationData.targetCloseDate ? { targetCloseDate: new Date(quotationData.targetCloseDate) } : {}),
        ...(quotationData.nextFollowUpAt ? { nextFollowUpAt: new Date(quotationData.nextFollowUpAt) } : {}),
        items: {
          create: (items || []).map((item: any) => ({
            lineNumber: item.lineNumber,
            partNumber: item.partNumber,
            description: item.description,
            specification: item.specification,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            subtotal: item.subtotal,
            notes: item.notes,
          })),
        },
      },
      include: { customer: true, items: true, company: true },
    });

    // Archive an immutable PDF snapshot the moment a quotation is sent —
    // this is the record of exactly what the customer received, since the
    // live document can keep changing (revisions, later status transitions).
    if (quotation.status !== "sent" && updated.status === "sent") {
      const pdfData: QuotationPdfData = {
        number: updated.number,
        quotationDate: updated.quotationDate.toISOString(),
        paymentTerms: updated.paymentTerms,
        validityDays: updated.validityDays,
        ppnPercent: Number(updated.ppnPercent),
        pphPercent: Number(updated.pphPercent),
        pic: updated.pic,
        notes: updated.notes,
        company: {
          name: updated.company.name,
          description: updated.company.description,
          address: updated.company.address,
          city: updated.company.city,
          province: updated.company.province,
          postalCode: updated.company.postalCode,
          phone: updated.company.phone,
          email: updated.company.email,
          npwp: updated.company.npwp,
          logo: updated.company.logo,
          signatoryName: updated.company.signatoryName,
          signatoryTitle: updated.company.signatoryTitle,
        },
        customer: { name: updated.customer.name, address: updated.customer.address, city: updated.customer.city },
        items: updated.items.map((item) => ({
          lineNumber: item.lineNumber,
          partNumber: item.partNumber,
          description: item.description,
          specification: item.specification,
          quantity: Number(item.quantity),
          unit: item.unit,
          unitPrice: Number(item.unitPrice),
          subtotal: Number(item.subtotal),
          notes: item.notes,
        })),
      };
      const buffer = await renderToBuffer(QuotationPdfDocument({ data: pdfData }));
      const fileName = `${updated.number}-terkirim.pdf`;
      await prisma.attachment.create({
        data: {
          referenceType: "Quotation",
          referenceId: id,
          fileName,
          fileSize: buffer.length,
          fileType: "pdf",
          mimeType: "application/pdf",
          data: buffer,
          uploadedBy: session.user.email,
        },
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT /api/quotations/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    { const denied = await guard(["sales"], "edit"); if (denied) return denied; }
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const quotation = await prisma.quotation.findUnique({
      where: { id },
    });

    if (!quotation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const membership = await prisma.userMembership.findFirst({
      where: {
        userId: session.user.id,
        companyId: quotation.companyId,
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "No access" }, { status: 403 });
    }

    await prisma.quotation.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/quotations/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
