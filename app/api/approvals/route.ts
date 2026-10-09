import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import type { Area } from "@/lib/rbac-shared";
import {
  APPROVAL_THRESHOLDS,
  canDecideApprovals,
  documentInfo,
  isApprovalType,
  tierState,
  tiersFor,
} from "@/lib/approval";

const TYPE_AREA: Record<string, Area[]> = { PurchaseOrder: ["purchasing"], Quotation: ["sales"] };

async function actor() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({ where: { email: session.user.email }, include: { memberships: true } });
  return user;
}

export async function GET(req: NextRequest) {
  try {
    const user = await actor();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const canDecide = await canDecideApprovals(user.id);
    const url = new URL(req.url);
    const type = url.searchParams.get("referenceType");
    const id = url.searchParams.get("referenceId");

    if (type && id) {
      { const denied = await guard(TYPE_AREA[type] || ["admin"], "view"); if (denied) return denied; }
      const info = await documentInfo(prisma, type, id);
      if (!info) return NextResponse.json({ error: "Document not found" }, { status: 404 });
      if (!user.memberships.some((m) => m.companyId === info.companyId && m.isActive)) {
        return NextResponse.json({ error: "Document not found" }, { status: 404 });
      }
      const { state, tiers, threshold, currentApproval } = await tierState(prisma, type, id, info.amount);
      return NextResponse.json({ state, approval: currentApproval, tiers, threshold, amount: info.amount, canDecide });
    }

    const rows = await prisma.approval.findMany({
      where: url.searchParams.get("status") === "pending" ? { status: "pending" } : {},
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const visibleRows = (await Promise.all(rows.map(async (row) => {
      const info = await documentInfo(prisma, row.referenceType, row.referenceId);
      return info && user.memberships.some((m) => m.companyId === info.companyId && m.isActive) ? { row, info } : null;
    }))).filter((x): x is { row: (typeof rows)[number]; info: NonNullable<Awaited<ReturnType<typeof documentInfo>>> } => x !== null);
    const userIds = [...new Set(visibleRows.flatMap(({ row }) => [row.requestedBy, row.approvedBy]).filter(Boolean) as string[])];
    const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } });
    const nameOf = (uid: string | null) => {
      const u = users.find((x) => x.id === uid);
      return u ? u.name || u.email : null;
    };
    return NextResponse.json({
      canDecide,
      thresholds: APPROVAL_THRESHOLDS,
      approvals: visibleRows.map(({ row: r, info }) => ({
        ...r,
        amount: r.amount === null ? null : Number(r.amount),
        requestedByName: nameOf(r.requestedBy),
        approvedByName: nameOf(r.approvedBy),
        partyName: info.partyName ?? null,
        items: info.items ?? [],
        salesOrders: "salesOrders" in info ? info.salesOrders : [],
      })),
    });
  } catch (error) {
    console.error("GET /api/approvals error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await actor();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { referenceType, referenceId } = await req.json();
    { const denied = await guard(TYPE_AREA[referenceType] || ["admin"], "edit"); if (denied) return denied; }
    if (!isApprovalType(referenceType) || !referenceId) {
      return NextResponse.json({ error: "Invalid document type" }, { status: 400 });
    }
    const info = await documentInfo(prisma, referenceType, referenceId);
    if (!info) return NextResponse.json({ error: "Document not found" }, { status: 404 });
    if (!user.memberships.some((m) => m.companyId === info.companyId && m.isActive)) {
      return NextResponse.json({ error: "No access" }, { status: 403 });
    }
    const { state, tiers } = await tierState(prisma, referenceType, referenceId, info.amount);
    if (state === "not_required") {
      return NextResponse.json({ error: "Dokumen ini tidak memerlukan persetujuan" }, { status: 400 });
    }
    if (state === "pending" || state === "approved") {
      return NextResponse.json({ error: "Sudah ada pengajuan yang aktif" }, { status: 400 });
    }
    // The first tier in "none" state is the next one to request — earlier
    // tiers must already be approved (tierState walks in order and stops
    // at the first non-approved tier, so this is always the correct next step).
    // After a rejection the document goes back to the first tier; otherwise to the first tier not yet requested.
    const nextTierIndex = state === "rejected" ? 0 : tiers.findIndex((t) => t.status === "none");
    const nextRole = tiers[nextTierIndex === -1 ? 0 : nextTierIndex].role || tiersFor(referenceType)[0];
    const approval = await prisma.approval.create({
      data: {
        referenceType,
        referenceId,
        approverRole: nextRole,
        status: "pending",
        amount: info.amount,
        requestedBy: user.id,
        documentLabel: info.label,
      },
    });
    return NextResponse.json(approval, { status: 201 });
  } catch (error) {
    console.error("POST /api/approvals error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
