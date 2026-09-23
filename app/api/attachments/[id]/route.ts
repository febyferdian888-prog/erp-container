import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import type { Area } from "@/lib/rbac-shared";
import { assertReferenceAccess } from "@/lib/company-access";


const TYPE_AREA: Record<string, Area[]> = {
  RFQ: ["sales"], Quotation: ["sales"], SalesOrder: ["sales"], Delivery: ["sales"],
  Invoice: ["finance"], Payment: ["finance"],
  PurchaseRequest: ["purchasing"], PurchaseOrder: ["purchasing"], GoodsReceipt: ["purchasing"], PriceInquiry: ["purchasing"],
  Bill: ["finance", "purchasing"], Project: ["operational"], WorkOrder: ["operational"],
};

const INLINE_EXT = ["pdf", "png", "jpg", "jpeg", "webp"];

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const att = await prisma.attachment.findUnique({ where: { id } });
    if (!att || att.deletedAt || !att.data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    { const denied = await guard(TYPE_AREA[att.referenceType] || ["admin"], "view"); if (denied) return denied; }
    if (!(await assertReferenceAccess(prisma, session.user.id, att.referenceType, att.referenceId))) {
      return NextResponse.json({ error: "Document not found or inaccessible" }, { status: 404 });
    }

    const inline = INLINE_EXT.includes(att.fileType || "");
    return new NextResponse(new Uint8Array(att.data), {
      status: 200,
      headers: {
        "Content-Type": att.mimeType || "application/octet-stream",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(att.fileName)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=0",
      },
    });
  } catch (error) {
    console.error("GET /api/attachments/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const att = await prisma.attachment.findUnique({ where: { id }, select: { id: true, deletedAt: true, referenceType: true, referenceId: true } });
    if (!att || att.deletedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });
    { const denied = await guard(TYPE_AREA[att.referenceType] || ["admin"], "edit"); if (denied) return denied; }
    if (!(await assertReferenceAccess(prisma, session.user.id, att.referenceType, att.referenceId))) {
      return NextResponse.json({ error: "Document not found or inaccessible" }, { status: 404 });
    }

    await prisma.attachment.update({ where: { id }, data: { deletedAt: new Date() } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/attachments/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
