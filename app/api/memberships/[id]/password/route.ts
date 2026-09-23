import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getAccess, guard } from "@/lib/rbac";
import { passwordProblem } from "@/lib/password";

// An admin sets a new password for a team member who forgot theirs.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    { const denied = await guard(["admin"], "edit"); if (denied) return denied; }
    const access = await getAccess();
    const { id } = await params;
    const { newPassword } = (await req.json()) as { newPassword?: string };

    const target = await prisma.userMembership.findUnique({ where: { id }, include: { user: { select: { id: true, email: true } } } });
    if (!target) return NextResponse.json({ error: "Anggota tidak ditemukan" }, { status: 404 });
    const mine = await prisma.userMembership.findFirst({ where: { userId: access!.userId, companyId: target.companyId, isActive: true } });
    if (!mine) return NextResponse.json({ error: "No access" }, { status: 403 });
    if (target.userId === access!.userId) {
      return NextResponse.json({ error: "Untuk password Anda sendiri, pakai menu Akun dan password" }, { status: 400 });
    }

    const problem = passwordProblem(newPassword || "", target.user.email);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    await prisma.user.update({ where: { id: target.userId }, data: { password: await bcrypt.hash(newPassword!, 10) } });
    await prisma.auditLog.create({
      data: { userId: access!.userId, entityType: "Account", entityId: target.userId, action: "PASSWORD_RESET", description: `Password ${target.user.email} diatur ulang oleh admin` },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/memberships/[id]/password error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
