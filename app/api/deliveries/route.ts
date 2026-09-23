import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { formatDocumentNumber, currentYearRange } from "@/lib/document-number";
import { applyDeliveryStock, recalcSalesOrderStatus } from "@/lib/workflow";
import { guard } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  try {
    { const denied = await guard(["sales"], "view"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { memberships: true },
    });

    if (!user?.memberships.length) {
      return NextResponse.json({ error: "No company access" }, { status: 403 });
    }

    const companyIds = user.memberships.map((m: any) => m.companyId);

    const deliveries = await prisma.delivery.findMany({
      where: { companyId: { in: companyIds }, deletedAt: null },
      include: {
        customer: { select: { name: true } },
        salesOrder: { select: { soNumber: true, poNumber: true } },
      },
      orderBy: { deliveryDate: "desc" },
    });

    return NextResponse.json(deliveries);
  } catch (error) {
    console.error("GET /api/deliveries error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    { const denied = await guard(["sales"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      companyId,
      customerId,
      soId,
      warehouseId,
      invoiceId,
      deliveryDate,
      vehicleNumber,
      driverName,
      shippingAddress,
      notes,
      items,
    } = body;

    const membership = await prisma.userMembership.findFirst({
      where: { userId: session.user.id, companyId },
    }).catch(() => null);

    if (!membership) {
      return NextResponse.json({ error: "No access" }, { status: 403 });
    }

    const { year, start, end } = currentYearRange();
    const count = await prisma.delivery.count({
      where: { companyId, createdAt: { gte: start, lt: end } },
    });
    const deliveryNumber = formatDocumentNumber("SJ", year, count + 1);

    const delivery = await prisma.$transaction(async (tx) => {
      const created = await tx.delivery.create({
        data: {
          companyId,
          customerId,
          soId: soId || null,
          warehouseId: warehouseId || null,
          invoiceId: invoiceId || null,
          deliveryNumber,
          deliveryDate: new Date(deliveryDate),
          vehicleNumber,
          driverName,
          shippingAddress,
          notes,
          status: "draft",
          createdBy: session.user.email!,
          items: {
            create: (items || []).map((item: any, index: number) => ({
              lineNumber: item.lineNumber ?? index + 1,
              partNumber: item.partNumber,
              description: item.description,
              quantity: item.quantity,
              unit: item.unit,
              notes: item.notes,
            })),
          },
        },
        include: { customer: true, items: true },
      });
      await applyDeliveryStock(tx, created, created.items, session.user.email!);
      await recalcSalesOrderStatus(tx, created.soId);
      return created;
    }, { timeout: 30000, maxWait: 10000 });

    return NextResponse.json(delivery, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Insufficient stock")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("POST /api/deliveries error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
