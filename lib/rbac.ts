import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { prisma } from "./db";
import { can, permissionsFor, ROLES, type Area, type Permissions } from "./rbac-shared";

export { ROLES } from "./rbac-shared";

interface Access {
  userId: string;
  email: string;
  name: string | null;
  roles: string[];
  perms: Permissions;
}

const cache = new Map<string, { at: number; access: Access }>();
const TTL_MS = 15000;

export function clearAccessCache() {
  cache.clear();
}

export async function getAccess(): Promise<Access | null> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return null;

  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.access;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, email: true, name: true, isActive: true,
      memberships: { where: { isActive: true }, select: { role: { select: { name: true } } } },
    },
  });
  if (!user || !user.isActive || user.memberships.length === 0) return null;

  const roles = [...new Set(user.memberships.map((m) => m.role.name))];
  const access: Access = { userId: user.id, email: user.email, name: user.name, roles, perms: permissionsFor(roles) };
  cache.set(userId, { at: Date.now(), access });
  return access;
}

// Selling prices and order values belong to sales and finance; purchasing sees what to buy, not what it sells for.
export async function canSeeSalesPrices() {
  const access = await getAccess();
  return !!access && can(access.perms, ["sales", "finance", "reports"], "view");
}

// Returns a response to send back when the request is not allowed, otherwise null.
export async function guard(areas: Area[] | "any", level: "view" | "edit") {
  const access = await getAccess();
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(access.perms, areas, level)) {
    return NextResponse.json(
      { error: level === "edit" ? "Peran Anda tidak boleh mengubah data ini" : "Peran Anda tidak boleh mengakses data ini" },
      { status: 403 }
    );
  }
  return null;
}

export async function ensureRoles() {
  const existing = await prisma.role.findMany({ select: { name: true } });
  const have = new Set(existing.map((r) => r.name.toLowerCase()));
  for (const r of ROLES) {
    if (!have.has(r.name.toLowerCase())) {
      await prisma.role.create({ data: { name: r.name, description: r.description, isSystem: true } });
    }
  }
}
