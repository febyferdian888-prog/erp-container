import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { GoodsReceiptPdfDocument, GoodsReceiptPdfData } from "@/lib/goods-receipt-pdf";
import { guard } from "@/lib/rbac";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    { const denied = await guard(["purchasing"], "view"); if (denied) return denied; }
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const gr = await prisma.goodsReceipt.findUnique({
      where: { id },
      include: {
        company: true,
        warehouse: { select: { name: true } },
        purchaseOrder: { include: { supplier: true, items: true } },
        items: true,
        claims: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    if (!gr) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const membership = await prisma.userMembership.findFirst({
      where: { userId: session.user.id, companyId: gr.companyId },
    });
    if (!membership) return NextResponse.json({ error: "No access" }, { status: 403 });

    const data: GoodsReceiptPdfData = {
      receiptNumber: gr.receiptNumber,
      receiptDate: gr.receiptDate.toISOString(),
      status: gr.status,
      notes: gr.notes,
      inspectedByName: gr.inspectedByName,
      inspectedAt: gr.inspectedAt ? gr.inspectedAt.toISOString() : null,
      poNumber: gr.purchaseOrder.poNumber,
      warehouseName: gr.warehouse?.name || null,
      company: {
        name: gr.company.name,
        description: gr.company.description,
        address: gr.company.address,
        city: gr.company.city,
        province: gr.company.province,
        postalCode: gr.company.postalCode,
        logo: gr.company.logo,
      },
      supplier: {
        name: gr.purchaseOrder.supplier.name,
        address: gr.purchaseOrder.supplier.address,
        city: gr.purchaseOrder.supplier.city,
      },
      items: gr.items.map((item) => {
        const poItem = gr.purchaseOrder.items.find((pi) => pi.id === item.poItemId);
        return {
          description: poItem?.description || "Item",
          quantity: Number(item.quantity),
          unit: item.unit,
          condition: item.condition,
          notes: item.notes,
        };
      }),
      claim: gr.claims[0] ? { claimNumber: gr.claims[0].claimNumber, status: gr.claims[0].status, reason: gr.claims[0].reason } : null,
    };

    const buffer = await renderToBuffer(GoodsReceiptPdfDocument({ data }));

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${gr.receiptNumber}.pdf"`,
      },
    });
  } catch (error) {
    console.error("GET /api/goods-receipts/[id]/pdf error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
