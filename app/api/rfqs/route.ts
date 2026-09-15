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

    const companyIds = user.memberships.map((m) => m.companyId);

    const rfqs = await prisma.rFQ.findMany({
      where: {
        companyId: { in: companyIds },
        deletedAt: null,
      },
      include: {
        customer: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(rfqs);
  } catch (error) {
    console.error("GET /api/rfqs error:", error);
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
    const { companyId, customerId, number, title, description, requestDate, targetDate, notes } =
      body;

    // Verify user has access
    const membership = await prisma.userMembership.findFirst({
      where: { userId: session.user.id, companyId },
    }).catch(() => null);

    if (!membership) {
      return NextResponse.json({ error: "No access to this company" }, { status: 403 });
    }

    // Check unique number
    const existing = await prisma.rFQ.findUnique({
      where: { companyId_number: { companyId, number } },
    });

    if (existing) {
      return NextResponse.json({ error: "RFQ number already exists" }, { status: 400 });
    }

    const rfq = await prisma.rFQ.create({
      data: {
        companyId,
        customerId,
        number,
        title,
        description,
        requestDate: new Date(requestDate),
        targetDate: targetDate ? new Date(targetDate) : null,
        notes,
        status: "draft",
      },
      include: { customer: true },
    });

    return NextResponse.json(rfq, { status: 201 });
  } catch (error) {
    console.error("POST /api/rfqs error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
