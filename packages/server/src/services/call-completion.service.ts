import { prisma } from "../lib/prisma.js";
import { io } from "../index.js";

const CONSULTATION_FEE = Number(process.env.CONSULTATION_FEE ?? "200");
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
        const profile = await tx.doctorProfile.findUnique({ where: { userId: call.doctorId } });
        const commissionRate = Number(profile?.commissionRate ?? 0.8);
        const earning = Number((CONSULTATION_FEE * commissionRate).toFixed(2));
        await tx.walletTransaction.create({
          data: {
            doctorId: call.doctorId,
            callSessionId,
            amount: earning,
            type: "CREDIT",
            status: "COMPLETED",
            description: `Consultation fee - ${callSessionId}`,
          },
        });
        await tx.doctorProfile.update({
          where: { userId: call.doctorId },
          data: { walletBalance: { increment: earning } },
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
