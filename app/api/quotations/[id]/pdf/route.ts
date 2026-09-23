import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { QuotationPdfDocument, QuotationPdfData } from "@/lib/quotation-pdf";
import { guard } from "@/lib/rbac";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    { const denied = await guard(["sales"], "view"); if (denied) return denied; }
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const quotation = await prisma.quotation.findUnique({
      where: { id },
      include: {
        company: true,
        customer: true,
        items: { orderBy: { lineNumber: "asc" } },
      },
    });

    if (!quotation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const membership = await prisma.userMembership.findFirst({
      where: { userId: session.user.id, companyId: quotation.companyId },
    });

    if (!membership) {
      return NextResponse.json({ error: "No access" }, { status: 403 });
    }

    const data: QuotationPdfData = {
      number: quotation.number,
      quotationDate: quotation.quotationDate.toISOString(),
      paymentTerms: quotation.paymentTerms,
      validityDays: quotation.validityDays,
      ppnPercent: Number(quotation.ppnPercent),
      pphPercent: Number(quotation.pphPercent),
      pic: quotation.pic,
      notes: quotation.notes,
      company: {
        name: quotation.company.name,
        description: quotation.company.description,
        address: quotation.company.address,
        city: quotation.company.city,
        province: quotation.company.province,
        postalCode: quotation.company.postalCode,
        phone: quotation.company.phone,
        email: quotation.company.email,
        npwp: quotation.company.npwp,
      },
      customer: {
        name: quotation.customer.name,
        address: quotation.customer.address,
        city: quotation.customer.city,
      },
      items: quotation.items.map((item) => ({
        lineNumber: item.lineNumber,
        partNumber: item.partNumber,
        description: item.description,
        quantity: Number(item.quantity),
        unit: item.unit,
        unitPrice: Number(item.unitPrice),
        subtotal: Number(item.subtotal),
        notes: item.notes,
      })),
    };

    const buffer = await renderToBuffer(QuotationPdfDocument({ data }));

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${quotation.number}.pdf"`,
      },
    });
  } catch (error) {
    console.error("GET /api/quotations/[id]/pdf error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
