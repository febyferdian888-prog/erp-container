import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { computeInvoiceMoney } from "@/lib/invoice-money";

async function actor() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { memberships: { where: { isActive: true } } },
  });
  return user?.memberships.length ? user : null;
}

export async function GET(req: NextRequest) {
  try {
    { const denied = await guard(["sales", "finance"], "view"); if (denied) return denied; }
    const user = await actor();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const invoiceId = url.searchParams.get("invoiceId");
    const status = url.searchParams.get("status");

    const rows = await prisma.paymentReport.findMany({
      where: {
        companyId: { in: user.memberships.map((m) => m.companyId) },
        ...(invoiceId ? { invoiceId } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        invoice: { select: { invoiceNumber: true, grandTotal: true, paidAmount: true, customer: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const userIds = [...new Set(rows.flatMap((r) => [r.reportedBy, r.reviewedBy]).filter((v): v is string => !!v))];
    const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } });
    const nameOf = (id: string | null) => {
      const u = users.find((x) => x.id === id);
      return u ? u.name || u.email : null;
    };

    return NextResponse.json(
      rows.map((r) => ({
        id: r.id,
        invoiceId: r.invoiceId,
        invoiceNumber: r.invoice.invoiceNumber,
        customerName: r.invoice.customer.name,
        amount: Number(r.amount),
        paidDate: r.paidDate,
        method: r.method,
        notes: r.notes,
        status: r.status,
        reviewNotes: r.reviewNotes,
        reportedByName: nameOf(r.reportedBy),
        reviewedByName: nameOf(r.reviewedBy),
        createdAt: r.createdAt,
      }))
    );
  } catch (error) {
    console.error("GET /api/payment-reports error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    { const denied = await guard(["sales", "finance"], "edit"); if (denied) return denied; }
    const user = await actor();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { invoiceId, amount, paidDate, method, notes } = await req.json();
    const value = Number(amount);
    if (!invoiceId || !(value > 0) || !paidDate) {
      return NextResponse.json({ error: "invoiceId, amount, dan paidDate wajib diisi" }, { status: 400 });
    }

    const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, deletedAt: null } });
    if (!invoice || !user.memberships.some((m) => m.companyId === invoice.companyId)) {
      return NextResponse.json({ error: "Invoice tidak ditemukan" }, { status: 404 });
    }
    if (invoice.status === "cancelled") {
      return NextResponse.json({ error: "Invoice sudah dibatalkan" }, { status: 400 });
    }
    const money = computeInvoiceMoney(invoice);
    if (value > money.balanceDue + 0.5) {
      return NextResponse.json({ error: "Nominal melebihi sisa tagihan invoice" }, { status: 400 });
    }

    const report = await prisma.paymentReport.create({
      data: {
        companyId: invoice.companyId,
        invoiceId,
        amount: value,
        paidDate: new Date(paidDate),
        method: method || "transfer",
        notes: notes || null,
        reportedBy: user.id,
      },
    });
    return NextResponse.json(report, { status: 201 });
  } catch (error) {
    console.error("POST /api/payment-reports error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
