import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { userHasCompanyAccess } from "@/lib/company-access";
import { loadSoCoverage } from "@/lib/so-procurement";

// Which lines of this sales order already have a PO (and with which vendor), and what is
// still unbought. Quantities only, never selling prices.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    { const denied = await guard("any", "view"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const so = await prisma.salesOrder.findFirst({ where: { id, deletedAt: null }, select: { companyId: true } });
    if (!so || !(await userHasCompanyAccess(prisma, session.user.id, so.companyId))) {
      return NextResponse.json({ error: "Sales order not found" }, { status: 404 });
    }

    const coverage = (await loadSoCoverage(prisma, [id]))[id];
    return NextResponse.json(coverage);
  } catch (error) {
    console.error("GET /api/sales-orders/[id]/coverage error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
