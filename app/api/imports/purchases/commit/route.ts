import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { normName } from "@/lib/name-utils";
import { recalcBillStatus } from "@/lib/workflow";
import { guard } from "@/lib/rbac";

interface CommitItem {
  partNumber?: string;
  description: string;
  qty: number;
  unit?: string;
  unitPrice: number;
  soId?: string | null;
  notes?: string;
}
interface CommitBill {
  vendorName: string;
  supplierId?: string | null;
  invoiceNo?: string;
  date: string;
  dueDate?: string | null;
  ppn: number;
  pph?: number;
  notes?: string;
  paidDate?: string | null;
  paidAmount?: number;
  items: CommitItem[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const validDate = (s?: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s).getTime());

export async function POST(req: NextRequest) {
  try {
    { const denied = await guard(["finance", "purchasing"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = await prisma.user.findUnique({ where: { email: session.user.email }, include: { memberships: true } });
    const companyId = user?.memberships.find((membership) => membership.isActive)?.companyId;
    if (!companyId || !user) return NextResponse.json({ error: "No company access" }, { status: 403 });

    const { bills } = (await req.json()) as { bills: CommitBill[] };
    if (!Array.isArray(bills) || !bills.length) return NextResponse.json({ error: "Tidak ada bill" }, { status: 400 });
    if (bills.length > 60) return NextResponse.json({ error: "Maksimal 60 bill per permintaan" }, { status: 400 });

    const suppliers = await prisma.supplier.findMany({ where: { companyId }, select: { id: true, code: true, name: true } });
    const byNorm = new Map(suppliers.map((s) => [normName(s.name), s.id]));
    let nextSupNum = suppliers.reduce((m, s) => Math.max(m, /^SUP(\d+)$/.exec(s.code)?.[1] ? parseInt(/^SUP(\d+)$/.exec(s.code)![1], 10) : 0), 0);

    const seq = new Map<string, number>(); // "BILL-2026" -> last used sequence
    const nextNumber = async (prefix: string, year: number, model: "bill" | "payment") => {
      const key = `${prefix}-${year}`;
      if (!seq.has(key)) {
        const like = `${key}-`;
        const last =
          model === "bill"
            ? await prisma.bill.findFirst({ where: { companyId, billNumber: { startsWith: like } }, orderBy: { billNumber: "desc" }, select: { billNumber: true } })
            : await prisma.payment.findFirst({ where: { companyId, paymentNumber: { startsWith: like } }, orderBy: { paymentNumber: "desc" }, select: { paymentNumber: true } });
        const lastNo = last ? ("billNumber" in last ? last.billNumber : last.paymentNumber) : "";
        seq.set(key, lastNo ? parseInt(lastNo.slice(like.length), 10) || 0 : 0);
      }
      seq.set(key, seq.get(key)! + 1);
      return `${key}-${String(seq.get(key)).padStart(4, "0")}`;
    };

    const results: { vendorName: string; invoiceNo: string; status: "created" | "skipped" | "failed"; billNumber?: string; reason?: string }[] = [];
    let suppliersCreated = 0;

    for (const b of bills) {
      const invoiceNo = (b.invoiceNo || "").trim();
      const base = { vendorName: b.vendorName, invoiceNo };
      try {
        if (!validDate(b.date)) throw new Error("Tanggal tidak valid");
        const items = (b.items || []).filter((i) => Number(i.qty) > 0 && Number(i.unitPrice) >= 0 && (i.description || "").trim());
        if (!items.length) throw new Error("Tidak ada item valid");
        if (!b.vendorName?.trim() && !b.supplierId) throw new Error("Vendor kosong");

        let supplierId = b.supplierId || byNorm.get(normName(b.vendorName)) || null;
        if (supplierId && !suppliers.some((s) => s.id === supplierId)) throw new Error("Vendor tidak ditemukan");
        if (!supplierId) {
          nextSupNum++;
          const created = await prisma.supplier.create({
            data: { companyId, code: `SUP${String(nextSupNum).padStart(3, "0")}`, name: b.vendorName.trim(), country: "Indonesia" },
          });
          supplierId = created.id;
          byNorm.set(normName(b.vendorName), created.id);
          suppliers.push({ id: created.id, code: created.code, name: created.name });
          suppliersCreated++;
        }

        if (invoiceNo) {
          const dup = await prisma.bill.findFirst({
            where: { companyId, supplierId, deletedAt: null, vendorInvoiceNumber: { equals: invoiceNo, mode: "insensitive" } },
            select: { billNumber: true },
          });
          if (dup) {
            results.push({ ...base, status: "skipped", reason: `Sudah ada sebagai ${dup.billNumber}` });
            continue;
          }
        }

        const lines = items.map((i, idx) => ({
          lineNumber: idx + 1,
          partNumber: (i.partNumber || "").trim() || null,
          soId: i.soId || null,
          description: i.description.trim(),
          quantity: Number(i.qty),
          unit: (i.unit || "pcs").trim(),
          unitPrice: r2(Number(i.unitPrice)),
          subtotal: r2(Number(i.qty) * Number(i.unitPrice)),
          notes: (i.notes || "").trim() || null,
        }));
        const total = r2(lines.reduce((s, l) => s + l.subtotal, 0));
        const ppn = Number.isFinite(Number(b.ppn)) ? Number(b.ppn) : 11;
        const tax = r2((total * ppn) / 100);
        const grand = r2(total + tax);
        const soIds = [...new Set(lines.map((l) => l.soId).filter(Boolean))] as string[];
        const billDate = new Date(b.date);

        const pph = Math.min(Math.max(Number(b.pph) || 0, 0), grand);
        const billNumber = await nextNumber("BILL", billDate.getUTCFullYear(), "bill");
        const bill = await prisma.bill.create({
          data: {
            companyId,
            supplierId,
            soId: soIds.length === 1 ? soIds[0] : null,
            vendorInvoiceNumber: invoiceNo || null,
            billNumber,
            billDate,
            dueDate: validDate(b.dueDate) ? new Date(b.dueDate!) : null,
            ppnPercent: ppn,
            totalAmount: total,
            taxAmount: tax,
            grandTotal: grand,
            paidAmount: pph,
            pphAmount: pph,
            pphPercent: total > 0 ? Math.round((pph / total) * 10000) / 100 : 0,
            status: "received",
            notes: [b.notes?.trim(), "Diimpor dari Excel"].filter(Boolean).join(" | "),
            createdBy: user.email,
            items: { create: lines },
          },
        });

        const paid = Math.min(Number(b.paidAmount || 0), grand - pph);
        if (paid > 0) {
          const payDate = validDate(b.paidDate) ? new Date(b.paidDate!) : billDate;
          await prisma.payment.create({
            data: {
              companyId,
              supplierId,
              referenceType: "Bill",
              referenceId: bill.id,
              paymentNumber: await nextNumber("BP", payDate.getUTCFullYear(), "payment"),
              paymentDate: payDate,
              amount: paid,
              method: "transfer",
              description: `Pembayaran ${billNumber}`,
              status: "recorded",
              createdBy: user.email,
            },
          });
          await prisma.bill.update({ where: { id: bill.id }, data: { paidAmount: pph + paid } });
          await recalcBillStatus(prisma, bill.id);
        }
        results.push({ ...base, status: "created", billNumber });
      } catch (e) {
        results.push({ ...base, status: "failed", reason: e instanceof Error ? e.message : "Gagal" });
      }
    }

    return NextResponse.json({ results, suppliersCreated });
  } catch (error) {
    console.error("POST /api/imports/purchases/commit error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
