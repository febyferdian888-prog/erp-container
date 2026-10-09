import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";

// Distinct items previously ordered, newest first, with the last price paid.
export async function GET() {
  try {
    { const denied = await guard(["purchasing"], "view"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { memberships: { where: { isActive: true } } },
    });
    if (!user?.memberships.length) return NextResponse.json({ error: "No company access" }, { status: 403 });

    const rows = await prisma.purchaseOrderItem.findMany({
      where: {
        purchaseOrder: {
          companyId: { in: user.memberships.map((m) => m.companyId) },
          deletedAt: null,
          status: { not: "cancelled" },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 3000,
      select: {
        productId: true,
        description: true,
        brand: true,
        unit: true,
        unitPrice: true,
        purchaseOrder: { select: { poNumber: true, poDate: true, supplier: { select: { name: true } } } },
      },
    });

    const seen = new Map<string, unknown>();
    for (const r of rows) {
      const key = `${r.description.trim().toLowerCase()}|${(r.brand || "").trim().toLowerCase()}|${(r.unit || "").toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.set(key, {
        productId: r.productId,
        description: r.description,
        brand: r.brand,
        unit: r.unit,
        lastPrice: Number(r.unitPrice),
        supplierName: r.purchaseOrder.supplier.name,
        poNumber: r.purchaseOrder.poNumber,
        poDate: r.purchaseOrder.poDate,
      });
    }
    return NextResponse.json([...seen.values()]);
  } catch (error) {
    console.error("GET /api/purchase-orders/item-history error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
