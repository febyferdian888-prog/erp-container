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
    const reimbursement = await prisma.reimbursement.findUnique({
      where: { id },
      include: { employee: true, project: { select: { id: true, projectNumber: true, projectName: true } } },
    });

    if (!reimbursement) {
      return NextResponse.json({ error: "Reimbursement not found" }, { status: 404 });
    }

    return NextResponse.json(reimbursement);
  } catch (error) {
    console.error("GET /api/reimbursements/[id] error:", error);
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
    const { category, amount, submissionDate, status, notes } = body;

    const reimbursement = await prisma.reimbursement.update({
      where: { id },
      data: {
        category,
        amount,
        submissionDate: submissionDate ? new Date(submissionDate) : undefined,
        status,
        notes,
        ...(status === "approved" ? { approvedBy: session.user.email, approvedAt: new Date() } : {}),
      },
      include: {
        employee: { select: { employeeNumber: true, name: true } },
        project: { select: { projectNumber: true } },
      },
    });

    return NextResponse.json(reimbursement);
  } catch (error) {
    console.error("PUT /api/reimbursements/[id] error:", error);
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
    await prisma.reimbursement.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/reimbursements/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
