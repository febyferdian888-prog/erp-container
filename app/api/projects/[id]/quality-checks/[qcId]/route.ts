import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rbac";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; qcId: string }> }) {
  try {
    { const denied = await guard(["operational"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id: projectId, qcId } = await params;

    const qc = await prisma.qualityCheck.findUnique({ where: { id: qcId } });
    if (!qc || qc.projectId !== projectId) return NextResponse.json({ error: "Quality check not found" }, { status: 404 });

    const body = await req.json();
    const result = body.result;
    if (!["pending", "passed", "failed", "rework"].includes(result)) {
      return NextResponse.json({ error: "Hasil tidak valid" }, { status: 400 });
    }

    const updated = await prisma.qualityCheck.update({
      where: { id: qcId },
      data: {
        result,
        inspectedBy: result === "pending" ? null : session.user.email,
        inspectedAt: result === "pending" ? null : new Date(),
        notes: typeof body.notes === "string" ? body.notes.trim() || null : undefined,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH /api/projects/[id]/quality-checks/[qcId] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
