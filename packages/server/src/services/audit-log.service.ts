import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export async function recordAuditLog(
  actorId: string,
  action: string,
  targetId?: string,
  metadata?: Prisma.InputJsonValue,
): Promise<void> {
  await prisma.auditLog.create({ data: { actorId, action, targetId, metadata } });
}
