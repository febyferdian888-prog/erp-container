import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { ensureRoles, guard } from "@/lib/rbac";
import { ROLES } from "@/lib/rbac-shared";

export async function GET() {
  try {
    { const denied = await guard(["admin"], "view"); if (denied) return denied; }
    await ensureRoles();
    const rows = await prisma.role.findMany({ select: { id: true, name: true } });
    const roles = ROLES.map((def) => {
      const row = rows.find((r) => r.name.toLowerCase() === def.name.toLowerCase());
      return row ? { id: row.id, name: row.name, description: def.description, perms: def.perms } : null;
    }).filter(Boolean);
    return NextResponse.json(roles);
  } catch (error) {
    console.error("GET /api/roles error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
