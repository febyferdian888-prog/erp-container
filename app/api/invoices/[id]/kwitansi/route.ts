import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { renderInvoiceKwitansi } from "@/lib/invoice-kwitansi";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    { const denied = await guard(["finance", "sales"], "view"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;

    const invoice = await prisma.invoice.findUnique({ where: { id }, select: { companyId: true } });
    if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const membership = await prisma.userMembership.findFirst({
      where: { userId: session.user.id, companyId: invoice.companyId, isActive: true },
    });
    if (!membership) return NextResponse.json({ error: "No access" }, { status: 403 });

    const out = await renderInvoiceKwitansi(prisma, id);
    if (!out) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return new NextResponse(new Uint8Array(out.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${out.number}.pdf"`,
      },
    });
  } catch (error) {
    console.error("GET /api/invoices/[id]/kwitansi error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
