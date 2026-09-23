import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rbac";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    { const denied = await guard(["operational"], "view"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const bom = await prisma.bOM.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, projectNumber: true, projectName: true } },
        items: { include: { product: true, unit: true }, orderBy: { lineNumber: "asc" } },
      },
    });

    if (!bom) {
      return NextResponse.json({ error: "BOM not found" }, { status: 404 });
    }

    return NextResponse.json(bom);
  } catch (error) {
    console.error("GET /api/boms/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    { const denied = await guard(["operational"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { title, description, status, items } = body;

    if (items) {
      await prisma.bOMItem.deleteMany({ where: { bomId: id } });
    }

    const bom = await prisma.bOM.update({
      where: { id },
      data: {
        title,
        description,
        status,
        ...(status === "active" ? { approvedBy: session.user.email, approvedAt: new Date() } : {}),
        ...(items
          ? {
              items: {
                create: items.map((item: any, index: number) => ({
                  productId: item.productId,
                  unitId: item.unitId,
                  lineNumber: index + 1,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice || 0,
                  notes: item.notes,
                })),
              },
            }
          : {}),
      },
      include: {
        project: { select: { projectNumber: true, projectName: true } },
        items: { include: { product: true, unit: true } },
      },
    });

    return NextResponse.json(bom);
  } catch (error) {
    console.error("PUT /api/boms/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    { const denied = await guard(["operational"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    await prisma.bOM.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/boms/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
