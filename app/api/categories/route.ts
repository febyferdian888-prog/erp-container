import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";

export async function GET() {
  try {
    { const denied = await guard("any", "view"); if (denied) return denied; }
    const categories = await prisma.productCategory.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(categories);
  } catch (error) {
    console.error("GET /api/categories error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
