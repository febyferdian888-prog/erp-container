import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rbac";

// Approve/reject a change order. Only this transition may move status —
// there is no generic PATCH-anything here on purpose (the value/budget
// impact is fixed once created; re-pricing a change means creating a new one).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; coId: string }> }) {
  try {
    { const denied = await guard(["operational"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id: projectId, coId } = await params;

    const co = await prisma.changeOrder.findUnique({ where: { id: coId } });
    if (!co || co.projectId !== projectId) return NextResponse.json({ error: "Change order not found" }, { status: 404 });

    const body = await req.json();
    const status = body.status;
    if (!["approved", "rejected", "pending"].includes(status)) {
      return NextResponse.json({ error: "Status tidak valid" }, { status: 400 });
    }

    const updated = await prisma.changeOrder.update({
      where: { id: coId },
      data: {
        status,
        approvedBy: status === "approved" ? session.user.email : status === "pending" ? null : co.approvedBy,
        approvedAt: status === "approved" ? new Date() : status === "pending" ? null : co.approvedAt,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH /api/projects/[id]/change-orders/[coId] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
