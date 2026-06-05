import type { Server, Socket } from "socket.io";
import { SendChatSchema } from "@madamgy/api-client";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export function registerChatHandlers(io: Server, socket: Socket, userId: string): void {
  socket.on("chat:send", async (rawData: unknown) => {
    try {
      const data = SendChatSchema.parse(rawData);
      const call = await prisma.callSession.findUnique({ where: { id: data.callSessionId } });
      if (!call || call.status !== "ACTIVE") {
        return;
      }
      if (call.patientId !== userId && call.doctorId !== userId) {
        return;
      }

      const messageData: Prisma.ChatMessageUncheckedCreateInput = {
        callSessionId: data.callSessionId,
        senderId: userId,
        type: data.type,
      };
      if (data.type === "TEXT") {
        messageData.content = data.content;
      } else if (data.type === "IMAGE") {
        messageData.imageKey = data.imageKey;
      } else {
        messageData.vitals = data.vitals as Prisma.InputJsonValue;
      }

      const message = await prisma.chatMessage.create({
        data: messageData,
        include: { sender: { select: { id: true, name: true } } },
      });

      io.to(`user:${call.patientId}`).emit("chat:message", message);
      if (call.doctorId) {
        io.to(`user:${call.doctorId}`).emit("chat:message", message);
      }
    } catch (error) {
      console.error("chat:send error", error);
    }
  });
}
