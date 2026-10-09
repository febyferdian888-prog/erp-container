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

    // Two real sign-off tiers (Purchasing reviews, then Owner approves — see
    // lib/approval.ts APPROVAL_TIERS), pulled in request order so each name
    // lands under the right signature block instead of a fabricated one.
    const approvalRows = await prisma.approval.findMany({
      where: { referenceType: "PurchaseOrder", referenceId: id, status: "approved" },
      orderBy: { createdAt: "asc" },
    });
    const reviewRow = approvalRows.find((a) => a.approverRole === "Purchasing");
    const approveRow = approvalRows.find((a) => a.approverRole === "Owner");
    const approverIds = [reviewRow?.approvedBy, approveRow?.approvedBy].filter((v): v is string => !!v);
    const approvers = approverIds.length
      ? await prisma.user.findMany({ where: { id: { in: approverIds } }, select: { id: true, name: true } })
      : [];
    const nameOf = (uid?: string | null) => approvers.find((u) => u.id === uid)?.name || null;

    const data: PoPdfData = {
      poNumber: po.poNumber,
      revisionNumber: po.revisionNumber,
      poDate: po.poDate.toISOString(),
      deliveryDate: po.deliveryDate ? po.deliveryDate.toISOString() : null,
      paymentTerms: po.paymentTerms,
      currency: po.currency,
      ppnPercent: Number(po.ppnPercent),
      pphPercent: Number(po.pphPercent),
      shipToAddress: po.shipToAddress,
      notes: po.notes,
      sourcePrNumber: po.purchaseRequest?.requestNumber || null,
      company: {
        name: po.company.name,
        description: po.company.description,
        address: po.company.address,
        city: po.company.city,
        province: po.company.province,
        postalCode: po.company.postalCode,
        logo: po.company.logo,
      },
      supplier: {
        name: po.supplier.name,
        address: po.supplier.address,
        city: po.supplier.city,
        pic: po.supplier.picName,
      },
      reviewedByName: nameOf(reviewRow?.approvedBy),
      approvedByName: nameOf(approveRow?.approvedBy),
      items: po.items.map((item) => ({
        lineNumber: item.lineNumber,
        description: item.description,
        brand: item.brand,
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
