import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { getAccess, guard } from "@/lib/rbac";
import { TYPE_INFO, type ImportOptions, type ImportType, type MasterRow } from "@/lib/master-import";
import { previewMaster } from "@/lib/master-import-server";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { type: ImportType; rows: MasterRow[]; options?: Partial<ImportOptions> };
    if (!TYPE_INFO[body.type]) return NextResponse.json({ error: "Jenis impor tidak dikenal" }, { status: 400 });
    { const denied = await guard(TYPE_INFO[body.type].areas, "edit"); if (denied) return denied; }
    if (!Array.isArray(body.rows) || body.rows.length === 0) return NextResponse.json({ error: "Tidak ada baris untuk diperiksa" }, { status: 400 });
    if (body.rows.length > 5000) return NextResponse.json({ error: "Maksimal 5.000 baris per unggahan" }, { status: 400 });

    const access = await getAccess();
    const member = await prisma.userMembership.findFirst({ where: { userId: access!.userId, isActive: true } });
    if (!member) return NextResponse.json({ error: "No access" }, { status: 403 });

    const options: ImportOptions = { updateExisting: body.options?.updateExisting !== false, stockMode: body.options?.stockMode === "add" ? "add" : "set" };
    const preview = await previewMaster(body.type, body.rows, options, { companyId: member.companyId, email: access!.email, batchId: "preview" });
    return NextResponse.json(preview);
  } catch (error) {
    console.error("POST /api/imports/master/preview error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
