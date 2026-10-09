import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { userHasCompanyAccess } from "@/lib/company-access";

// Hutang kirim: part of an order is owed to the customer (e.g. stock was short by a piece) while
// the rest was delivered and invoiced in full. Marking it moves the order out of "belum dikirim"
// into its own list; it stays tracked until the remaining quantity is delivered.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    { const denied = await guard(["sales"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const { action, note } = await req.json();

    const so = await prisma.salesOrder.findFirst({ where: { id, deletedAt: null }, select: { companyId: true, status: true } });
    if (!so || !(await userHasCompanyAccess(prisma, session.user.id, so.companyId))) {
      return NextResponse.json({ error: "Sales order not found" }, { status: 404 });
    }
    if (so.status === "cancelled") return NextResponse.json({ error: "SO sudah dibatalkan" }, { status: 400 });

    if (action === "acknowledge") {
      const text = typeof note === "string" ? note.trim() : "";
      if (!text) return NextResponse.json({ error: "Isi alasan hutang kirim (mis. stok kurang 1 pcs)" }, { status: 400 });
      await prisma.salesOrder.update({ where: { id }, data: { deliveryDebtAt: new Date(), deliveryDebtNote: text } });
      return NextResponse.json({ ok: true });
    }
    if (action === "clear") {
      await prisma.salesOrder.update({ where: { id }, data: { deliveryDebtAt: null, deliveryDebtNote: null } });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Aksi tidak dikenal" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/sales-orders/[id]/delivery-debt error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
