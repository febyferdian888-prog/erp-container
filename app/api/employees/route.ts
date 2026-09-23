import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { formatDocumentNumber, currentYearRange } from "@/lib/document-number";
import { guard } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  try {
    { const denied = await guard(["hr"], "view"); if (denied) return denied; }
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

    const employees = await prisma.employee.findMany({
      where: {
        companyId: { in: companyIds },
        deletedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(employees);
  } catch (error) {
    console.error("GET /api/employees error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    { const denied = await guard(["hr"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      companyId,
      name,
      email,
      phone,
      address,
      city,
      province,
      country,
      postalCode,
      dateOfBirth,
      gender,
      maritalStatus,
      department,
      position,
      hireDate,
      notes,
    } = body;

    if (!companyId || !name || !hireDate) {
      return NextResponse.json(
        { error: "companyId, name, and hireDate are required" },
        { status: 400 }
      );
    }

    const { year, start, end } = currentYearRange();
    const count = await prisma.employee.count({
      where: { companyId, createdAt: { gte: start, lt: end } },
    });
    const employeeNumber = formatDocumentNumber("EMP", year, count + 1);

    const employee = await prisma.employee.create({
      data: {
        companyId,
        employeeNumber,
        name,
        email,
        phone,
        address,
        city,
        province,
        country,
        postalCode,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        gender,
        maritalStatus,
        department,
        position,
        hireDate: new Date(hireDate),
        notes,
        isActive: true,
        status: "active",
      },
    });

    return NextResponse.json(employee, { status: 201 });
  } catch (error) {
    console.error("POST /api/employees error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
