import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  try {
    { const denied = await guard(["purchasing", "operational", "sales", "finance"], "view"); if (denied) return denied; }
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

    const companyIds = user.memberships.map((m: any) => m.companyId);

    // Services (itemType "service") never carry physical stock — a "Jasa Instalasi"
    // or "Delivery Cost" line has nothing to warehouse, so it is excluded here
    // rather than shown with a stock quantity that means nothing (Tahap 6 audit).
    const stocks = await prisma.stock.findMany({
      where: { warehouse: { companyId: { in: companyIds }, deletedAt: null }, product: { itemType: { not: "service" } } },
      include: {
        warehouse: { select: { id: true, code: true, name: true } },
        product: { select: { id: true, sku: true, name: true, unit: { select: { code: true } } } },
      },
      orderBy: [{ warehouse: { code: "asc" } }, { product: { sku: "asc" } }],
    });

    return NextResponse.json(stocks);
  } catch (error) {
    console.error("GET /api/stock error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
