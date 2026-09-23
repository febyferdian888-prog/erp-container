import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
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

    const leaves = await prisma.leave.findMany({
      where: { employee: { companyId: { in: companyIds }, deletedAt: null } },
      include: { employee: { select: { id: true, employeeNumber: true, name: true, department: true } } },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(leaves);
  } catch (error) {
    console.error("GET /api/leaves error:", error);
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
    const { employeeId, leaveType, startDate, endDate, reason, notes } = body;

    if (!employeeId || !leaveType || !startDate || !endDate) {
      return NextResponse.json(
        { error: "employeeId, leaveType, startDate, and endDate are required" },
        { status: 400 }
      );
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.max(Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1, 1);

    const leave = await prisma.leave.create({
      data: {
        employeeId,
        leaveType,
        startDate: start,
        endDate: end,
        days,
        reason,
        notes,
        status: "pending",
      },
      include: { employee: { select: { employeeNumber: true, name: true } } },
    });

    return NextResponse.json(leave, { status: 201 });
  } catch (error) {
    console.error("POST /api/leaves error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
