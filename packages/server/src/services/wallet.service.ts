import { prisma } from "../lib/prisma.js";
import { AppError } from "../middleware/error.middleware.js";

export async function getWalletBalance(doctorId: string) {
  const profile = await prisma.doctorProfile.findUnique({
    where: { userId: doctorId },
    select: { walletBalance: true },
  });
  if (!profile) {
    throw new AppError(404, "Doctor profile not found");
  }

  return profile.walletBalance;
}

export async function createWithdrawRequest(
  doctorId: string,
  amount: number,
  bankDetails: { bankName: string; accountNumber: string; ifsc: string; holderName: string },
) {
  const profile = await prisma.doctorProfile.findUnique({ where: { userId: doctorId } });
  if (!profile) {
    throw new AppError(404, "Doctor profile not found");
  }

  if (Number(profile.walletBalance) < amount) {
    throw new AppError(400, "Insufficient wallet balance");
  }

  const pending = await prisma.walletTransaction.findFirst({
    where: { doctorId, type: "DEBIT", status: "PENDING" },
  });
  if (pending) {
    throw new AppError(409, "A withdrawal request is already pending");
  }

  return prisma.walletTransaction.create({
    data: {
      doctorId,
      amount,
      type: "DEBIT",
      status: "PENDING",
      description: `Withdrawal to ${bankDetails.bankName} ${bankDetails.accountNumber}`,
    },
  });
}
