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

    const reimbursements = await prisma.reimbursement.findMany({
      where: { employee: { companyId: { in: companyIds }, deletedAt: null } },
      include: {
        employee: { select: { id: true, employeeNumber: true, name: true, department: true } },
        project: { select: { id: true, projectNumber: true, projectName: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(reimbursements);
  } catch (error) {
    console.error("GET /api/reimbursements error:", error);
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
    const { companyId, employeeId, projectId, submissionDate, category, amount, notes } = body;

    if (!companyId || !employeeId || !submissionDate || !amount) {
      return NextResponse.json(
        { error: "companyId, employeeId, submissionDate, and amount are required" },
        { status: 400 }
      );
    }

    const { year, start, end } = currentYearRange();
    const count = await prisma.reimbursement.count({
      where: { employee: { companyId }, createdAt: { gte: start, lt: end } },
    });
    const reimbursementNumber = formatDocumentNumber("REIMB", year, count + 1);

    const reimbursement = await prisma.reimbursement.create({
      data: {
        employeeId,
        projectId: projectId || null,
        reimbursementNumber,
        submissionDate: new Date(submissionDate),
        category,
        amount,
        notes,
        status: "pending",
      },
      include: {
        employee: { select: { employeeNumber: true, name: true } },
        project: { select: { projectNumber: true } },
      },
    });

    return NextResponse.json(reimbursement, { status: 201 });
  } catch (error) {
    console.error("POST /api/reimbursements error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
