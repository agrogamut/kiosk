import { prisma } from "../lib/prisma.js";
import { AppError } from "../middleware/error.middleware.js";

export async function getRevenueConfig() {
  const config = await prisma.revenueConfig.findFirst();
  if (!config) {
    throw new AppError(500, "Revenue config not seeded");
  }
  return config;
}

export async function updateRevenueConfig(
  updatedById: string,
  data: { consultationFee: number; doctorPct: number; adminPct: number; superAdminPct: number },
) {
  const sum = data.doctorPct + data.adminPct + data.superAdminPct;
  if (sum !== 100) {
    throw new AppError(400, "Split percentages must sum to 100");
  }

  const existing = await getRevenueConfig();
  return prisma.revenueConfig.update({
    where: { id: existing.id },
    data: { ...data, updatedById },
  });
}
