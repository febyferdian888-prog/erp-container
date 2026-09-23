import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { getAccess } from "@/lib/rbac";
import { can } from "@/lib/rbac-shared";
import { buildWorkbook, DATASETS, datasetByKey, type Sheet } from "@/lib/export";

export const maxDuration = 60;

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(req: NextRequest) {
  try {
    const access = await getAccess();
    if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const memberships = await prisma.userMembership.findMany({ where: { userId: access.userId, isActive: true }, select: { companyId: true } });
    const companyIds = memberships.map((m) => m.companyId);
    const isAdmin = can(access.perms, ["admin"], "view");
    const url = new URL(req.url);

    // ---- list what this person may export
    if (url.searchParams.get("list")) {
      const last = isAdmin
        ? await prisma.auditLog.findFirst({ where: { entityType: "Export", entityId: "all" }, orderBy: { createdAt: "desc" }, include: { user: { select: { name: true, email: true } } } })
        : null;
      return NextResponse.json({
        canBackup: isAdmin,
        lastBackup: last ? { at: last.createdAt, by: last.user ? last.user.name || last.user.email : "Sistem" } : null,
        datasets: DATASETS.filter((d) => can(access.perms, [d.area], "view")).map((d) => ({ key: d.key, label: d.label, group: d.group, dated: d.dated })),
      });
    }

    const key = url.searchParams.get("dataset") || "";
    const from = url.searchParams.get("from") ? new Date(url.searchParams.get("from")!) : undefined;
    const toRaw = url.searchParams.get("to") ? new Date(url.searchParams.get("to")!) : undefined;
    const ctx = { companyIds, from, to: toRaw ? new Date(toRaw.getTime() + 86400000) : undefined };
    if ((from && isNaN(from.getTime())) || (toRaw && isNaN(toRaw.getTime()))) {
      return NextResponse.json({ error: "Tanggal tidak valid" }, { status: 400 });
    }

    const stamp = new Date().toISOString().slice(0, 10);
    let sheets: Sheet[] = [];
    let title = "";
    let filename = "";

    if (key === "all") {
      if (!isAdmin) return NextResponse.json({ error: "Hanya Owner atau Admin yang dapat membuat backup lengkap" }, { status: 403 });
      for (const d of DATASETS) sheets.push(...(await d.load({ companyIds })));
      title = "Backup lengkap semua data";
      filename = `erp-mda-backup-${stamp}.xlsx`;
    } else {
      const d = datasetByKey(key);
      if (!d) return NextResponse.json({ error: "Data tidak dikenal" }, { status: 400 });
      if (!can(access.perms, [d.area], "view")) return NextResponse.json({ error: "Peran Anda tidak boleh mengekspor data ini" }, { status: 403 });
      sheets = await d.load(ctx);
      title = `Ekspor ${d.label}${from || toRaw ? ` (${url.searchParams.get("from") || "awal"} s.d. ${url.searchParams.get("to") || "sekarang"})` : ""}`;
      filename = `erp-mda-${d.key}-${stamp}.xlsx`;
    }

    const buffer = buildWorkbook(sheets, {
      title,
      by: access.name || access.email,
      note: key === "all" ? "Berisi data bisnis saja. Isi file lampiran dan password pengguna tidak ikut diekspor." : undefined,
    });

    await prisma.auditLog.create({
      data: {
        userId: access.userId,
        entityType: "Export",
        entityId: key,
        action: "EXPORT",
        description: `${title} · ${sheets.reduce((s, x) => s + x.rows.length, 0)} baris`,
      },
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": XLSX_MIME,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("GET /api/export error:", error);
    return NextResponse.json({ error: "Gagal membuat file ekspor" }, { status: 500 });
  }
}
