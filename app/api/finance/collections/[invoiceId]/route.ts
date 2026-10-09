import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { assertReferenceAccess } from "@/lib/company-access";

const FOLLOW_UP_TYPES = ["follow_up", "payment_promise", "obstacle"];

// Full follow-up history + current PIC for one invoice (used by the workbench's expandable row).
export async function GET(req: NextRequest, { params }: { params: Promise<{ invoiceId: string }> }) {
  try {
    { const denied = await guard(["finance"], "view"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { invoiceId } = await params;

    if (!(await assertReferenceAccess(prisma, session.user.id, "Invoice", invoiceId))) {
      return NextResponse.json({ error: "Invoice tidak ditemukan" }, { status: 404 });
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { collectionsPic: true, followUps: { orderBy: { createdAt: "desc" } } },
    });
    if (!invoice) return NextResponse.json({ error: "Invoice tidak ditemukan" }, { status: 404 });

    return NextResponse.json({
      collectionsPic: invoice.collectionsPic,
      followUps: invoice.followUps.map((f) => ({
        id: f.id, type: f.type, note: f.note, promiseDate: f.promiseDate,
        promiseAmount: f.promiseAmount ? Number(f.promiseAmount) : null,
        nextFollowUpAt: f.nextFollowUpAt, createdBy: f.createdBy, createdAt: f.createdAt,
      })),
    });
  } catch (error) {
    console.error("GET /api/finance/collections/[invoiceId] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Assign/reassign the internal collections PIC. A separate, narrow endpoint —
// deliberately not folded into the big invoice edit form (see Tahap 1: that
// form already does too much and once caused a status bug).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ invoiceId: string }> }) {
  try {
    { const denied = await guard(["finance"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { invoiceId } = await params;

    if (!(await assertReferenceAccess(prisma, session.user.id, "Invoice", invoiceId))) {
      return NextResponse.json({ error: "Invoice tidak ditemukan" }, { status: 404 });
    }

    const body = await req.json();
    const collectionsPic = typeof body.collectionsPic === "string" ? body.collectionsPic.trim() || null : undefined;
    if (collectionsPic === undefined) return NextResponse.json({ error: "collectionsPic wajib diisi" }, { status: 400 });

    const updated = await prisma.invoice.update({ where: { id: invoiceId }, data: { collectionsPic }, select: { id: true, collectionsPic: true } });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH /api/finance/collections/[invoiceId] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Add one entry to the collections history: a follow-up note, a payment
// promise (date + amount), or a logged obstacle. Append-only by design.
export async function POST(req: NextRequest, { params }: { params: Promise<{ invoiceId: string }> }) {
  try {
    { const denied = await guard(["finance"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { invoiceId } = await params;

    if (!(await assertReferenceAccess(prisma, session.user.id, "Invoice", invoiceId))) {
      return NextResponse.json({ error: "Invoice tidak ditemukan" }, { status: 404 });
    }

    const body = await req.json();
    const type = FOLLOW_UP_TYPES.includes(body.type) ? body.type : null;
    if (!type) return NextResponse.json({ error: "Jenis catatan tidak valid" }, { status: 400 });
    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (!note) return NextResponse.json({ error: "Catatan tidak boleh kosong" }, { status: 400 });

    const created = await prisma.invoiceFollowUp.create({
      data: {
        invoiceId,
        type,
        note,
        promiseDate: body.promiseDate ? new Date(body.promiseDate) : null,
        promiseAmount: body.promiseAmount !== undefined && body.promiseAmount !== null && body.promiseAmount !== "" ? Number(body.promiseAmount) : null,
        nextFollowUpAt: body.nextFollowUpAt ? new Date(body.nextFollowUpAt) : null,
        createdBy: session.user.email,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("POST /api/finance/collections/[invoiceId] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
