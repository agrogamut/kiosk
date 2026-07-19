import { prisma } from "../lib/prisma.js";
import { io } from "../index.js";
import { getRevenueConfig } from "./revenue-config.service.js";

const ACTIVE_STATUSES = ["QUEUED", "RINGING", "ACTIVE"];

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
      const existingCredit = await tx.walletTransaction.findFirst({
        where: { callSessionId, type: "CREDIT" },
      });
      if (!existingCredit) {
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
        await tx.walletTransaction.create({
          data: {
            userId: call.doctorId,
            callSessionId,
            amount: doctorEarning,
            type: "CREDIT",
            status: "COMPLETED",
            description: `Consultation fee - ${callSessionId}`,
          },
        });
        await tx.user.update({
          where: { id: call.doctorId },
          data: { walletBalance: { increment: doctorEarning } },
        });

        if (call.assistingAdminId) {
          const adminEarning = Number((fee * adminPct / 100).toFixed(2));
          await tx.walletTransaction.create({
            data: {
              userId: call.assistingAdminId,
              callSessionId,
              amount: adminEarning,
              type: "CREDIT",
              status: "COMPLETED",
              description: `Kiosk attribution fee - ${callSessionId}`,
            },
          });
          await tx.user.update({
            where: { id: call.assistingAdminId },
            data: { walletBalance: { increment: adminEarning } },
          });
        }
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
