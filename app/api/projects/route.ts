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

    const projects = await prisma.project.findMany({
      where: {
        companyId: { in: companyIds },
        deletedAt: null,
      },
      include: {
        customer: { select: { id: true, name: true } },
        stages: true,
        workOrders: { where: { deletedAt: null }, select: { id: true } },
        boms: { select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(projects);
  } catch (error) {
    console.error("GET /api/projects error:", error);
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
    const {
      companyId,
      customerId,
      projectName,
      description,
      executionMethod,
      startDate,
      targetEndDate,
      budget,
      responsible,
      notes,
      stages,
    } = body;

    if (!companyId || !projectName || !startDate || !targetEndDate) {
      return NextResponse.json(
        { error: "companyId, projectName, startDate, and targetEndDate are required" },
        { status: 400 }
      );
    }

    const { year, start, end } = currentYearRange();
    const count = await prisma.project.count({
      where: { companyId, createdAt: { gte: start, lt: end } },
    });
    const projectNumber = formatDocumentNumber("PRJ", year, count + 1);

    const project = await prisma.project.create({
      data: {
        companyId,
        customerId: customerId || null,
        projectNumber,
        projectName,
        description,
        executionMethod: executionMethod || "supplier",
        startDate: new Date(startDate),
        targetEndDate: new Date(targetEndDate),
        budget: budget || 0,
        responsible,
        notes,
        createdBy: session.user.email,
        ...(stages?.length
          ? {
              stages: {
                create: stages.map((s: any, index: number) => ({
                  stageNumber: index + 1,
                  stageName: s.stageName,
                  description: s.description,
                  progressWeight: s.progressWeight || 100,
                  status: s.status || "pending",
                })),
              },
            }
          : {}),
      },
      include: { customer: true, stages: true },
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error("POST /api/projects error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
