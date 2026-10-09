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
    if (!title) return NextResponse.json({ error: "Judul pemeriksaan wajib diisi" }, { status: 400 });

    if (body.stageId) {
      const stage = await prisma.projectStage.findUnique({ where: { id: body.stageId }, select: { projectId: true } });
      if (!stage || stage.projectId !== projectId) return NextResponse.json({ error: "Milestone tidak ditemukan" }, { status: 400 });
    }

    const count = await prisma.qualityCheck.count({ where: { projectId } });
    const checkNumber = `QC-${String(count + 1).padStart(3, "0")}`;

    const created = await prisma.qualityCheck.create({
      data: {
        projectId,
        stageId: body.stageId || null,
        checkNumber,
        title,
        notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("POST /api/projects/[id]/quality-checks error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
