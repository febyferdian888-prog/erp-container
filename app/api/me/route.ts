import { NextResponse } from "next/server";
import { getAccess } from "@/lib/rbac";

export async function GET() {
  try {
    const access = await getAccess();
    if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({
      id: access.userId,
      email: access.email,
      name: access.name,
      roles: access.roles,
      perms: access.perms,
    });
  } catch (error) {
    console.error("GET /api/me error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
