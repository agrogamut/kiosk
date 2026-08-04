import { Prisma, type CallStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { io } from "../index.js";
import { getRevenueConfig } from "./revenue-config.service.js";

function isDuplicateCreditError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export const ACTIVE_STATUSES: CallStatus[] = ["QUEUED", "RINGING", "ACTIVE"];

type Tx = Prisma.TransactionClient;

// The `@@unique([callSessionId, userId, type])` constraint on WalletTransaction is the real
// guard here: completeCall() can be triggered concurrently from the call:end socket handler,
// the prescription PDF worker, and the stale-call reaper, so the DB constraint -- not this
// in-memory check -- is what prevents a doctor/admin from being credited twice for one call.
async function creditWalletOnce(tx: Tx, params: { userId: string; callSessionId: string; amount: number; description: string }): Promise<void> {
  try {
    await tx.walletTransaction.create({
      data: {
        userId: params.userId,
        callSessionId: params.callSessionId,
        amount: params.amount,
        type: "CREDIT",
        status: "COMPLETED",
        description: params.description,
      },
    });
  } catch (error) {
    if (isDuplicateCreditError(error)) {
      return;
    }
    throw error;
  }

  await tx.user.update({
    where: { id: params.userId },
    data: { walletBalance: { increment: params.amount } },
  });
}

export async function completeCall(callSessionId: string): Promise<void> {
  const result = await prisma.$transaction(async (tx) => {
    const call = await tx.callSession.findUnique({ where: { id: callSessionId } });
    if (!call || !ACTIVE_STATUSES.includes(call.status)) {
      return null;
    }

    const wasActive = call.status === "ACTIVE";

    await tx.callSession.update({
      where: { id: callSessionId },
      data: { status: "ENDED", endedAt: new Date() },
    });

    if (!call.doctorId) {
      return { patientId: call.patientId, doctorId: null as string | null };
    }

    await tx.doctorProfile.update({
      where: { userId: call.doctorId },
      data: { isAvailable: true },
    });

    if (wasActive) {
      const payment = await tx.payment.findUnique({ where: { callSessionId } });

      let fee: number;
      let doctorPct: number;
      let adminPct: number;

      if (payment && payment.doctorPct !== null && payment.adminPct !== null) {
        fee = Number(payment.amount);
        doctorPct = Number(payment.doctorPct);
        adminPct = Number(payment.adminPct);
      } else {
        const config = await getRevenueConfig();
        fee = Number(config.consultationFee);
        doctorPct = Number(config.doctorPct);
        adminPct = Number(config.adminPct);
      }

      const doctorEarning = Number((fee * doctorPct / 100).toFixed(2));
      await creditWalletOnce(tx, {
        userId: call.doctorId,
        callSessionId,
        amount: doctorEarning,
        description: `Consultation fee - ${callSessionId}`,
      });

      if (call.assistingAdminId) {
        const adminEarning = Number((fee * adminPct / 100).toFixed(2));
        await creditWalletOnce(tx, {
          userId: call.assistingAdminId,
          callSessionId,
          amount: adminEarning,
          description: `Kiosk attribution fee - ${callSessionId}`,
        });
      }
    }

    return { patientId: call.patientId, doctorId: call.doctorId as string | null };
  });

  if (!result) {
    return;
  }

  io.to(`user:${result.patientId}`).emit("call:ended", { callSessionId });
  if (result.doctorId) {
    io.to(`user:${result.doctorId}`).emit("call:ended", { callSessionId });
  }
}
