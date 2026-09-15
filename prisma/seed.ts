import { prisma } from "../lib/db";
import bcrypt from "bcryptjs";

async function main() {
  console.log("🌱 Seeding database with demo data...");

  // Create Roles
  console.log("Creating roles...");
  const ownerRole = await prisma.role.upsert({
    where: { name: "Owner" },
    update: {},
    create: { name: "Owner", description: "Owner/Director", isSystem: true },
  });

  const salesRole = await prisma.role.upsert({
    where: { name: "Sales" },
    update: {},
    create: { name: "Sales", description: "Sales Manager", isSystem: true },
  });

  const purchasingRole = await prisma.role.upsert({
    where: { name: "Purchasing" },
    update: {},
    create: {
      name: "Purchasing",
      description: "Purchasing Officer",
      isSystem: true,
    },
  });

  const operationalRole = await prisma.role.upsert({
    where: { name: "Operational" },
    update: {},
    create: {
      name: "Operational",
      description: "Operational Manager",
      isSystem: true,
    },
  });

  const financeRole = await prisma.role.upsert({
    where: { name: "Finance" },
    update: {},
    create: { name: "Finance", description: "Finance Manager", isSystem: true },
  });

  // Create Companies
  console.log("Creating companies...");
  const companyA = await prisma.company.upsert({
    where: { code: "PT-A" },
    update: {},
    create: {
      code: "PT-A",
      name: "PT Maju Jaya Kontainer",
      description: "Main procurement company",
      address: "Jl. Industri No. 123",
      city: "Jakarta",
      province: "DKI Jakarta",
      country: "Indonesia",
      postalCode: "12345",
      npwp: "12.345.678.9-012.345",
      phone: "+62-21-1234567",
      email: "info@majujaya.co.id",
      currency: "IDR",
      timezone: "Asia/Jakarta",
    },
  });

  // Fokus pada 1 PT untuk tahap ini
  // PT-B dan PT-C akan ditambahkan di tahap berikutnya

  // Create Admin User
  console.log("Creating users...");
  const hashedPassword = await bcrypt.hash("admin123", 10);

  const adminUser = await prisma.user.upsert({
    where: { email: "admin@erp.local" },
    update: {},
    create: {
      email: "admin@erp.local",
      name: "System Administrator",
      password: hashedPassword,
      isActive: true,
    },
  });

  // Create Users for Companies
  const userA = await prisma.user.upsert({
    where: { email: "owner@ptaja.local" },
    update: {},
    create: {
      email: "owner@ptaja.local",
      name: "Budi Santoso (PT A Owner)",
      password: hashedPassword,
      isActive: true,
    },
  });

  const userB = await prisma.user.upsert({
    where: { email: "sales@ptaja.local" },
    update: {},
    create: {
      email: "sales@ptaja.local",
      name: "Siti Nurhaliza (Sales PT A)",
      password: hashedPassword,
      isActive: true,
    },
  });

  // Create User Memberships
  console.log("Creating user memberships...");

  await prisma.userMembership.upsert({
    where: {
      userId_companyId_roleId: {
        userId: adminUser.id,
        companyId: companyA.id,
        roleId: ownerRole.id,
      },
    },
    update: {},
    create: {
      userId: adminUser.id,
      companyId: companyA.id,
      roleId: ownerRole.id,
    },
  });

  await prisma.userMembership.upsert({
    where: {
      userId_companyId_roleId: {
        userId: userA.id,
        companyId: companyA.id,
        roleId: ownerRole.id,
      },
    },
    update: {},
    create: {
      userId: userA.id,
      companyId: companyA.id,
      roleId: ownerRole.id,
    },
  });

  await prisma.userMembership.upsert({
    where: {
      userId_companyId_roleId: {
        userId: userB.id,
        companyId: companyA.id,
        roleId: salesRole.id,
      },
    },
    update: {},
    create: {
      userId: userB.id,
      companyId: companyA.id,
      roleId: salesRole.id,
    },
  });

  // Create Master Data
  console.log("Creating master data...");

  // Units
  const unitM = await prisma.unit.upsert({
    where: { code: "M" },
    update: {},
    create: { code: "M", name: "Meter" },
  });

  const unitKG = await prisma.unit.upsert({
    where: { code: "KG" },
    update: {},
    create: { code: "KG", name: "Kilogram" },
  });

  const unitPCS = await prisma.unit.upsert({
    where: { code: "PCS" },
    update: {},
    create: { code: "PCS", name: "Pieces" },
  });

  // Warehouses
  const warehouse1 = await prisma.warehouse.upsert({
    where: { companyId_code: { companyId: companyA.id, code: "WH-01" } },
    update: {},
    create: {
      companyId: companyA.id,
      code: "WH-01",
      name: "Main Warehouse Jakarta",
      type: "warehouse",
      address: "Jl. Industri No. 123",
    },
  });

  const workshop1 = await prisma.warehouse.upsert({
    where: { companyId_code: { companyId: companyB.id, code: "WS-01" } },
    update: {},
    create: {
      companyId: companyB.id,
      code: "WS-01",
      name: "Workshop Utama",
      type: "workshop",
      address: "Jl. Workshop No. 456",
    },
  });

  // Customers
  const customer1 = await prisma.customer.upsert({
    where: { companyId_code: { companyId: companyA.id, code: "CUST-001" } },
    update: {},
    create: {
      companyId: companyA.id,
      code: "CUST-001",
      name: "PT Pertamina (Persero)",
      description: "Major Oil & Gas Customer",
      address: "Jl. Merdeka Barat No. 13",
      city: "Jakarta",
      province: "DKI Jakarta",
      country: "Indonesia",
      phone: "+62-21-7234567",
      email: "procurement@pertamina.co.id",
    },
  });

  // Suppliers
  const supplier1 = await prisma.supplier.upsert({
    where: { companyId_code: { companyId: companyA.id, code: "SUPP-001" } },
    update: {},
    create: {
      companyId: companyA.id,
      code: "SUPP-001",
      name: "CV Steel Works Indonesia",
      address: "Jl. Besi No. 789",
      city: "Tangerang",
      province: "Banten",
      country: "Indonesia",
      phone: "+62-21-5555666",
      email: "sales@steelworks.co.id",
    },
  });

  console.log("✅ Seeding completed successfully!");
  console.log("\n📝 Demo Credentials:");
  console.log("Email: admin@erp.local");
  console.log("Email: owner@ptaja.local");
  console.log("Email: sales@ptaja.local");
  console.log("Password: admin123");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
