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
    { const denied = await guard(["purchasing"], "view"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const purchaseRequest = await prisma.purchaseRequest.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, projectName: true } },
        items: { orderBy: { lineNumber: "asc" } },
        purchaseOrders: { where: { deletedAt: null }, select: { id: true, poNumber: true } },
      },
    });

    if (!purchaseRequest) {
      return NextResponse.json({ error: "Purchase request not found" }, { status: 404 });
    }

    return NextResponse.json(purchaseRequest);
  } catch (error) {
    console.error("GET /api/purchase-requests/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    { const denied = await guard(["purchasing"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const {
      projectId,
      requestDate,
      requiredDate,
      requestedBy,
      department,
      status,
      notes,
      items,
    } = body;

    if (items) {
      await prisma.purchaseRequestItem.deleteMany({ where: { prId: id } });
    }

    const purchaseRequest = await prisma.purchaseRequest.update({
      where: { id },
      data: {
        projectId: projectId || null,
        requestDate: requestDate ? new Date(requestDate) : undefined,
        requiredDate: requiredDate ? new Date(requiredDate) : null,
        requestedBy,
        department,
        status,
        notes,
        ...(items
          ? {
              items: {
                create: items.map((item: any, index: number) => ({
                  productId: item.productId || null,
                  lineNumber: index + 1,
                  description: item.description,
                  quantity: item.quantity,
                  unit: item.unit,
                  estimatedPrice: item.estimatedPrice || 0,
                  notes: item.notes,
                })),
              },
            }
          : {}),
      },
      include: { items: true },
    });

    return NextResponse.json(purchaseRequest);
  } catch (error) {
    console.error("PUT /api/purchase-requests/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    { const denied = await guard(["purchasing"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    await prisma.purchaseRequest.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/purchase-requests/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
