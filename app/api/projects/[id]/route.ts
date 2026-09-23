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
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        customer: true,
        stages: { orderBy: { stageNumber: "asc" } },
        workOrders: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
        boms: { orderBy: { createdAt: "desc" }, include: { items: true } },
        salesOrder: { select: { id: true, soNumber: true } },
        purchaseOrders: { where: { deletedAt: null }, select: { id: true, poNumber: true } },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json(project);
  } catch (error) {
    console.error("GET /api/projects/[id] error:", error);
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
    const {
      customerId,
      projectName,
      description,
      executionMethod,
      startDate,
      targetEndDate,
      actualEndDate,
      budget,
      status,
      responsible,
      notes,
      stages,
    } = body;

    if (stages) {
      await prisma.projectStage.deleteMany({ where: { projectId: id } });
    }

    const project = await prisma.project.update({
      where: { id },
      data: {
        customerId: customerId || null,
        projectName,
        description,
        executionMethod,
        startDate: startDate ? new Date(startDate) : undefined,
        targetEndDate: targetEndDate ? new Date(targetEndDate) : undefined,
        actualEndDate: actualEndDate ? new Date(actualEndDate) : null,
        budget,
        status,
        responsible,
        notes,
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
      include: { customer: true, stages: { orderBy: { stageNumber: "asc" } } },
    });

    return NextResponse.json(project);
  } catch (error) {
    console.error("PUT /api/projects/[id] error:", error);
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
    await prisma.project.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/projects/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
