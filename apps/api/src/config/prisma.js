import { PrismaClient } from '@prisma/client';
export const prisma=globalThis.__samsPrisma ?? new PrismaClient();
if(process.env.NODE_ENV!=='production') globalThis.__samsPrisma=prisma;
