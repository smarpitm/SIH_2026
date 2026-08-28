import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient across requests (global-cache pattern for dev hot-reload).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;