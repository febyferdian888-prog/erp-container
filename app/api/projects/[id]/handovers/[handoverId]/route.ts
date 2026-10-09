import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rbac";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; handoverId: string }> }) {
  try {
    { const denied = await guard(["operational"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id: projectId, handoverId } = await params;

    const doc = await prisma.handoverDocument.findUnique({ where: { id: handoverId } });
    if (!doc || doc.projectId !== projectId) return NextResponse.json({ error: "BAST not found" }, { status: 404 });

    const body = await req.json();
    const status = body.status;
    if (!["draft", "signed", "cancelled"].includes(status)) {
      return NextResponse.json({ error: "Status tidak valid" }, { status: 400 });
    }

    const updated = await prisma.handoverDocument.update({ where: { id: handoverId }, data: { status } });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH /api/projects/[id]/handovers/[handoverId] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
