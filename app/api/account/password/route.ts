import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getAccess } from "@/lib/rbac";
import { clearAttempts, passwordProblem, recordFailedAttempt, tooManyAttempts } from "@/lib/password";

// Any signed-in user changes their own password; the current one must be typed again.
export async function POST(req: NextRequest) {
  try {
    const access = await getAccess();
    if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { currentPassword, newPassword } = (await req.json()) as { currentPassword?: string; newPassword?: string };
    if (!currentPassword || !newPassword) return NextResponse.json({ error: "Isi password lama dan password baru" }, { status: 400 });

    const key = `pw:${access.userId}`;
    if (tooManyAttempts(key)) {
      return NextResponse.json({ error: "Terlalu banyak percobaan salah. Coba lagi dalam 15 menit." }, { status: 429 });
    }

    const user = await prisma.user.findUnique({ where: { id: access.userId }, select: { id: true, email: true, password: true } });
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!(await bcrypt.compare(currentPassword, user.password))) {
      recordFailedAttempt(key);
      return NextResponse.json({ error: "Password lama salah" }, { status: 400 });
    }
    clearAttempts(key);

    const problem = passwordProblem(newPassword, user.email);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    if (await bcrypt.compare(newPassword, user.password)) {
      return NextResponse.json({ error: "Password baru harus berbeda dari password lama" }, { status: 400 });
    }

    await prisma.user.update({ where: { id: user.id }, data: { password: await bcrypt.hash(newPassword, 10) } });
    await prisma.auditLog.create({
      data: { userId: user.id, entityType: "Account", entityId: user.id, action: "PASSWORD_CHANGE", description: `${user.email} mengganti passwordnya sendiri` },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/account/password error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
