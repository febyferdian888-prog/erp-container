import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { guard, getAccess, clearAccessCache } from "@/lib/rbac";
import { permissionsFor } from "@/lib/rbac-shared";

const isAdminRole = (name: string) => permissionsFor([name]).admin === "edit";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    { const denied = await guard(["admin"], "edit"); if (denied) return denied; }
    const access = await getAccess();
    const { id } = await params;
    const { isActive, roleId, name, email } = (await req.json()) as { isActive?: boolean; roleId?: string; name?: string; email?: string };

    const target = await prisma.userMembership.findUnique({ where: { id }, include: { role: true, user: true } });
    if (!target) return NextResponse.json({ error: "Anggota tidak ditemukan" }, { status: 404 });
    const mine = await prisma.userMembership.findFirst({ where: { userId: access!.userId, companyId: target.companyId, isActive: true } });
    if (!mine) return NextResponse.json({ error: "No access" }, { status: 403 });

    if (name !== undefined || email !== undefined) {
      const userData: { name?: string; email?: string } = {};
      if (name !== undefined) {
        if (!name.trim()) return NextResponse.json({ error: "Nama tidak boleh kosong" }, { status: 400 });
        userData.name = name.trim();
      }
      if (email !== undefined) {
        const cleanEmail = email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return NextResponse.json({ error: "Email tidak valid" }, { status: 400 });
        if (cleanEmail !== target.user.email) {
          const taken = await prisma.user.findUnique({ where: { email: cleanEmail } });
          if (taken) return NextResponse.json({ error: "Email ini sudah dipakai pengguna lain" }, { status: 400 });
          userData.email = cleanEmail;
        }
      }
      if (Object.keys(userData).length) await prisma.user.update({ where: { id: target.userId }, data: userData });
    }

    let newRole = target.role;
    if (roleId && roleId !== target.roleId) {
      const role = await prisma.role.findUnique({ where: { id: roleId } });
      if (!role) return NextResponse.json({ error: "Peran tidak ditemukan" }, { status: 400 });
      newRole = role;
    }
    const newActive = isActive ?? target.isActive;

    // never leave the company without someone who can manage the team
    const losesAdmin = isAdminRole(target.role.name) && target.isActive && (!newActive || !isAdminRole(newRole.name));
    if (losesAdmin) {
      const others = await prisma.userMembership.findMany({
        where: { companyId: target.companyId, isActive: true, id: { not: id } },
        include: { role: true },
      });
      if (!others.some((m) => isAdminRole(m.role.name))) {
        return NextResponse.json({ error: "Harus tersisa minimal satu Owner atau Admin aktif" }, { status: 400 });
      }
    }

    const membership = await prisma.userMembership.update({
      where: { id },
      data: { isActive: newActive, roleId: newRole.id },
      include: {
        user: { select: { id: true, name: true, email: true, isActive: true, lastLogin: true } },
        role: { select: { id: true, name: true } },
      },
    });
    clearAccessCache();
    return NextResponse.json(membership);
  } catch (error) {
    console.error("PUT /api/memberships/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Removes a member from the company. If it was that user's only company, the
// user account itself is deleted too (undoes a mistyped-email add cleanly).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    { const denied = await guard(["admin"], "edit"); if (denied) return denied; }
    const access = await getAccess();
    const { id } = await params;

    const target = await prisma.userMembership.findUnique({ where: { id }, include: { role: true } });
    if (!target) return NextResponse.json({ error: "Anggota tidak ditemukan" }, { status: 404 });
    const mine = await prisma.userMembership.findFirst({ where: { userId: access!.userId, companyId: target.companyId, isActive: true } });
    if (!mine) return NextResponse.json({ error: "No access" }, { status: 403 });
    if (target.userId === access!.userId) return NextResponse.json({ error: "Tidak bisa menghapus diri sendiri" }, { status: 400 });

    if (isAdminRole(target.role.name) && target.isActive) {
      const others = await prisma.userMembership.findMany({
        where: { companyId: target.companyId, isActive: true, id: { not: id } },
        include: { role: true },
      });
      if (!others.some((m) => isAdminRole(m.role.name))) {
        return NextResponse.json({ error: "Harus tersisa minimal satu Owner atau Admin aktif" }, { status: 400 });
      }
    }

    await prisma.userMembership.delete({ where: { id } });
    const elsewhere = await prisma.userMembership.count({ where: { userId: target.userId } });
    if (elsewhere === 0) await prisma.user.delete({ where: { id: target.userId } });

    clearAccessCache();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/memberships/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
