import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config();

function resolveCustdevDatabaseUrl(): string | undefined {
  return process.env.CUSTDEV_DATABASE_URL || process.env.DATABASE_URL;
}

const globalForCustdevPrisma = globalThis as unknown as {
  custdevPrisma: PrismaClient | undefined;
};

export const custdevPrisma =
  globalForCustdevPrisma.custdevPrisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: resolveCustdevDatabaseUrl(),
      },
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForCustdevPrisma.custdevPrisma = custdevPrisma;
}
