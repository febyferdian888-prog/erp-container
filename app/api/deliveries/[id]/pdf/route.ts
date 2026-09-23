import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { DeliveryPdfDocument, DeliveryPdfData } from "@/lib/delivery-pdf";
import { guard } from "@/lib/rbac";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    { const denied = await guard(["sales"], "view"); if (denied) return denied; }
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const delivery = await prisma.delivery.findUnique({
      where: { id },
      include: {
        company: true,
        customer: true,
        items: { orderBy: { lineNumber: "asc" } },
      },
    });

    if (!delivery) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const membership = await prisma.userMembership.findFirst({
      where: { userId: session.user.id, companyId: delivery.companyId },
    });
    if (!membership) {
      return NextResponse.json({ error: "No access" }, { status: 403 });
    }

    const data: DeliveryPdfData = {
      deliveryNumber: delivery.deliveryNumber,
      deliveryDate: delivery.deliveryDate.toISOString(),
      vehicleNumber: delivery.vehicleNumber,
      driverName: delivery.driverName,
      shippingAddress: delivery.shippingAddress,
      notes: delivery.notes,
      company: {
        name: delivery.company.name,
        description: delivery.company.description,
        address: delivery.company.address,
        city: delivery.company.city,
        province: delivery.company.province,
        postalCode: delivery.company.postalCode,
        phone: delivery.company.phone,
        email: delivery.company.email,
        npwp: delivery.company.npwp,
      },
      customer: {
        name: delivery.customer.name,
        address: delivery.customer.address,
        city: delivery.customer.city,
      },
      items: delivery.items.map((item) => ({
        lineNumber: item.lineNumber,
        partNumber: item.partNumber,
        description: item.description,
        quantity: Number(item.quantity),
        unit: item.unit,
        notes: item.notes,
      })),
    };

    const buffer = await renderToBuffer(DeliveryPdfDocument({ data }));

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${delivery.deliveryNumber}.pdf"`,
      },
    });
  } catch (error) {
    console.error("GET /api/deliveries/[id]/pdf error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
