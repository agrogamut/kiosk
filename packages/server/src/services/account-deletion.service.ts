import { prisma } from "../lib/prisma.js";
import { AppError } from "../middleware/error.middleware.js";

export async function anonymizeUser(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) {
    throw new AppError(404, "User not found");
  }

  if (Number(user.walletBalance) > 0) {
    throw new AppError(409, "Withdraw your wallet balance before deleting your account");
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        name: "Deleted User",
        phone: `deleted-${userId}`,
        pinHash: null,
        passwordHash: null,
        disabled: true,
        deletedAt: new Date(),
      },
    });

    await tx.patientProfile.updateMany({
      where: { userId },
      data: { heightCm: null, weightKg: null, bloodType: null, dob: null, gender: null, email: null },
    });
  });
}
