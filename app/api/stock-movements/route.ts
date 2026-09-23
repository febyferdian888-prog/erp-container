import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  try {
    { const denied = await guard(["purchasing", "operational", "sales", "finance"], "view"); if (denied) return denied; }
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

    const movements = await prisma.stockMovement.findMany({
      where: { warehouse: { companyId: { in: companyIds }, deletedAt: null } },
      include: {
        warehouse: { select: { code: true, name: true } },
        product: { select: { sku: true, name: true } },
        unit: { select: { code: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return NextResponse.json(movements);
  } catch (error) {
    console.error("GET /api/stock-movements error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    { const denied = await guard(["purchasing"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { warehouseId, productId, type, quantity, reason, notes } = body;

    if (!warehouseId || !productId || !type || quantity === undefined || quantity === null) {
      return NextResponse.json(
        { error: "warehouseId, productId, type, and quantity are required" },
        { status: 400 }
      );
    }
    if (!["IN", "OUT", "ADJUSTMENT"].includes(type)) {
      return NextResponse.json({ error: "type must be IN, OUT, or ADJUSTMENT" }, { status: 400 });
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const magnitude = Math.abs(Number(quantity));
    if (magnitude === 0) {
      return NextResponse.json({ error: "Quantity must not be zero" }, { status: 400 });
    }
    const delta = type === "OUT" ? -magnitude : type === "IN" ? magnitude : Number(quantity);

    const result = await prisma.$transaction(async (tx) => {
      const existingStock = await tx.stock.findFirst({
        where: { warehouseId, productId, locationId: null },
      });

      const currentQty = existingStock ? Number(existingStock.quantity) : 0;
      const newQty = currentQty + delta;
      if (newQty < 0) {
        throw new Error(`Insufficient stock: only ${currentQty} available`);
      }

      if (existingStock) {
        await tx.stock.update({
          where: { id: existingStock.id },
          data: { quantity: newQty },
        });
      } else {
        await tx.stock.create({
          data: { warehouseId, productId, quantity: newQty },
        });
      }

      const movement = await tx.stockMovement.create({
        data: {
          warehouseId,
          productId,
          unitId: product.unitId,
          referenceType: "Manual",
          referenceId: "manual-entry",
          quantity: magnitude,
          type,
          reason,
          notes,
          createdBy: session.user.email,
        },
        include: {
          warehouse: { select: { code: true, name: true } },
          product: { select: { sku: true, name: true } },
          unit: { select: { code: true } },
        },
      });

      return movement;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("POST /api/stock-movements error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: message.startsWith("Insufficient") ? 400 : 500 });
  }
}
