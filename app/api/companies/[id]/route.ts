import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rbac";

async function assertMembership(userEmail: string, companyId: string) {
  const user = await prisma.user.findUnique({
    where: { email: userEmail },
    include: { memberships: true },
  });
  return !!user?.memberships.some((m) => m.companyId === companyId);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    { const denied = await guard("any", "view"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!(await assertMembership(session.user.email, id))) {
      return NextResponse.json({ error: "No access" }, { status: 403 });
    }

    const company = await prisma.company.findUnique({ where: { id } });
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    return NextResponse.json(company);
  } catch (error) {
    console.error("GET /api/companies/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    { const denied = await guard(["admin"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!(await assertMembership(session.user.email, id))) {
      return NextResponse.json({ error: "No access" }, { status: 403 });
    }

    const body = await req.json();
    const {
      name,
      description,
      address,
      city,
      province,
      country,
      postalCode,
      npwp,
      phone,
      email,
      bankAccount,
      bankName,
      currency,
    } = body;

    const company = await prisma.company.update({
      where: { id },
      data: {
        name,
        description,
        address,
        city,
        province,
        country,
        postalCode,
        npwp,
        phone,
        email,
        bankAccount,
        bankName,
        currency,
      },
    });

    return NextResponse.json(company);
  } catch (error) {
    console.error("PUT /api/companies/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
