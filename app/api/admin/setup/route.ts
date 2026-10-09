import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import bcryptjs from "bcryptjs";
import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";

export async function POST(req: NextRequest) {
  try {
    const adminKey = process.env.ADMIN_SETUP_KEY;
    if (!adminKey) {
      return NextResponse.json(
        { error: "ADMIN_SETUP_KEY is not configured" },
        { status: 500 }
      );
    }

    const headerKey = req.headers.get("x-admin-key");
    if (!headerKey || headerKey !== adminKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const existingCompany = await prisma.company.findFirst();
    if (existingCompany) {
      return NextResponse.json(
        { message: "Database already initialized" },
        { status: 200 }
      );
    }

    const unit1 = await prisma.unit.create({
      data: {
        name: "Meter",
        code: "M",
        description: "Meter",
        isActive: true,
      },
    });

    const unit2 = await prisma.unit.create({
      data: {
        name: "Piece",
        code: "PCS",
        description: "Piece",
        isActive: true,
      },
    });

    const unit3 = await prisma.unit.create({
      data: {
        name: "Kilogram",
        code: "KG",
        description: "Kilogram",
        isActive: true,
      },
    });

    const cat1 = await prisma.productCategory.create({
      data: {
        name: "Steel",
        description: "Steel materials",
        isActive: true,
      },
    });

    const cat2 = await prisma.productCategory.create({
      data: {
        name: "Hardware",
        description: "Hardware components",
        isActive: true,
      },
    });

    const roleAdmin = await prisma.role.create({
      data: {
        name: "Admin",
        description: "Administrator role with full access",
      },
    });

    const company = await prisma.company.create({
      data: {
        name: "PT. Anda",
        code: "PT-A",
        description: "Container Procurement and Fabrication",
        isActive: true,
      },
    });

    const initialPassword = randomBytes(12).toString("base64url");
    const hashedPassword = await bcryptjs.hash(initialPassword, 10);
    const user = await prisma.user.create({
      data: {
        name: "Admin",
        email: "admin@erp.local",
        password: hashedPassword,
      },
    });

    await prisma.userMembership.create({
      data: {
        userId: user.id,
        companyId: company.id,
        roleId: roleAdmin.id,
      },
    });

    const supplier1 = await prisma.supplier.create({
      data: {
        companyId: company.id,
        name: "PT. Supplier Utama",
        code: "SUP001",
        email: "supplier1@example.com",
        phone: "+6281234567890",
        address: "Jalan Industri 1, Jakarta",
        city: "Jakarta",
        province: "DKI Jakarta",
        postalCode: "12345",
        country: "Indonesia",
      },
    });

    const customer1 = await prisma.customer.create({
      data: {
        companyId: company.id,
        name: "PT. Customer Besar",
        code: "CUST001",
        email: "customer1@example.com",
        phone: "+6281234567891",
        address: "Jalan Perdagangan 1, Surabaya",
        city: "Surabaya",
        province: "Jawa Timur",
        postalCode: "60123",
        country: "Indonesia",
      },
    });

    const product1 = await prisma.product.create({
      data: {
        companyId: company.id,
        name: "20ft Container",
        sku: "CONT20",
        description: "20-foot container",
        categoryId: cat1.id,
        unitId: unit2.id,
        standardPrice: new Prisma.Decimal("15000000"),
      },
    });

    const product2 = await prisma.product.create({
      data: {
        companyId: company.id,
        name: "40ft Container",
        sku: "CONT40",
        description: "40-foot container",
        categoryId: cat1.id,
        unitId: unit2.id,
        standardPrice: new Prisma.Decimal("25000000"),
      },
    });

    return NextResponse.json(
      {
        message: "Database initialized successfully. Simpan password admin ini sekarang, tidak akan ditampilkan lagi.",
        adminPassword: initialPassword,
        data: {
          company: company.name,
          user: user.email,
          products: 2,
          customers: 1,
          suppliers: 1,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Setup error:", error);
    return NextResponse.json(
      { error: "Setup failed" },
      { status: 500 }
    );
  }
}
