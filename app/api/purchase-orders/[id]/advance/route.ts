import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { userHasCompanyAccess } from "@/lib/company-access";
import { ApprovalRequiredError, assertReleaseAllowed } from "@/lib/approval";
import { ensureAutoGoodsReceipt } from "@/lib/goods-receipt";
import { loadPoStages } from "@/lib/po-workflow";
import { formatDocumentNumber, currentYearRange } from "@/lib/document-number";

const r2 = (n: number) => Math.round(n * 100) / 100;

// One-click next steps for a PO: send to vendor, record vendor confirmation, and raise the
// down-payment bill that Finance pays before the vendor starts work.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    { const denied = await guard(["purchasing"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const { action } = await req.json();

    const po = await prisma.purchaseOrder.findFirst({
      where: { id, deletedAt: null },
      include: { items: true, sources: { select: { soId: true } }, supplier: { select: { name: true } } },
    });
    if (!po || !(await userHasCompanyAccess(prisma, session.user.id, po.companyId))) {
      return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });
    }

    const subtotal = po.items.reduce((s, i) => s + Number(i.subtotal), 0);
    const stage = (await loadPoStages(prisma, [id]))[id];

    if (action === "send") {
      if (po.status !== "draft") return NextResponse.json({ error: "PO ini sudah dikirim" }, { status: 400 });
      try {
        await assertReleaseAllowed(prisma, "PurchaseOrder", id, subtotal, po.status, "sent");
      } catch (e) {
        if (e instanceof ApprovalRequiredError) return NextResponse.json({ error: e.message, code: "APPROVAL_REQUIRED" }, { status: 400 });
        throw e;
      }
      await prisma.$transaction(async (tx) => {
        await tx.purchaseOrder.update({ where: { id }, data: { status: "sent" } });
        await ensureAutoGoodsReceipt(tx, id, session.user!.email!);
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "confirm") {
      if (po.status !== "sent") return NextResponse.json({ error: "PO harus berstatus terkirim untuk dikonfirmasi" }, { status: 400 });
      if (Number(po.dpPercent) > 0 && !(stage.dpBill && stage.dpBill.status !== "draft" && stage.dpBill.paidAmount + 0.5 >= stage.dpBill.grandTotal)) {
        return NextResponse.json({ error: "DP belum dibayar Finance. Buat tagihan DP dan tunggu pembayarannya dulu." }, { status: 400 });
      }
      await prisma.$transaction(async (tx) => {
        await tx.purchaseOrder.update({ where: { id }, data: { status: "confirmed" } });
        await ensureAutoGoodsReceipt(tx, id, session.user!.email!);
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "dp_bill") {
      const dpPercent = Number(po.dpPercent);
      if (!["sent", "confirmed"].includes(po.status)) return NextResponse.json({ error: "Kirim PO ke vendor dulu sebelum meminta DP" }, { status: 400 });
      if (dpPercent <= 0) return NextResponse.json({ error: "PO ini tidak punya DP. Isi persentase DP di form PO." }, { status: 400 });
      if (stage.dpBill) return NextResponse.json({ error: `Tagihan DP sudah ada: ${stage.dpBill.billNumber}` }, { status: 400 });

      const totalAmount = r2((subtotal * dpPercent) / 100);
      const ppn = Number(po.ppnPercent);
      const taxAmount = r2((totalAmount * ppn) / 100);
      const { year, start, end } = currentYearRange();
      const count = await prisma.bill.count({ where: { companyId: po.companyId, createdAt: { gte: start, lt: end } } });
      const today = new Date();
      const due = new Date(today.getTime() + 3 * 86400000);

      const bill = await prisma.bill.create({
        data: {
          companyId: po.companyId,
          supplierId: po.supplierId,
          poId: po.id,
          soId: po.soId || po.sources[0]?.soId || null,
          billKind: "down_payment",
          status: "draft",
          billNumber: formatDocumentNumber("BILL", year, count + 1),
          billDate: today,
          dueDate: due,
          paymentTerms: "DP",
          ppnPercent: ppn,
          totalAmount,
          taxAmount,
          grandTotal: r2(totalAmount + taxAmount),
          notes: `Uang muka (DP) ${dpPercent}% untuk ${po.poNumber} — ${po.supplier?.name ?? ""}. Menunggu tagihan/proforma DP dari vendor: Purchasing mengunggah PDF dan menandainya masuk agar Finance bisa membayar. Tagihan akhir nanti hanya sisa setelah DP.`,
          createdBy: session.user.email,
          items: {
            create: [
              {
                lineNumber: 1,
                description: `Uang muka (DP) ${dpPercent}% ${po.poNumber}`,
                quantity: 1,
                unit: "lot",
                unitPrice: totalAmount,
                subtotal: totalAmount,
                soId: po.soId || po.sources[0]?.soId || null,
              },
            ],
          },
        },
      });
      return NextResponse.json({ ok: true, billId: bill.id, billNumber: bill.billNumber });
    }

    return NextResponse.json({ error: "Aksi tidak dikenal" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/purchase-orders/[id]/advance error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    { const denied = await guard(["purchasing"], "view"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const po = await prisma.purchaseOrder.findFirst({ where: { id, deletedAt: null }, select: { companyId: true } });
    if (!po || !(await userHasCompanyAccess(prisma, session.user.id, po.companyId))) {
      return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });
    }
    return NextResponse.json((await loadPoStages(prisma, [id]))[id]);
  } catch (error) {
    console.error("GET /api/purchase-orders/[id]/advance error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
