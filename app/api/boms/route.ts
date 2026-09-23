import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  try {
    { const denied = await guard(["operational"], "view"); if (denied) return denied; }
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

    const boms = await prisma.bOM.findMany({
      where: {
        deletedAt: null,
        project: { companyId: { in: companyIds } },
      },
      include: {
        project: { select: { id: true, projectNumber: true, projectName: true } },
        items: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(boms);
  } catch (error) {
    console.error("GET /api/boms error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    { const denied = await guard(["operational"], "edit"); if (denied) return denied; }
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { projectId, title, description, items } = body;

    if (!projectId || !title || !items?.length) {
      return NextResponse.json(
        { error: "projectId, title, and at least one item are required" },
        { status: 400 }
      );
    }

    const count = await prisma.bOM.count({ where: { projectId } });
    const bomNumber = `BOM-${String(count + 1).padStart(3, "0")}`;

    const bom = await prisma.bOM.create({
      data: {
        projectId,
        bomNumber,
        version: 1,
        title,
        description,
        createdBy: session.user.email,
        items: {
          create: items.map((item: any, index: number) => ({
            productId: item.productId,
            unitId: item.unitId,
            lineNumber: index + 1,
            quantity: item.quantity,
            unitPrice: item.unitPrice || 0,
            notes: item.notes,
          })),
        },
      },
      include: {
        project: { select: { projectNumber: true, projectName: true } },
        items: { include: { product: true, unit: true } },
      },
    });

    return NextResponse.json(bom, { status: 201 });
  } catch (error) {
    console.error("POST /api/boms error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
