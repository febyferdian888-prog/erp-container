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

    const companyIds = user.memberships.map((m: any) => m.companyId);

    const payments = await prisma.payment.findMany({
      where: { companyId: { in: companyIds } },
      include: {
        allocations: true,
      },
      orderBy: { paymentDate: "desc" },
    });

    return NextResponse.json(payments);
  } catch (error) {
    console.error("GET /api/payments error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { companyId, referenceType, referenceId, paymentNumber, paymentDate, amount, method, bankAccount, notes } =
      body;

    const membership = await prisma.userMembership.findFirst({
      where: { userId: session.user.id, companyId },
    }).catch(() => null);

    if (!membership) {
      return NextResponse.json({ error: "No access" }, { status: 403 });
    }

    const existing = await prisma.payment.findFirst({
      where: {
        companyId,
        referenceType,
        referenceId,
      },
    });

    if (existing) {
      return NextResponse.json({ error: "Payment already recorded" }, { status: 400 });
    }

    const payment = await prisma.payment.create({
      data: {
        companyId,
        referenceType,
        referenceId,
        paymentNumber,
        paymentDate: new Date(paymentDate),
        amount,
        method,
        bankAccount,
        notes,
        status: "recorded",
      },
    });

    // Update invoice paid amount
    if (referenceType === "Invoice") {
      await prisma.invoice.update({
        where: { id: referenceId },
        data: { paidAmount: { increment: amount } },
      });
    }

    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    console.error("POST /api/payments error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
