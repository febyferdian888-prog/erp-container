import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
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

    const salesOrders = await prisma.salesOrder.findMany({
      where: {
        companyId: { in: companyIds },
        deletedAt: null,
      },
      include: {
        customer: { select: { name: true } },
        quotation: { select: { number: true } },
        project: { select: { projectNumber: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(salesOrders);
  } catch (error) {
    console.error("GET /api/sales-orders error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { companyId, customerId, soNumber, poNumber, poDate, deliveryDate, notes } = body;

    const membership = await prisma.userMembership.findFirst({
      where: { userId: session.user.id, companyId },
    }).catch(() => null);

    if (!membership) {
      return NextResponse.json({ error: "No access" }, { status: 403 });
    }

    const existing = await prisma.salesOrder.findUnique({
      where: { companyId_soNumber: { companyId, soNumber } },
    });

    if (existing) {
      return NextResponse.json({ error: "SO number already exists" }, { status: 400 });
    }

    const salesOrder = await prisma.salesOrder.create({
      data: {
        companyId,
        customerId,
        soNumber,
        poNumber,
        poDate: new Date(poDate),
        deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
        notes,
        status: "draft",
      },
      include: { customer: true },
    });

    return NextResponse.json(salesOrder, { status: 201 });
  } catch (error) {
    console.error("POST /api/sales-orders error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
