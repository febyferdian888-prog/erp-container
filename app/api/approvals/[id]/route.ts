import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { canDecideTier, documentInfo } from "@/lib/approval";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = await prisma.user.findUnique({ where: { email: session.user.email }, include: { memberships: true } });
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const approval = await prisma.approval.findUnique({ where: { id } });
    if (!approval) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (!(await canDecideTier(user.id, approval.approverRole))) {
      return NextResponse.json({ error: `Hanya role ${approval.approverRole} atau Admin yang dapat memutuskan tahap ini` }, { status: 403 });
    }

    const { decision, notes } = await req.json();
    if (decision !== "approved" && decision !== "rejected") {
      return NextResponse.json({ error: "decision must be approved or rejected" }, { status: 400 });
    }
    const info = await documentInfo(prisma, approval.referenceType, approval.referenceId);
    if (!info || !user.memberships.some((m) => m.companyId === info.companyId && m.isActive)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (approval.status !== "pending") {
      return NextResponse.json({ error: "Pengajuan ini sudah diputuskan" }, { status: 400 });
    }

    const updated = await prisma.approval.update({
      where: { id },
      data: { status: decision, approvedBy: user.id, approvedAt: new Date(), notes: notes || null },
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT /api/approvals/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
