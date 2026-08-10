import { Worker } from "bullmq";
import type { Prisma } from "@prisma/client";
import { bullMqConnection } from "../lib/queues.js";
import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";
import { io } from "../index.js";
import { refundPayment } from "../services/payment.service.js";

interface AssignDoctorJobData {
  callSessionId: string;
  excludedDoctorIds?: string[];
}

export function startAssignDoctorWorker(): Worker<AssignDoctorJobData> {
  return new Worker<AssignDoctorJobData>(
    "assign-doctor",
    async (job) => {
      const { callSessionId, excludedDoctorIds = [] } = job.data;
      const call = await prisma.callSession.findUnique({ where: { id: callSessionId } });
      if (!call || call.status !== "QUEUED") {
        return;
      }

      const doctor = await prisma.$transaction(async (tx) => {
        const where: Prisma.DoctorProfileWhereInput = {
          isAvailable: true,
          isOnDuty: true,
          isApproved: true,
          userId: excludedDoctorIds.length > 0 ? { notIn: excludedDoctorIds } : undefined,
        };

        const candidates = await tx.doctorProfile.findMany({
          where,
          include: { user: true },
          orderBy: { approvedAt: "asc" },
        });

        for (const candidate of candidates) {
          // isAvailable can go stale (e.g. a crashed tab that never fired a clean disconnect),
          // so only hand a call to a doctor whose presence heartbeat is still fresh.
          const heartbeat = await redis.get(`doctor_heartbeat:${candidate.userId}`);
          if (!heartbeat) {
            continue;
          }

          const updated = await tx.doctorProfile.updateMany({
            where: { id: candidate.id, isAvailable: true },
            data: { isAvailable: false },
          });
          if (updated.count === 1) {
            return candidate;
          }
        }

        throw new Error("no_doctor");
      });

      // Guard against a duplicate job (e.g. two concurrent assign-doctor runs racing on a stale
      // "still QUEUED" read from above) claiming a doctor and then overwriting a call another job
      // already moved on: only commit if the row is still QUEUED, and release the doctor we just
      // claimed if it isn't.
      const [patient, claimed] = await Promise.all([
        prisma.user.findUniqueOrThrow({
          where: { id: call.patientId },
          select: { id: true, name: true },
        }),
        prisma.callSession.updateMany({
          where: { id: callSessionId, status: "QUEUED" },
          data: { doctorId: doctor.userId, status: "RINGING", ringingAt: new Date() },
        }),
      ]);

      if (claimed.count === 0) {
        await prisma.doctorProfile.update({ where: { userId: doctor.userId }, data: { isAvailable: true } });
        return;
      }

      const updatedCall = { ...call, doctorId: doctor.userId, status: "RINGING" as const, ringingAt: new Date() };

      io.to(`user:${call.patientId}`).emit("call:ringing", { callSession: updatedCall });
      io.to(`user:${doctor.userId}`).emit("call:incoming", { callSession: updatedCall, patient });
    },
    { connection: bullMqConnection, concurrency: 5 },
  );
}

export function handleAssignDoctorFailed(worker: Worker<AssignDoctorJobData>): void {
  worker.on("failed", async (job, error) => {
    if (!job || error.message !== "no_doctor") {
      return;
    }

    const attempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < attempts) {
      return;
    }

    const call = await prisma.callSession.update({
      where: { id: job.data.callSessionId },
      data: { status: "NO_DOCTOR" },
    });

    const payment = await prisma.payment.findUnique({ where: { callSessionId: job.data.callSessionId } });
    if (payment && payment.status === "PAID") {
      await refundPayment(payment.id).catch((refundError: unknown) => {
        console.error("auto-refund failed for callSession", job.data.callSessionId, refundError);
      });
    }

    io.to(`user:${call.patientId}`).emit("call:no_doctor_available", {
      callSessionId: job.data.callSessionId,
    });
  });
}
