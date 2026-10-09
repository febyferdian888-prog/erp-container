import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { InvoicePdfDocument, InvoicePdfData } from "@/lib/invoice-pdf";
import { guard } from "@/lib/rbac";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    { const denied = await guard(["finance"], "view"); if (denied) return denied; }
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        company: true,
        customer: { include: { contacts: { where: { deletedAt: null }, orderBy: { isDefault: "desc" }, take: 1 } } },
        salesOrder: { select: { poNumber: true } },
        deliveries: { where: { deletedAt: null }, select: { deliveryNumber: true } },
        items: { orderBy: { lineNumber: "asc" } },
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const membership = await prisma.userMembership.findFirst({
      where: { userId: session.user.id, companyId: invoice.companyId },
    });
    if (!membership) {
      return NextResponse.json({ error: "No access" }, { status: 403 });
    }

    const data: InvoicePdfData = {
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate.toISOString(),
      paymentTerms: invoice.paymentTerms,
      poNumber: invoice.salesOrder?.poNumber ?? null,
      deliveryNumbers: invoice.deliveries.map((d) => d.deliveryNumber),
      ppnPercent: Number(invoice.ppnPercent),
      totalAmount: Number(invoice.totalAmount),
      taxAmount: Number(invoice.taxAmount),
      grandTotal: Number(invoice.grandTotal),
      paidAmount: Number(invoice.paidAmount),
      pphAmount: Number(invoice.pphAmount),
      notes: invoice.notes,
      company: {
        name: invoice.company.name,
        description: invoice.company.description,
        address: invoice.company.address,
        city: invoice.company.city,
        province: invoice.company.province,
        postalCode: invoice.company.postalCode,
        phone: invoice.company.phone,
        email: invoice.company.email,
        npwp: invoice.company.npwp,
        bankName: invoice.company.bankName,
        bankAccount: invoice.company.bankAccount,
        logo: invoice.company.logo,
        signatoryName: invoice.company.signatoryName,
        signatoryTitle: invoice.company.signatoryTitle,
      },
      customer: {
        name: invoice.customer.name,
        address: invoice.customer.address,
        city: invoice.customer.city,
        picName: invoice.customer.contacts[0]?.name ?? null,
      },
      items: invoice.items.map((item) => ({
        lineNumber: item.lineNumber,
        partNumber: item.partNumber,
        description: item.description,
        quantity: Number(item.quantity),
        unit: item.unit,
        unitPrice: Number(item.unitPrice),
        subtotal: Number(item.subtotal),
      })),
    };

    const buffer = await renderToBuffer(InvoicePdfDocument({ data }));

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${invoice.invoiceNumber}.pdf"`,
      },
    });
  } catch (error) {
    console.error("GET /api/invoices/[id]/pdf error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
