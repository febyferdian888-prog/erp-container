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
    { const denied = await guard(["finance"], "view"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const entry = await prisma.journalEntry.findUnique({
      where: { id },
      include: { lines: true },
    });

    if (!entry) {
      return NextResponse.json({ error: "Journal entry not found" }, { status: 404 });
    }

    return NextResponse.json(entry);
  } catch (error) {
    console.error("GET /api/journal-entries/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    { const denied = await guard(["finance"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { entryDate, description, status, lines } = body;

    const existing = await prisma.journalEntry.findUnique({ where: { id } });
    if (existing?.status === "posted" && status !== "reversed") {
      return NextResponse.json(
        { error: "Posted journal entries can only be reversed, not edited" },
        { status: 400 }
      );
    }

    if (lines) {
      const totalDebit = lines.reduce((sum: number, l: any) => sum + Number(l.debitAmount || 0), 0);
      const totalCredit = lines.reduce((sum: number, l: any) => sum + Number(l.creditAmount || 0), 0);
      if (Math.round(totalDebit * 100) !== Math.round(totalCredit * 100)) {
        return NextResponse.json(
          { error: `Journal entry is not balanced: debit ${totalDebit} vs credit ${totalCredit}` },
          { status: 400 }
        );
      }
      await prisma.journalLine.deleteMany({ where: { journalId: id } });
    }

    const entry = await prisma.journalEntry.update({
      where: { id },
      data: {
        entryDate: entryDate ? new Date(entryDate) : undefined,
        description,
        status,
        ...(status === "posted" ? { postedBy: session.user.email, postedAt: new Date() } : {}),
        ...(lines
          ? {
              lines: {
                create: lines.map((l: any) => ({
                  accountCode: l.accountCode,
                  description: l.description,
                  debitAmount: l.debitAmount || 0,
                  creditAmount: l.creditAmount || 0,
                })),
              },
            }
          : {}),
      },
      include: { lines: true },
    });

    return NextResponse.json(entry);
  } catch (error) {
    console.error("PUT /api/journal-entries/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    { const denied = await guard(["finance"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const existing = await prisma.journalEntry.findUnique({ where: { id } });
    if (existing?.status === "posted") {
      return NextResponse.json({ error: "Cannot delete a posted journal entry. Reverse it instead." }, { status: 400 });
    }

    await prisma.journalLine.deleteMany({ where: { journalId: id } });
    await prisma.journalEntry.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/journal-entries/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
