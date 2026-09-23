import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { getAccess, guard } from "@/lib/rbac";
import { TYPE_INFO, type ImportOptions, type ImportType, type MasterRow } from "@/lib/master-import";
import { applyMaster } from "@/lib/master-import-server";
import { withoutRowAudit } from "@/lib/audit-context";

export const maxDuration = 60;

// Two calls: { rows } saves one chunk, { summary } writes the single audit entry for the whole import.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      type: ImportType;
      rows?: MasterRow[];
      options?: Partial<ImportOptions>;
      batchId?: string;
      summary?: { created: number; updated: number; stockRows: number; skipped: number; errors: number; fileName?: string };
    };
    if (!TYPE_INFO[body.type]) return NextResponse.json({ error: "Jenis impor tidak dikenal" }, { status: 400 });
    { const denied = await guard(TYPE_INFO[body.type].areas, "edit"); if (denied) return denied; }

    const access = await getAccess();
    const member = await prisma.userMembership.findFirst({ where: { userId: access!.userId, isActive: true } });
    if (!member) return NextResponse.json({ error: "No access" }, { status: 403 });

    if (body.summary) {
      const s = body.summary;
      await prisma.auditLog.create({
        data: {
          userId: access!.userId,
          entityType: "Import",
          entityId: body.type,
          action: "IMPORT",
          description: `Impor ${TYPE_INFO[body.type].label}${s.fileName ? ` dari ${s.fileName}` : ""}: ${s.created} baru, ${s.updated} diperbarui${s.stockRows ? `, ${s.stockRows} baris stok` : ""}, ${s.skipped} dilewati, ${s.errors} gagal`,
        },
      });
      return NextResponse.json({ ok: true });
    }

    if (!Array.isArray(body.rows) || body.rows.length === 0) return NextResponse.json({ error: "Tidak ada baris" }, { status: 400 });
    if (body.rows.length > 200) return NextResponse.json({ error: "Maksimal 200 baris per permintaan" }, { status: 400 });

    const options: ImportOptions = { updateExisting: body.options?.updateExisting !== false, stockMode: body.options?.stockMode === "add" ? "add" : "set" };
    const result = await withoutRowAudit(() =>
      applyMaster(body.type, body.rows!, options, { companyId: member.companyId, email: access!.email, batchId: body.batchId || `import-${Date.now()}` })
    );
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/imports/master/commit error:", error);
    return NextResponse.json({ error: "Gagal menyimpan. Data yang sudah masuk tidak akan ganda bila diunggah ulang." }, { status: 500 });
  }
}
