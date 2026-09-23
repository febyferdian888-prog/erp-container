import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { ApprovalRequiredError, assertReleaseAllowed } from "@/lib/approval";
import { guard } from "@/lib/rbac";

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
        items: {
          create: (items || []).map((item: any) => ({
            lineNumber: item.lineNumber,
            partNumber: item.partNumber,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            subtotal: item.subtotal,
            notes: item.notes,
          })),
        },
      },
      include: { customer: true, items: true },
    });

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
