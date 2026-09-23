import { PrismaClient } from "@prisma/client";
import { installAudit } from "./audit";
import { installAccountingSync } from "./accounting";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

installAudit(prisma);
installAccountingSync(prisma);

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
