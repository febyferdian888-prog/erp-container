import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { userHasCompanyAccess } from "@/lib/company-access";

// A new purchase price gets its own part number: "CONT40" -> "CONT40-2", "CONT40-3", ...
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    { const denied = await guard(["purchasing", "operational"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const { price } = await req.json();
    const newPrice = Number(price);
    if (!Number.isFinite(newPrice) || newPrice <= 0) {
      return NextResponse.json({ error: "Harga harus lebih dari 0" }, { status: 400 });
    }

    const source = await prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!source || !(await userHasCompanyAccess(prisma, session.user.id, source.companyId))) {
      return NextResponse.json({ error: "Sparepart tidak ditemukan" }, { status: 404 });
    }

    // Only treat a trailing "-N" as a price suffix when the part without it is itself a registered part.
    const stripped = source.sku.replace(/-\d+$/, "");
    const parent =
      stripped !== source.sku
        ? await prisma.product.findFirst({ where: { companyId: source.companyId, sku: stripped, deletedAt: null }, select: { id: true } })
        : null;
    const base = parent ? stripped : source.sku;
    const family = await prisma.product.findMany({
      where: { companyId: source.companyId, deletedAt: null, OR: [{ sku: base }, { sku: { startsWith: `${base}-` } }] },
    });
    const isVariant = (sku: string) => sku.startsWith(`${base}-`) && /^\d+$/.test(sku.slice(base.length + 1));
    const sameFamily = family.filter((p) => p.sku === base || isVariant(p.sku));

    const samePrice = sameFamily.find((p) => Number(p.standardPrice) === newPrice);
    if (samePrice) return NextResponse.json({ product: samePrice, reused: true });

    const used = sameFamily.map((p) => (p.sku === base ? 1 : parseInt(p.sku.slice(base.length + 1), 10)));
    const next = Math.max(1, ...used) + 1;

    const product = await prisma.product.create({
      data: {
        companyId: source.companyId,
        categoryId: source.categoryId,
        sku: `${base}-${next}`,
        name: source.name,
        description: source.description,
        unitId: source.unitId,
        standardPrice: newPrice,
        itemType: source.itemType,
        brand: source.brand,
        classification: source.classification,
        interchange: source.interchange,
        isActive: true,
      },
      include: { unit: true },
    });
    return NextResponse.json({ product, reused: false }, { status: 201 });
  } catch (error) {
    console.error("POST /api/products/[id]/price-variant error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
