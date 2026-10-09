import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rbac";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    { const denied = await guard(["operational"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id: projectId } = await params;

    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const body = await req.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return NextResponse.json({ error: "Judul perubahan wajib diisi" }, { status: 400 });

    const count = await prisma.changeOrder.count({ where: { projectId } });
    const changeNumber = `CO-${String(count + 1).padStart(3, "0")}`;

    const created = await prisma.changeOrder.create({
      data: {
        projectId,
        changeNumber,
        title,
        description: typeof body.description === "string" ? body.description.trim() || null : null,
        valueImpact: Number(body.valueImpact) || 0,
        budgetImpact: Number(body.budgetImpact) || 0,
        requestedBy: session.user.email,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("POST /api/projects/[id]/change-orders error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
