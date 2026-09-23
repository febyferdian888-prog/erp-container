import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { PoPdfDocument, PoPdfData } from "@/lib/po-pdf";
import { guard } from "@/lib/rbac";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    { const denied = await guard(["purchasing"], "view"); if (denied) return denied; }
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const po = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        company: true,
        supplier: true,
        purchaseRequest: { select: { requestNumber: true } },
        items: { orderBy: { lineNumber: "asc" } },
      },
    });

    if (!po) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const membership = await prisma.userMembership.findFirst({
      where: { userId: session.user.id, companyId: po.companyId },
    });
    if (!membership) {
      return NextResponse.json({ error: "No access" }, { status: 403 });
    }

    const data: PoPdfData = {
      poNumber: po.poNumber,
      poDate: po.poDate.toISOString(),
      deliveryDate: po.deliveryDate ? po.deliveryDate.toISOString() : null,
      paymentTerms: po.paymentTerms,
      status: po.status,
      notes: po.notes,
      sourcePrNumber: po.purchaseRequest?.requestNumber || null,
      company: {
        name: po.company.name,
        description: po.company.description,
        address: po.company.address,
        city: po.company.city,
        province: po.company.province,
        postalCode: po.company.postalCode,
        phone: po.company.phone,
        email: po.company.email,
        npwp: po.company.npwp,
      },
      supplier: {
        name: po.supplier.name,
        address: po.supplier.address,
        city: po.supplier.city,
        phone: po.supplier.phone,
      },
      items: po.items.map((item) => ({
        lineNumber: item.lineNumber,
        description: item.description,
        quantity: Number(item.quantity),
        unit: item.unit,
        unitPrice: Number(item.unitPrice),
        subtotal: Number(item.subtotal),
        notes: item.notes,
      })),
    };

    const buffer = await renderToBuffer(PoPdfDocument({ data }));

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${po.poNumber}.pdf"`,
      },
    });
  } catch (error) {
    console.error("GET /api/purchase-orders/[id]/pdf error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
