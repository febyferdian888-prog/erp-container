import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { userHasCompanyAccess } from "@/lib/company-access";

// Narrow endpoint for the pipeline-only fields on a Quotation, kept separate
// from the quotation edit form/API (same reasoning as Tahap 2's collections
// PATCH: a big shared edit endpoint is exactly what caused the Tahap 1 bug).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    { const denied = await guard(["sales"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;

    const quotation = await prisma.quotation.findUnique({ where: { id }, select: { companyId: true } });
    if (!quotation || !(await userHasCompanyAccess(prisma, session.user.id, quotation.companyId))) {
      return NextResponse.json({ error: "Quotation tidak ditemukan" }, { status: 404 });
    }

    const body = await req.json();
    const data: Record<string, unknown> = {};
    if ("salesPic" in body) data.salesPic = typeof body.salesPic === "string" ? body.salesPic.trim() || null : null;
    if ("probability" in body) {
      const p = body.probability === null || body.probability === "" ? null : Number(body.probability);
      if (p !== null && (!Number.isFinite(p) || p < 0 || p > 100)) return NextResponse.json({ error: "Probabilitas harus 0-100" }, { status: 400 });
      data.probability = p;
    }
    if ("targetCloseDate" in body) data.targetCloseDate = body.targetCloseDate ? new Date(body.targetCloseDate) : null;
    if ("nextFollowUpAt" in body) data.nextFollowUpAt = body.nextFollowUpAt ? new Date(body.nextFollowUpAt) : null;
    if ("winLossReason" in body) data.winLossReason = typeof body.winLossReason === "string" ? body.winLossReason.trim() || null : null;
    if ("estimatedMarginPercent" in body) {
      const m = body.estimatedMarginPercent === null || body.estimatedMarginPercent === "" ? null : Number(body.estimatedMarginPercent);
      data.estimatedMarginPercent = m;
    }

    if (Object.keys(data).length === 0) return NextResponse.json({ error: "Tidak ada perubahan" }, { status: 400 });

    const updated = await prisma.quotation.update({ where: { id }, data, select: { id: true, salesPic: true, probability: true, targetCloseDate: true, nextFollowUpAt: true, winLossReason: true, estimatedMarginPercent: true } });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH /api/sales/pipeline/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
