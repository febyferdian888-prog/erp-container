import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  try {
    { const denied = await guard("any", "view"); if (denied) return denied; }
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

    const warehouses = await prisma.warehouse.findMany({
      where: { companyId: { in: companyIds }, deletedAt: null },
      include: { stocks: { select: { id: true } } },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(warehouses);
  } catch (error) {
    console.error("GET /api/warehouses error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    { const denied = await guard(["purchasing"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { companyId, code, name, type, description, address } = body;

    if (!companyId || !code || !name) {
      return NextResponse.json({ error: "companyId, code, and name are required" }, { status: 400 });
    }

    const existing = await prisma.warehouse.findUnique({
      where: { companyId_code: { companyId, code } },
    });
    if (existing) {
      return NextResponse.json({ error: "Warehouse code already exists" }, { status: 400 });
    }

    const warehouse = await prisma.warehouse.create({
      data: {
        companyId,
        code,
        name,
        type: type || "warehouse",
        description,
        address,
        isActive: true,
      },
    });

    return NextResponse.json(warehouse, { status: 201 });
  } catch (error) {
    console.error("POST /api/warehouses error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
