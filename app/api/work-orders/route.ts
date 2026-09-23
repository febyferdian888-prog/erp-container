import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { formatDocumentNumber, currentYearRange } from "@/lib/document-number";
import { guard } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  try {
    { const denied = await guard(["operational"], "view"); if (denied) return denied; }
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

    const workOrders = await prisma.workOrder.findMany({
      where: {
        companyId: { in: companyIds },
        deletedAt: null,
      },
      include: {
        project: { select: { id: true, projectNumber: true, projectName: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(workOrders);
  } catch (error) {
    console.error("GET /api/work-orders error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    { const denied = await guard(["operational"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { companyId, projectId, title, description, startDate, targetEndDate, notes } = body;

    if (!companyId || !projectId || !title) {
      return NextResponse.json(
        { error: "companyId, projectId, and title are required" },
        { status: 400 }
      );
    }

    const { year, start, end } = currentYearRange();
    const count = await prisma.workOrder.count({
      where: { companyId, createdAt: { gte: start, lt: end } },
    });
    const orderNumber = formatDocumentNumber("SPK", year, count + 1);

    const workOrder = await prisma.workOrder.create({
      data: {
        companyId,
        projectId,
        orderNumber,
        title,
        description,
        startDate: startDate ? new Date(startDate) : null,
        targetEndDate: targetEndDate ? new Date(targetEndDate) : null,
        notes,
        createdBy: session.user.email,
      },
      include: { project: { select: { projectNumber: true, projectName: true } } },
    });

    return NextResponse.json(workOrder, { status: 201 });
  } catch (error) {
    console.error("POST /api/work-orders error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
