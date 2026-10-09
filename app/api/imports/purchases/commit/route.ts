import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { commitPurchaseBills, type CommitBill } from "@/lib/purchase-import-commit";
import { guard } from "@/lib/rbac";

export async function POST(req: NextRequest) {
  try {
    { const denied = await guard(["finance", "purchasing"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = await prisma.user.findUnique({ where: { email: session.user.email }, include: { memberships: true } });
    const companyId = user?.memberships.find((membership) => membership.isActive)?.companyId;
    if (!companyId || !user) return NextResponse.json({ error: "No company access" }, { status: 403 });

    const { bills } = (await req.json()) as { bills: CommitBill[] };
    if (!Array.isArray(bills) || !bills.length) return NextResponse.json({ error: "Tidak ada bill" }, { status: 400 });
    if (bills.length > 60) return NextResponse.json({ error: "Maksimal 60 bill per permintaan" }, { status: 400 });

    const { results, suppliersCreated } = await commitPurchaseBills(prisma, companyId, user.email, bills);
    return NextResponse.json({ results, suppliersCreated });
  } catch (error) {
    console.error("POST /api/imports/purchases/commit error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
