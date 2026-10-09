import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { KwitansiPdfDocument, KwitansiPdfData } from "@/lib/kwitansi-pdf";
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

    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        company: true,
        customer: true,
        allocations: { include: { invoice: { select: { invoiceNumber: true } } } },
      },
    });

    if (!payment) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const membership = await prisma.userMembership.findFirst({
      where: { userId: session.user.id, companyId: payment.companyId },
    });
    if (!membership) {
      return NextResponse.json({ error: "No access" }, { status: 403 });
    }

    const data: KwitansiPdfData = {
      paymentNumber: payment.paymentNumber,
      paymentDate: payment.paymentDate.toISOString(),
      amount: Number(payment.amount),
      method: payment.method,
      description: payment.description,
      invoiceReferences: payment.allocations.map((a) => a.invoice?.invoiceNumber).filter((n): n is string => !!n),
      company: {
        name: payment.company.name,
        description: payment.company.description,
        address: payment.company.address,
        city: payment.company.city,
        province: payment.company.province,
        postalCode: payment.company.postalCode,
        phone: payment.company.phone,
        email: payment.company.email,
        npwp: payment.company.npwp,
        bankName: payment.company.bankName,
        bankAccount: payment.company.bankAccount,
        logo: payment.company.logo,
        signatoryName: payment.company.signatoryName,
        signatoryTitle: payment.company.signatoryTitle,
      },
      customerName: payment.customer?.name || "-",
      customerAddress: payment.customer?.address,
    };

    const buffer = await renderToBuffer(KwitansiPdfDocument({ data }));

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${payment.paymentNumber}.pdf"`,
      },
    });
  } catch (error) {
    console.error("GET /api/payments/[id]/pdf error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
