import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  try {
    { const denied = await guard(["finance"], "view"); if (denied) return denied; }
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

    const accounts = await prisma.chartOfAccount.findMany({
      where: {
        companyId: { in: companyIds },
        deletedAt: null,
      },
      orderBy: { accountCode: "asc" },
    });

    return NextResponse.json(accounts);
  } catch (error) {
    console.error("GET /api/chart-of-accounts error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    { const denied = await guard(["finance"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { companyId, accountCode, accountName, accountType } = body;

    if (!companyId || !accountCode || !accountName || !accountType) {
      return NextResponse.json(
        { error: "companyId, accountCode, accountName, and accountType are required" },
        { status: 400 }
      );
    }

    const existing = await prisma.chartOfAccount.findUnique({
      where: { companyId_accountCode: { companyId, accountCode } },
    });
    if (existing) {
      return NextResponse.json({ error: "Account code already exists" }, { status: 400 });
    }

    const account = await prisma.chartOfAccount.create({
      data: { companyId, accountCode, accountName, accountType, isActive: true },
    });

    return NextResponse.json(account, { status: 201 });
  } catch (error) {
    console.error("POST /api/chart-of-accounts error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
