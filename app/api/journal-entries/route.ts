import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { formatDocumentNumber, currentYearRange } from "@/lib/document-number";
import { guard } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  try {
    { const denied = await guard(["finance"], "view"); if (denied) return denied; }
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

    const entries = await prisma.journalEntry.findMany({
      where: { companyId: { in: companyIds } },
      include: { lines: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(entries);
  } catch (error) {
    console.error("GET /api/journal-entries error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    { const denied = await guard(["finance"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { companyId, entryDate, description, lines, status } = body;
    const initialStatus = status === "posted" ? "posted" : "draft";

    if (!companyId || !entryDate || !lines?.length) {
      return NextResponse.json(
        { error: "companyId, entryDate, and at least one line are required" },
        { status: 400 }
      );
    }

    const totalDebit = lines.reduce((sum: number, l: any) => sum + Number(l.debitAmount || 0), 0);
    const totalCredit = lines.reduce((sum: number, l: any) => sum + Number(l.creditAmount || 0), 0);
    if (Math.round(totalDebit * 100) !== Math.round(totalCredit * 100)) {
      return NextResponse.json(
        { error: `Journal entry is not balanced: debit ${totalDebit} vs credit ${totalCredit}` },
        { status: 400 }
      );
    }

    const { year, start, end } = currentYearRange();
    const count = await prisma.journalEntry.count({
      where: { companyId, createdAt: { gte: start, lt: end } },
    });
    const entryNumber = formatDocumentNumber("JE", year, count + 1);

    const entry = await prisma.journalEntry.create({
      data: {
        companyId,
        entryNumber,
        entryDate: new Date(entryDate),
        description,
        createdBy: session.user.email,
        status: initialStatus,
        ...(initialStatus === "posted" ? { postedBy: session.user.email, postedAt: new Date() } : {}),
        lines: {
          create: lines.map((l: any) => ({
            accountCode: l.accountCode,
            description: l.description,
            debitAmount: l.debitAmount || 0,
            creditAmount: l.creditAmount || 0,
          })),
        },
      },
      include: { lines: true },
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error("POST /api/journal-entries error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
