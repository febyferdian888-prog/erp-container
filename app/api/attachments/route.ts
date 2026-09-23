import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import type { Area } from "@/lib/rbac-shared";
import { assertReferenceAccess } from "@/lib/company-access";

export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

const REFERENCE_TYPES = [
  "RFQ", "Quotation", "SalesOrder", "Delivery", "Invoice", "Payment",
  "PurchaseRequest", "PurchaseOrder", "GoodsReceipt", "PriceInquiry", "Bill", "Project", "WorkOrder",
];

const ALLOWED_EXT = ["pdf", "png", "jpg", "jpeg", "webp", "doc", "docx", "xls", "xlsx", "csv", "txt", "zip"];


const TYPE_AREA: Record<string, Area[]> = {
  RFQ: ["sales"], Quotation: ["sales"], SalesOrder: ["sales"], Delivery: ["sales"],
  Invoice: ["finance"], Payment: ["finance"],
  PurchaseRequest: ["purchasing"], PurchaseOrder: ["purchasing"], GoodsReceipt: ["purchasing"], PriceInquiry: ["purchasing"],
  Bill: ["finance", "purchasing"], Project: ["operational"], WorkOrder: ["operational"],
};

async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({ where: { email: session.user.email }, include: { memberships: true } });
  return user?.memberships.length ? user : null;
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const url = new URL(req.url);
    const referenceType = url.searchParams.get("referenceType");
    const referenceId = url.searchParams.get("referenceId");
    { const denied = await guard(TYPE_AREA[referenceType || ""] || ["admin"], "view"); if (denied) return denied; }
    if (!referenceType || !referenceId) {
      return NextResponse.json({ error: "referenceType and referenceId are required" }, { status: 400 });
    }
    if (!(await assertReferenceAccess(prisma, user.id, referenceType, referenceId))) {
      return NextResponse.json({ error: "Document not found or inaccessible" }, { status: 404 });
    }
    const rows = await prisma.attachment.findMany({
      where: { referenceType, referenceId, deletedAt: null },
      orderBy: { uploadedAt: "desc" },
      select: { id: true, fileName: true, fileSize: true, fileType: true, mimeType: true, uploadedAt: true, uploadedBy: true },
    });
    const ids = [...new Set(rows.map((r) => r.uploadedBy).filter(Boolean) as string[])];
    const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } });
    return NextResponse.json(
      rows.map((r) => {
        const u = users.find((x) => x.id === r.uploadedBy);
        return { ...r, uploadedByName: u ? u.name || u.email : null };
      })
    );
  } catch (error) {
    console.error("GET /api/attachments error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const form = await req.formData();
    const referenceType = String(form.get("referenceType") || "");
    const referenceId = String(form.get("referenceId") || "");
    const file = form.get("file");

    { const denied = await guard(TYPE_AREA[referenceType] || ["admin"], "edit"); if (denied) return denied; }
    if (!REFERENCE_TYPES.includes(referenceType) || !referenceId) {
      return NextResponse.json({ error: "Invalid document reference" }, { status: 400 });
    }
    if (!(await assertReferenceAccess(prisma, user.id, referenceType, referenceId))) {
      return NextResponse.json({ error: "Document not found or inaccessible" }, { status: 404 });
    }
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Pilih file terlebih dahulu" }, { status: 400 });
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      return NextResponse.json({ error: "Ukuran file maksimal 4 MB" }, { status: 400 });
    }
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      return NextResponse.json({ error: `Jenis file .${ext} tidak diizinkan` }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const created = await prisma.attachment.create({
      data: {
        referenceType,
        referenceId,
        fileName: file.name,
        fileSize: file.size,
        fileType: ext,
        mimeType: file.type || null,
        uploadedBy: user.id,
        data: buffer,
      },
      select: { id: true, fileName: true, fileSize: true, fileType: true, uploadedAt: true },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("POST /api/attachments error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
