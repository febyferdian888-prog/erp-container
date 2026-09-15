import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
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

    const companyIds = user.memberships.map((m) => m.companyId);

    const suppliers = await prisma.supplier.findMany({
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

    return NextResponse.json(suppliers);
  } catch (error) {
    console.error("GET /api/suppliers error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { companyId, code, name, email, phone, address, city, province, country, postalCode, npwp, bankAccount, bankName } = body;

    const existing = await prisma.supplier.findUnique({
      where: { companyId_code: { companyId, code } },
    });

    if (existing) {
      return NextResponse.json({ error: "Supplier code already exists" }, { status: 400 });
    }

    const supplier = await prisma.supplier.create({
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
        bankAccount,
        bankName,
        isActive: true,
      },
    });

    return NextResponse.json(supplier, { status: 201 });
  } catch (error) {
    console.error("POST /api/suppliers error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
