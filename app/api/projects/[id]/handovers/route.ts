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
    const handoverDate = body.handoverDate ? new Date(body.handoverDate) : null;
    if (!handoverDate || Number.isNaN(handoverDate.getTime())) {
      return NextResponse.json({ error: "Tanggal serah terima wajib diisi" }, { status: 400 });
    }

    const count = await prisma.handoverDocument.count({ where: { projectId } });
    const documentNumber = `BAST-${String(count + 1).padStart(3, "0")}`;

    const created = await prisma.handoverDocument.create({
      data: {
        projectId,
        documentNumber,
        handoverDate,
        scope: typeof body.scope === "string" ? body.scope.trim() || null : null,
        customerSignee: typeof body.customerSignee === "string" ? body.customerSignee.trim() || null : null,
        companySignee: typeof body.companySignee === "string" ? body.companySignee.trim() || null : null,
        createdBy: session.user.email,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("POST /api/projects/[id]/handovers error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
