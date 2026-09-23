import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rbac";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    { const denied = await guard(["hr"], "view"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const employee = await prisma.employee.findUnique({
      where: { id },
      include: {
        leaves: { orderBy: { createdAt: "desc" } },
        reimbursements: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    return NextResponse.json(employee);
  } catch (error) {
    console.error("GET /api/employees/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    { const denied = await guard(["hr"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const {
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
      status,
      hireDate,
      resignDate,
      notes,
    } = body;

    const employee = await prisma.employee.update({
      where: { id },
      data: {
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
        status,
        hireDate: hireDate ? new Date(hireDate) : undefined,
        resignDate: resignDate ? new Date(resignDate) : null,
        isActive: status !== "resigned" && status !== "inactive",
        notes,
      },
    });

    return NextResponse.json(employee);
  } catch (error) {
    console.error("PUT /api/employees/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    { const denied = await guard(["hr"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    await prisma.employee.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/employees/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
