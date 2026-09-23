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

    const customers = await prisma.customer.findMany({
      where: {
        companyId: { in: companyIds },
        deletedAt: null,
      },
      select: {
        id: true,
        code: true,
        name: true,
        email: true,
        phone: true,
        city: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(customers);
  } catch (error) {
    console.error("GET /api/customers error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    { const denied = await guard(["sales"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { companyId, code, name, email, phone, address, city, province, country, postalCode, npwp } = body;

    const membership = await prisma.userMembership.findUnique({
      where: {
        userId_companyId_roleId: {
          userId: session.user.id!,
          companyId,
          roleId: "", // Will be filled by DB constraint
        },
      },
    }).catch(() => null);

    if (!membership) {
      return NextResponse.json({ error: "No access to this company" }, { status: 403 });
    }

    const existing = await prisma.customer.findUnique({
      where: { companyId_code: { companyId, code } },
    });

    if (existing) {
      return NextResponse.json({ error: "Customer code already exists" }, { status: 400 });
    }

    const customer = await prisma.customer.create({
      data: {
        companyId,
        code,
        name,
        email,
        phone,
        address,
        city,
        province,
        country,
        postalCode,
        npwp,
        isActive: true,
      },
    });

    return NextResponse.json(customer, { status: 201 });
  } catch (error) {
    console.error("POST /api/customers error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
