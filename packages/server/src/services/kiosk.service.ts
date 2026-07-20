import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../middleware/error.middleware.js";

export async function registerKioskDevice(adminId: string, deviceId: string, label?: string) {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const existing = await tx.kiosk.findUnique({ where: { deviceId } });

        if (existing && existing.active && existing.adminId !== adminId) {
          throw new AppError(409, "Device already registered to another admin");
        }

        return tx.kiosk.upsert({
          where: { deviceId },
          create: { deviceId, adminId, label, active: true },
          update: { adminId, label, active: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      throw new AppError(409, "Device already registered to another admin");
    }
    throw error;
  }
}

export async function listKioskDevicesForAdmin(adminId: string) {
  return prisma.kiosk.findMany({ where: { adminId }, orderBy: { createdAt: "desc" } });
}

export async function deactivateKioskDevice(adminId: string, deviceId: string) {
  const existing = await prisma.kiosk.findUnique({ where: { deviceId } });
  if (!existing || existing.adminId !== adminId) {
    throw new AppError(404, "Kiosk device not found for this admin");
  }

  return prisma.kiosk.update({ where: { deviceId }, data: { active: false } });
}

export async function forceDeactivateKioskDevice(deviceId: string) {
  const existing = await prisma.kiosk.findUnique({ where: { deviceId } });
  if (!existing) {
    throw new AppError(404, "Kiosk device not found");
  }

  return prisma.kiosk.update({ where: { deviceId }, data: { active: false } });
}

export async function resolveAssistingAdmin(deviceId?: string): Promise<string | null> {
  if (!deviceId) {
    return null;
  }

  const kiosk = await prisma.kiosk.findUnique({ where: { deviceId } });
  if (!kiosk || !kiosk.active) {
    return null;
  }

  return kiosk.adminId;
}
