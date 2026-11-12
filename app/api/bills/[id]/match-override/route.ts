import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { userHasCompanyAccess } from "@/lib/company-access";
import { evaluateBillMatch } from "@/lib/three-way-match";

// Finance signs off on a vendor bill that does not match the PO / goods receipt, with a written reason.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    { const denied = await guard(["finance"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const { action, note } = await req.json();

    const bill = await prisma.bill.findFirst({ where: { id, deletedAt: null }, select: { id: true, companyId: true, status: true } });
    if (!bill || !(await userHasCompanyAccess(prisma, session.user.id, bill.companyId))) {
      return NextResponse.json({ error: "Tagihan tidak ditemukan" }, { status: 404 });
    }

    if (action === "approve") {
      const text = typeof note === "string" ? note.trim() : "";
      if (text.length < 5) return NextResponse.json({ error: "Isi alasan pengecualian (min. 5 karakter)" }, { status: 400 });
      if (bill.status === "draft" || bill.status === "cancelled") return NextResponse.json({ error: "Tagihan belum dicatat masuk" }, { status: 400 });
      const res = await evaluateBillMatch(prisma, id);
      if (!res || res.status === "matched" || res.status === "legacy") return NextResponse.json({ error: "Tagihan ini tidak butuh pengecualian" }, { status: 400 });
      await prisma.bill.update({
        where: { id },
        data: { matchStatus: res.status, matchNote: res.note.slice(0, 500), matchOverrideBy: session.user.email, matchOverrideAt: new Date(), matchOverrideNote: text.slice(0, 500) },
      });
      return NextResponse.json({ ok: true });
    }
    if (action === "revoke") {
      await prisma.bill.update({ where: { id }, data: { matchOverrideBy: null, matchOverrideAt: null, matchOverrideNote: null } });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Aksi tidak dikenal" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/bills/[id]/match-override error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
