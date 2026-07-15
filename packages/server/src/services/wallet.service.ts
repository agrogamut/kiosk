import { prisma } from "../lib/prisma.js";
import { AppError } from "../middleware/error.middleware.js";

export async function getWalletBalance(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { walletBalance: true },
  });
  if (!user) {
    throw new AppError(404, "User not found");
  }

  return user.walletBalance;
}

export async function createWithdrawRequest(
  userId: string,
  amount: number,
  bankDetails: { bankName: string; accountNumber: string; ifsc: string; holderName: string },
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError(404, "User not found");
  }

  if (Number(user.walletBalance) < amount) {
    throw new AppError(400, "Insufficient wallet balance");
  }

  const pending = await prisma.walletTransaction.findFirst({
    where: { userId, type: "DEBIT", status: "PENDING" },
  });
  if (pending) {
    throw new AppError(409, "A withdrawal request is already pending");
  }

  return prisma.walletTransaction.create({
    data: {
      userId,
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
    include: { user: { select: { id: true, name: true, phone: true } } },
  });
}

export async function completeWithdrawal(transactionId: string) {
  return prisma.$transaction(async (tx) => {
    const txn = await tx.walletTransaction.findUnique({ where: { id: transactionId } });
    if (!txn || txn.type !== "DEBIT" || txn.status !== "PENDING") {
      throw new AppError(400, "Not a pending withdrawal request");
    }

    const user = await tx.user.findUnique({ where: { id: txn.userId } });
    if (!user || Number(user.walletBalance) < Number(txn.amount)) {
      throw new AppError(400, "User balance insufficient to complete withdrawal");
    }

    await tx.user.update({
      where: { id: txn.userId },
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
