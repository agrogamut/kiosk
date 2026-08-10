import { assignDoctorQueue } from "../lib/queues.js";
import { prisma } from "../lib/prisma.js";
import { io } from "../index.js";

export async function requeueRingingCall(callSessionId: string, doctorId: string, patientId: string): Promise<void> {
  await prisma.$transaction([
    prisma.callSession.update({
      where: { id: callSessionId },
      data: { doctorId: null, status: "QUEUED" },
    }),
    prisma.doctorProfile.update({ where: { userId: doctorId }, data: { isAvailable: true } }),
  ]);

  io.to(`user:${patientId}`).emit("call:rejected", { callSessionId });
  // The doctor is losing this call -- either they never answered and the ring timed out, or they
  // rejected it. Their dashboard is still showing the incoming-call card, and accepting it now
  // would be refused by the server since the call is back to QUEUED, so tell them it's gone.
  io.to(`user:${doctorId}`).emit("call:ended", { callSessionId });
  await assignDoctorQueue.add(
    "assign",
    { callSessionId, excludedDoctorIds: [doctorId] },
    {
      // Reuses the callSessionId as the jobId (see calls.routes.ts/presence.handler.ts) so a
      // stray nudge can't create a rival job for this new round. removeOnComplete/removeOnFail
      // are what make that reuse actually work across rounds: BullMQ keeps a finished job's key
      // in Redis forever otherwise, which would make this add() silently no-op as a "duplicate"
      // against the round that already finished.
      jobId: callSessionId,
      attempts: 1,
      backoff: { type: "fixed", delay: 5_000 },
      removeOnComplete: true,
      removeOnFail: true,
    },
  );
}
