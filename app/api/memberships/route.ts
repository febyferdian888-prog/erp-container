import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { guard, getAccess } from "@/lib/rbac";
import { passwordProblem } from "@/lib/password";

export async function GET() {
  try {
    { const denied = await guard(["admin"], "view"); if (denied) return denied; }
    const access = await getAccess();
    const mine = await prisma.userMembership.findMany({ where: { userId: access!.userId, isActive: true }, select: { companyId: true } });
    const companyIds = mine.map((m) => m.companyId);

    const memberships = await prisma.userMembership.findMany({
      where: { companyId: { in: companyIds } },
      include: {
        user: { select: { id: true, name: true, email: true, isActive: true, lastLogin: true } },
        role: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(memberships);
  } catch (error) {
    console.error("GET /api/memberships error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Adds a person to the company. A brand-new user gets the initial password typed by the admin.
export async function POST(req: NextRequest) {
  try {
    { const denied = await guard(["admin"], "edit"); if (denied) return denied; }
    const access = await getAccess();
    const { email, name, password, roleId } = (await req.json()) as { email?: string; name?: string; password?: string; roleId?: string };

    const cleanEmail = (email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return NextResponse.json({ error: "Email tidak valid" }, { status: 400 });
    const role = roleId ? await prisma.role.findUnique({ where: { id: roleId } }) : null;
    if (!role) return NextResponse.json({ error: "Pilih peran" }, { status: 400 });

    const mine = await prisma.userMembership.findFirst({ where: { userId: access!.userId, isActive: true } });
    if (!mine) return NextResponse.json({ error: "No access" }, { status: 403 });

    let user = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (!user) {
      const problem = passwordProblem(password || "", cleanEmail);
      if (problem) return NextResponse.json({ error: `Password awal: ${problem.charAt(0).toLowerCase()}${problem.slice(1)}` }, { status: 400 });
      if (!name?.trim()) return NextResponse.json({ error: "Nama wajib diisi untuk pengguna baru" }, { status: 400 });
      user = await prisma.user.create({
        data: { email: cleanEmail, name: name.trim(), password: await bcrypt.hash(password as string, 10) },
      });
    }

    const exists = await prisma.userMembership.findFirst({ where: { userId: user.id, companyId: mine.companyId } });
    if (exists) return NextResponse.json({ error: "Pengguna ini sudah menjadi anggota. Ubah perannya dari daftar." }, { status: 400 });

    const membership = await prisma.userMembership.create({
      data: { userId: user.id, companyId: mine.companyId, roleId: role.id },
      include: {
        user: { select: { id: true, name: true, email: true, isActive: true, lastLogin: true } },
        role: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(membership, { status: 201 });
  } catch (error) {
    console.error("POST /api/memberships error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
