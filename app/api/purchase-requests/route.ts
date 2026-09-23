import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { formatDocumentNumber, currentYearRange } from "@/lib/document-number";
import { guard } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  try {
    { const denied = await guard(["purchasing"], "view"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { memberships: true },
    });

    if (!user?.memberships.length) {
      return NextResponse.json({ error: "No company access" }, { status: 403 });
    }

    const companyIds = user.memberships.map((m: any) => m.companyId);

    const purchaseRequests = await prisma.purchaseRequest.findMany({
      where: {
        companyId: { in: companyIds },
        deletedAt: null,
      },
      include: {
        project: { select: { id: true, projectName: true } },
        items: true,
        purchaseOrders: { where: { deletedAt: null }, select: { id: true, poNumber: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(purchaseRequests);
  } catch (error) {
    console.error("GET /api/purchase-requests error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    { const denied = await guard(["purchasing"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      companyId,
      projectId,
      requestDate,
      requiredDate,
      requestedBy,
      department,
      notes,
      items,
    } = body;

    if (!companyId || !requestDate || !items?.length) {
      return NextResponse.json(
        { error: "companyId, requestDate, and at least one item are required" },
        { status: 400 }
      );
    }

    const { year, start, end } = currentYearRange();
    const count = await prisma.purchaseRequest.count({
      where: { companyId, createdAt: { gte: start, lt: end } },
    });
    const requestNumber = formatDocumentNumber("PR", year, count + 1);

    const purchaseRequest = await prisma.purchaseRequest.create({
      data: {
        companyId,
        projectId: projectId || null,
        requestNumber,
        requestDate: new Date(requestDate),
        requiredDate: requiredDate ? new Date(requiredDate) : null,
        requestedBy,
        department,
        notes,
        createdBy: session.user.email,
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
      },
      include: { items: true },
    });

    return NextResponse.json(purchaseRequest, { status: 201 });
  } catch (error) {
    console.error("POST /api/purchase-requests error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
