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

export async function listPendingWithdrawals() {
  return prisma.walletTransaction.findMany({
    where: { type: "DEBIT", status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: { doctor: { select: { id: true, name: true, phone: true } } },
  });
}

export async function completeWithdrawal(transactionId: string) {
  return prisma.$transaction(async (tx) => {
    const txn = await tx.walletTransaction.findUnique({ where: { id: transactionId } });
    if (!txn || txn.type !== "DEBIT" || txn.status !== "PENDING") {
      throw new AppError(400, "Not a pending withdrawal request");
    }

    const profile = await tx.doctorProfile.findUnique({ where: { userId: txn.doctorId } });
    if (!profile || Number(profile.walletBalance) < Number(txn.amount)) {
      throw new AppError(400, "Doctor balance insufficient to complete withdrawal");
    }

    await tx.doctorProfile.update({
      where: { userId: txn.doctorId },
      data: { walletBalance: { decrement: txn.amount } },
    });

    return tx.walletTransaction.update({ where: { id: transactionId }, data: { status: "COMPLETED" } });
  });
}

export async function rejectWithdrawal(transactionId: string) {
  const txn = await prisma.walletTransaction.findUnique({ where: { id: transactionId } });
  if (!txn || txn.type !== "DEBIT" || txn.status !== "PENDING") {
    throw new AppError(400, "Not a pending withdrawal request");
  }

  return prisma.walletTransaction.update({ where: { id: transactionId }, data: { status: "FAILED" } });
}
