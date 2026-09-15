import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const units = await prisma.unit.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    });

    return NextResponse.json(units);
  } catch (error) {
    console.error("GET /api/units error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
