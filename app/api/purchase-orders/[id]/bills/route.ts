import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { userHasCompanyAccess } from "@/lib/company-access";
import { formatDocumentNumber, currentYearRange } from "@/lib/document-number";

const r2 = (n: number) => Math.round(n * 100) / 100;

async function loadPo(id: string, userId: string) {
  const po = await prisma.purchaseOrder.findFirst({
    where: { id, deletedAt: null },
    include: { items: true, sources: { select: { soId: true } }, supplier: { select: { name: true } } },
  });
  if (!po || !(await userHasCompanyAccess(prisma, userId, po.companyId))) return null;
  return po;
}

// Vendor bills for one PO (down payment and invoice). A bill starts as "draft" =
// waiting for the vendor's document; once purchasing uploads the PDF and marks it received
// it becomes payable for Finance.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    { const denied = await guard(["purchasing", "finance"], "view"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const po = await loadPo(id, session.user.id);
    if (!po) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });

    const bills = await prisma.bill.findMany({
      where: { poId: id, deletedAt: null, status: { not: "cancelled" } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true, billNumber: true, billKind: true, status: true, vendorInvoiceNumber: true, billDate: true, dueDate: true,
        totalAmount: true, ppnPercent: true, taxAmount: true, grandTotal: true, paidAmount: true, pphAmount: true,
      },
    });
    const subtotal = po.items.reduce((s, i) => s + Number(i.subtotal), 0);
    const dpTotal = bills.filter((b) => b.billKind === "down_payment").reduce((s, b) => s + Number(b.totalAmount), 0);
    return NextResponse.json({
      poNumber: po.poNumber,
      ppnPercent: Number(po.ppnPercent),
      poSubtotal: subtotal,
      suggestedInvoiceAmount: Math.max(r2(subtotal - dpTotal), 0),
      bills: bills.map((b) => ({
        ...b,
        totalAmount: Number(b.totalAmount), ppnPercent: Number(b.ppnPercent), taxAmount: Number(b.taxAmount),
        grandTotal: Number(b.grandTotal), paidAmount: Number(b.paidAmount), pphAmount: Number(b.pphAmount),
      })),
    });
  } catch (error) {
    console.error("GET /api/purchase-orders/[id]/bills error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    { const denied = await guard(["purchasing"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const po = await loadPo(id, session.user.id);
    if (!po) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });
    if (po.status === "draft" || po.status === "cancelled") {
      return NextResponse.json({ error: "Tagihan vendor dicatat setelah PO dikirim ke vendor" }, { status: 400 });
    }

    const body = await req.json();

    // Placeholder bill (draft) so a PDF can be attached to it before it is marked received.
    if (body.action === "create") {
      const kind = body.kind === "down_payment" ? "down_payment" : "regular";
      const subtotal = po.items.reduce((s, i) => s + Number(i.subtotal), 0);
      const existing = await prisma.bill.findMany({ where: { poId: id, deletedAt: null, status: { not: "cancelled" } }, select: { billKind: true, totalAmount: true } });
      if (kind === "down_payment" && existing.some((b) => b.billKind === "down_payment")) {
        return NextResponse.json({ error: "Tagihan DP untuk PO ini sudah ada" }, { status: 400 });
      }
      const dpTotal = existing.filter((b) => b.billKind === "down_payment").reduce((s, b) => s + Number(b.totalAmount), 0);
      const base = kind === "down_payment" ? (subtotal * Number(po.dpPercent)) / 100 : Math.max(subtotal - dpTotal, 0);
      const totalAmount = r2(Number(body.totalAmount) > 0 ? Number(body.totalAmount) : base);
      const ppn = Number(po.ppnPercent);
      const taxAmount = r2((totalAmount * ppn) / 100);
      const { year, start, end } = currentYearRange();
      const count = await prisma.bill.count({ where: { companyId: po.companyId, createdAt: { gte: start, lt: end } } });
      const soId = po.soId || po.sources[0]?.soId || null;
      const bill = await prisma.bill.create({
        data: {
          companyId: po.companyId, supplierId: po.supplierId, poId: po.id, soId, billKind: kind, status: "draft",
          billNumber: formatDocumentNumber("BILL", year, count + 1), billDate: new Date(),
          ppnPercent: ppn, totalAmount, taxAmount, grandTotal: r2(totalAmount + taxAmount),
          notes: kind === "down_payment" ? `Uang muka (DP) untuk ${po.poNumber}` : `Tagihan vendor untuk ${po.poNumber}`,
          createdBy: session.user.email,
          items: {
            create: [{
              lineNumber: 1, soId, unit: "lot", quantity: 1, unitPrice: totalAmount, subtotal: totalAmount,
              description: kind === "down_payment" ? `Uang muka (DP) ${po.poNumber}` : `Tagihan ${po.poNumber}`,
            }],
          },
        },
        select: { id: true, billNumber: true },
      });
      return NextResponse.json(bill, { status: 201 });
    }

    // Drop a placeholder bill that never got its PDF (e.g. the upload failed).
    if (body.action === "discard_draft") {
      await prisma.bill.updateMany({ where: { id: body.billId, poId: id, status: "draft", deletedAt: null }, data: { deletedAt: new Date() } });
      return NextResponse.json({ ok: true });
    }

    // A bill built from ticked PO lines: SCM ticks the lines that are on the vendor's invoice.
    // Any DP already billed is deducted pro rata, since the vendor's invoice nets it off.
    if (body.action === "create_from_items") {
      const ids: string[] = Array.isArray(body.itemIds) ? body.itemIds : [];
      const lines = po.items.filter((i) => ids.includes(i.id) && Number(i.quantity) - Number(i.invoicedQty) > 0.0001);
      if (!lines.length) return NextResponse.json({ error: "Pilih minimal satu item yang belum ditagih" }, { status: 400 });

      const poSubtotal = po.items.reduce((sum, i) => sum + Number(i.subtotal), 0);
      const dpBills = await prisma.bill.findMany({
        where: { poId: id, deletedAt: null, billKind: "down_payment", status: { not: "cancelled" } },
        select: { totalAmount: true },
      });
      const dpTotal = dpBills.reduce((sum, b) => sum + Number(b.totalAmount), 0);
      const lineValues = lines.map((i) => ({ item: i, qty: Number(i.quantity) - Number(i.invoicedQty), amount: r2((Number(i.quantity) - Number(i.invoicedQty)) * Number(i.unitPrice)) }));
      const itemsSubtotal = r2(lineValues.reduce((sum, l) => sum + l.amount, 0));
      const dpDeduct = poSubtotal > 0 && dpTotal > 0 ? r2(Math.min(dpTotal * (itemsSubtotal / poSubtotal), itemsSubtotal)) : 0;
      const totalAmount = r2(itemsSubtotal - dpDeduct);
      const ppn = Number(po.ppnPercent);
      const taxAmount = r2((totalAmount * ppn) / 100);
      const { year, start, end } = currentYearRange();
      const count = await prisma.bill.count({ where: { companyId: po.companyId, createdAt: { gte: start, lt: end } } });
      const soId = po.soId || po.sources[0]?.soId || null;

      const created = await prisma.bill.create({
        data: {
          companyId: po.companyId, supplierId: po.supplierId, poId: po.id, soId, billKind: "regular", status: "draft",
          billNumber: formatDocumentNumber("BILL", year, count + 1), billDate: new Date(),
          ppnPercent: ppn, totalAmount, taxAmount, grandTotal: r2(totalAmount + taxAmount),
          notes: `Tagihan vendor untuk ${po.poNumber}`,
          createdBy: session.user.email,
          items: {
            create: [
              ...lineValues.map((l, idx) => ({
                lineNumber: idx + 1, poItemId: l.item.id, soId, description: l.item.description,
                quantity: l.qty, unit: l.item.unit, unitPrice: Number(l.item.unitPrice), subtotal: l.amount,
              })),
              ...(dpDeduct > 0
                ? [{ lineNumber: lineValues.length + 1, soId, description: "Dikurangi uang muka (DP) yang sudah ditagih", quantity: 1, unit: "lot", unitPrice: -dpDeduct, subtotal: -dpDeduct }]
                : []),
            ],
          },
        },
        select: { id: true, billNumber: true },
      });
      return NextResponse.json({ ...created, suggestedTotal: totalAmount, itemsSubtotal, dpDeduct }, { status: 201 });
    }

    // The vendor's document has arrived: needs the PDF on file, then the bill becomes payable.
    if (body.action === "receive") {
      const bill = await prisma.bill.findFirst({ where: { id: body.billId, poId: id, deletedAt: null } });
      if (!bill) return NextResponse.json({ error: "Tagihan tidak ditemukan" }, { status: 404 });
      if (bill.status !== "draft") return NextResponse.json({ error: "Tagihan ini sudah dicatat masuk" }, { status: 400 });

      const files = await prisma.attachment.count({ where: { referenceType: "Bill", referenceId: bill.id, deletedAt: null } });
      if (files === 0) return NextResponse.json({ error: "Unggah PDF tagihan dari vendor dulu" }, { status: 400 });

      const vendorRef = String(body.vendorInvoiceNumber || "").trim();
      if (!vendorRef) return NextResponse.json({ error: "Nomor invoice vendor wajib diisi" }, { status: 400 });
      const billDate = new Date(body.billDate);
      if (Number.isNaN(billDate.getTime())) return NextResponse.json({ error: "Tanggal tagihan tidak valid" }, { status: 400 });
      const dueDate = body.dueDate ? new Date(body.dueDate) : null;
      if (dueDate && Number.isNaN(dueDate.getTime())) return NextResponse.json({ error: "Jatuh tempo tidak valid" }, { status: 400 });
      const totalAmount = r2(Number(body.totalAmount));
      if (!Number.isFinite(totalAmount) || totalAmount <= 0) return NextResponse.json({ error: "Nilai tagihan harus lebih dari 0" }, { status: 400 });
      const ppn = Number.isFinite(Number(body.ppnPercent)) ? Math.max(Number(body.ppnPercent), 0) : Number(bill.ppnPercent);

      const dup = await prisma.bill.findFirst({
        where: { companyId: po.companyId, supplierId: po.supplierId, deletedAt: null, id: { not: bill.id }, vendorInvoiceNumber: { equals: vendorRef, mode: "insensitive" } },
        select: { billNumber: true },
      });
      if (dup) return NextResponse.json({ error: `Invoice vendor ${vendorRef} sudah pernah diinput sebagai ${dup.billNumber}` }, { status: 400 });

      const taxAmount = r2((totalAmount * ppn) / 100);
      const billLines = await prisma.billItem.findMany({ where: { billId: bill.id }, orderBy: { lineNumber: "asc" } });
      const linked = billLines.filter((l) => l.poItemId);
      if (linked.length === 0) {
        await prisma.billItem.updateMany({ where: { billId: bill.id, lineNumber: 1 }, data: { unitPrice: totalAmount, subtotal: totalAmount } });
      } else {
        // Keep the lines in step with the vendor's invoice total: one adjustment line takes any difference.
        const linkedSum = r2(linked.reduce((sum, l) => sum + Number(l.subtotal), 0));
        const others = billLines.filter((l) => !l.poItemId && !/uang muka|penyesuaian/i.test(l.description));
        const base = linkedSum + others.reduce((sum, l) => sum + Number(l.subtotal), 0);
        const diff = r2(totalAmount - base);
        await prisma.billItem.deleteMany({ where: { billId: bill.id, poItemId: null, description: { in: billLines.filter((l) => !l.poItemId && /uang muka|penyesuaian/i.test(l.description)).map((l) => l.description) } } });
        if (Math.abs(diff) > 0.005) {
          await prisma.billItem.create({
            data: { billId: bill.id, lineNumber: Math.max(...billLines.map((l) => l.lineNumber)) + 1, description: "Penyesuaian dengan invoice vendor (potongan DP / selisih)", quantity: 1, unit: "lot", unitPrice: diff, subtotal: diff, soId: bill.soId },
          });
        }
        for (const l of linked) {
          const poItem = po.items.find((i) => i.id === l.poItemId);
          if (!poItem) continue;
          const next = Math.min(Number(poItem.invoicedQty) + Number(l.quantity), Number(poItem.quantity));
          await prisma.purchaseOrderItem.update({ where: { id: poItem.id }, data: { invoicedQty: next } });
        }
      }
      await prisma.bill.update({
        where: { id: bill.id },
        data: {
          status: "received", vendorInvoiceNumber: vendorRef, billDate, dueDate, ppnPercent: ppn,
          totalAmount, taxAmount, grandTotal: r2(totalAmount + taxAmount),
        },
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Aksi tidak dikenal" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/purchase-orders/[id]/bills error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
