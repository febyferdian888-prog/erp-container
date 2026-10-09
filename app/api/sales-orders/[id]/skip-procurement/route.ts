import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rbac";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    { const denied = await guard(["purchasing"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;

    const so = await prisma.salesOrder.findUnique({ where: { id } });
    if (!so) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const membership = await prisma.userMembership.findFirst({
      where: { userId: session.user.id, companyId: so.companyId, isActive: true },
    });
    if (!membership) return NextResponse.json({ error: "No access" }, { status: 403 });

    await prisma.salesOrder.update({ where: { id }, data: { procurementSkippedAt: new Date() } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/sales-orders/[id]/skip-procurement error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
