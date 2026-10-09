import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { canDecideApprovals } from "@/lib/approval";
import { guard } from "@/lib/rbac";
import { entityCompanyId } from "@/lib/company-access";

export async function GET(req: NextRequest) {
  try {
    { const denied = await guard(["admin"], "view"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user || !(await canDecideApprovals(user.id))) {
      return NextResponse.json({ error: "Hanya Owner atau Admin yang dapat melihat audit log" }, { status: 403 });
    }

    const url = new URL(req.url);
    const entityType = url.searchParams.get("entityType");
    const action = url.searchParams.get("action");
    const q = url.searchParams.get("q");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const offset = Number(url.searchParams.get("offset") || 0);
    const limit = Math.min(Number(url.searchParams.get("limit") || 50), 200);

    const where = {
      ...(entityType ? { entityType } : {}),
      ...(action ? { action } : {}),
      ...(q ? { description: { contains: q, mode: "insensitive" as const } } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lt: new Date(new Date(to).getTime() + 86400000) } : {}),
            },
          }
        : {}),
    };

    const rows = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
      include: { user: { select: { name: true, email: true } } },
    });
    const companyIds = (await prisma.userMembership.findMany({
      where: { userId: user.id, isActive: true },
      select: { companyId: true },
    })).map((membership) => membership.companyId);
    const visibleRows = (await Promise.all(rows.map(async (row) => {
      const companyId = await entityCompanyId(prisma, row.entityType, row.entityId);
      return companyId && companyIds.includes(companyId) ? row : null;
    }))).filter((row): row is (typeof rows)[number] => row !== null);

    return NextResponse.json({
      total: visibleRows.length,
      rows: visibleRows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        // A resolved user wins; otherwise the row's own recorded actor (e.g. an
        // import script's createdBy email) beats a bare, untraceable "Sistem"
        // (Tahap 8 audit).
        user: r.user ? r.user.name || r.user.email : r.actorLabel ? `${r.actorLabel} (proses otomatis)` : "Sistem",
        entityType: r.entityType,
        entityId: r.entityId,
        action: r.action,
        description: r.description,
        oldValue: r.oldValue ? JSON.parse(r.oldValue) : null,
        newValue: r.newValue ? JSON.parse(r.newValue) : null,
      })),
    });
  } catch (error) {
    console.error("GET /api/audit-logs error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
