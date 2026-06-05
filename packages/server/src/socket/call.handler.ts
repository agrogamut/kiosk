import type { Server, Socket } from "socket.io";
import type { Prisma } from "@prisma/client";
import { assignDoctorQueue } from "../lib/queues.js";
import { prisma } from "../lib/prisma.js";
import { livekitService } from "../services/livekit.service.js";

export function registerCallHandlers(
  io: Server,
  socket: Socket,
  userId: string,
  userRole: string,
): void {
  socket.on("call:accept", async ({ callSessionId }: { callSessionId: string }) => {
    try {
      const call = await prisma.callSession.findUnique({ where: { id: callSessionId } });
      if (!call || call.doctorId !== userId || call.status !== "RINGING") {
        return;
      }

      await prisma.callSession.update({
        where: { id: callSessionId },
        data: { status: "ACTIVE", startedAt: new Date() },
      });

      const [doctorToken, patientToken] = await Promise.all([
        livekitService.generateToken(call.livekitRoom, userId),
        livekitService.generateToken(call.livekitRoom, call.patientId),
      ]);

      socket.emit("call:accepted", { callSessionId, livekitToken: doctorToken });
      io.to(`user:${call.patientId}`).emit("call:accepted", {
        callSessionId,
        livekitToken: patientToken,
      });
    } catch (error) {
      console.error("call:accept error", error);
    }
  });

  socket.on("call:reject", async ({ callSessionId }: { callSessionId: string }) => {
    try {
      const call = await prisma.callSession.findUnique({ where: { id: callSessionId } });
      if (!call || call.doctorId !== userId || call.status !== "RINGING") {
        return;
      }

      await prisma.$transaction([
        prisma.callSession.update({
          where: { id: callSessionId },
          data: { doctorId: null, status: "QUEUED" },
        }),
        prisma.doctorProfile.update({ where: { userId }, data: { isAvailable: true } }),
      ]);

      io.to(`user:${call.patientId}`).emit("call:rejected", { callSessionId });
      await assignDoctorQueue.add(
        "assign",
        { callSessionId, excludedDoctorIds: [userId] },
        { attempts: 1, backoff: { type: "fixed", delay: 5_000 } },
      );
    } catch (error) {
      console.error("call:reject error", error);
    }
  });

  socket.on("call:end", async ({ callSessionId }: { callSessionId: string }) => {
    try {
      const call = await prisma.callSession.findUnique({ where: { id: callSessionId } });
      if (!call || (call.patientId !== userId && call.doctorId !== userId)) {
        return;
      }
      if (!["QUEUED", "RINGING", "ACTIVE"].includes(call.status)) {
        return;
      }

      const operations: Prisma.PrismaPromise<unknown>[] = [
        prisma.callSession.update({
          where: { id: callSessionId },
          data: { status: "ENDED", endedAt: new Date() },
        }),
      ];
      if (call.doctorId) {
        operations.push(
          prisma.doctorProfile.update({
            where: { userId: call.doctorId },
            data: { isAvailable: true },
          }),
        );
      }
      await prisma.$transaction(operations);

      io.to(`user:${call.patientId}`).emit("call:ended", { callSessionId });
      if (call.doctorId) {
        io.to(`user:${call.doctorId}`).emit("call:ended", { callSessionId });
      }
    } catch (error) {
      console.error("call:end error", error);
    }
  });

  socket.on("doctor:toggle_available", async ({ isAvailable }: { isAvailable: boolean }) => {
    if (userRole !== "DOCTOR") {
      return;
    }

    try {
      await prisma.doctorProfile.update({ where: { userId }, data: { isAvailable } });
    } catch (error) {
      console.error("doctor:toggle_available error", error);
    }
  });
}
