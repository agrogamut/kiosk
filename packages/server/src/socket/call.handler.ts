import type { Server, Socket } from "socket.io";
import { prisma } from "../lib/prisma.js";
import { livekitService } from "../services/livekit.service.js";
import { completeCall } from "../services/call-completion.service.js";
import { requeueRingingCall } from "../services/call-queue.service.js";

export function registerCallHandlers(io: Server, socket: Socket, userId: string): void {
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

      socket.emit("call:accepted", { callSessionId, livekitToken: doctorToken, patientId: call.patientId });
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

      await requeueRingingCall(callSessionId, userId, call.patientId);
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

      await completeCall(callSessionId);
    } catch (error) {
      console.error("call:end error", error);
    }
  });
}
