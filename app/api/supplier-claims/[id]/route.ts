import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rbac";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    { const denied = await guard(["purchasing"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { status, resolutionNotes } = await req.json();
    if (!["open", "resolved", "rejected"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const claim = await prisma.supplierClaim.update({
      where: { id },
      data: {
        status,
        resolutionNotes,
        resolvedAt: status === "resolved" || status === "rejected" ? new Date() : null,
      },
    });

    return NextResponse.json(claim);
  } catch (error) {
    console.error("PUT /api/supplier-claims/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
