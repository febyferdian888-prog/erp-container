import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  try {
    { const denied = await guard(["purchasing"], "view"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { memberships: true },
    });
    if (!user?.memberships.length) {
      return NextResponse.json({ error: "No company access" }, { status: 403 });
    }
    const companyIds = user.memberships.map((m) => m.companyId);

    const claims = await prisma.supplierClaim.findMany({
      where: { companyId: { in: companyIds } },
      include: {
        supplier: { select: { name: true } },
        goodsReceipt: { select: { receiptNumber: true, purchaseOrder: { select: { poNumber: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(claims);
  } catch (error) {
    console.error("GET /api/supplier-claims error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
