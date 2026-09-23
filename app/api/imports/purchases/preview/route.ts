import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { analyzePurchaseImport, type ImportOptions, type ImportRow } from "@/lib/purchase-import";
import { guard } from "@/lib/rbac";

export async function POST(req: NextRequest) {
  try {
    { const denied = await guard(["finance", "purchasing"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = await prisma.user.findUnique({ where: { email: session.user.email }, include: { memberships: true } });
    const companyId = user?.memberships[0]?.companyId;
    if (!companyId) return NextResponse.json({ error: "No company access" }, { status: 403 });

    const { rows, options } = (await req.json()) as { rows: ImportRow[]; options: ImportOptions };
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "Tidak ada baris untuk diperiksa" }, { status: 400 });
    }
    if (rows.length > 5000) {
      return NextResponse.json({ error: "Maksimal 5.000 baris per unggahan" }, { status: 400 });
    }
    const opt: ImportOptions = {
      defaultPpn: Number(options?.defaultPpn ?? 11),
      pricesIncludePpn: Boolean(options?.pricesIncludePpn),
      defaultDueDays: Number(options?.defaultDueDays ?? 30),
    };
    return NextResponse.json(await analyzePurchaseImport(companyId, rows, opt));
  } catch (error) {
    console.error("POST /api/imports/purchases/preview error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
