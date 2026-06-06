import { Worker } from "bullmq";
import type { Prisma } from "@prisma/client";
import { bullMqConnection } from "../lib/queues.js";
import { prisma } from "../lib/prisma.js";
import { io } from "../index.js";

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
          isApproved: true,
          userId: excludedDoctorIds.length > 0 ? { notIn: excludedDoctorIds } : undefined,
        };

        const availableDoctor = await tx.doctorProfile.findFirst({
          where,
          include: { user: true },
          orderBy: { approvedAt: "asc" },
        });
        if (!availableDoctor) {
          throw new Error("no_doctor");
        }

        await tx.doctorProfile.update({
          where: { id: availableDoctor.id, isAvailable: true },
          data: { isAvailable: false },
        });

        return availableDoctor;
      });

      const [patient, updatedCall] = await Promise.all([
        prisma.user.findUniqueOrThrow({
          where: { id: call.patientId },
          select: { id: true, name: true },
        }),
        prisma.callSession.update({
          where: { id: callSessionId },
          data: { doctorId: doctor.userId, status: "RINGING" },
        }),
      ]);

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

    io.to(`user:${call.patientId}`).emit("call:no_doctor_available", {
      callSessionId: job.data.callSessionId,
    });
  });
}
