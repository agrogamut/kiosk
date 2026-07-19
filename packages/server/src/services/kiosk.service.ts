import { prisma } from "../lib/prisma.js";
import { AppError } from "../middleware/error.middleware.js";

export async function registerKioskDevice(adminId: string, deviceId: string, label?: string) {
  const existing = await prisma.kiosk.findUnique({ where: { deviceId } });

  if (existing && existing.active && existing.adminId !== adminId) {
    throw new AppError(409, "Device already registered to another admin");
  }

  return prisma.kiosk.upsert({
    where: { deviceId },
    create: { deviceId, adminId, label, active: true },
    update: { adminId, label, active: true },
  });
}

export async function deactivateKioskDevice(adminId: string, deviceId: string) {
  const existing = await prisma.kiosk.findUnique({ where: { deviceId } });
  if (!existing || existing.adminId !== adminId) {
    throw new AppError(404, "Kiosk device not found for this admin");
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
