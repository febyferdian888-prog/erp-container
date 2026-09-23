import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { getAccess, guard } from "@/lib/rbac";
import { historyForItems, searchPriceHistory } from "@/lib/price-history";

async function companyIds() {
  const access = await getAccess();
  const rows = await prisma.userMembership.findMany({ where: { userId: access!.userId, isActive: true }, select: { companyId: true } });
  return rows.map((r) => r.companyId);
}

// ?q=part number or description
export async function GET(req: NextRequest) {
  try {
    { const denied = await guard(["purchasing", "finance"], "view"); if (denied) return denied; }
    const q = (new URL(req.url).searchParams.get("q") || "").trim();
    if (q.length < 2) return NextResponse.json({ groups: [] });
    return NextResponse.json({ groups: await searchPriceHistory(await companyIds(), q) });
  } catch (error) {
    console.error("GET /api/price-history error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// body: { items: [{ partNumber, description }] } -> vendor prices per item, same order
export async function POST(req: NextRequest) {
  try {
    { const denied = await guard(["purchasing", "finance"], "view"); if (denied) return denied; }
    const { items } = (await req.json()) as { items: { partNumber?: string; description: string }[] };
    if (!Array.isArray(items) || items.length > 500) return NextResponse.json({ error: "Invalid items" }, { status: 400 });
    return NextResponse.json({ history: await historyForItems(await companyIds(), items) });
  } catch (error) {
    console.error("POST /api/price-history error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
