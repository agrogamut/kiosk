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
  await assignDoctorQueue.add(
    "assign",
    { callSessionId, excludedDoctorIds: [doctorId] },
    { attempts: 1, backoff: { type: "fixed", delay: 5_000 } },
  );
}
