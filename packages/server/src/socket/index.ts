import type { Server, Socket } from "socket.io";
import { prisma } from "../lib/prisma.js";
import { verifyAccessToken } from "../services/auth.service.js";
import { registerCallHandlers } from "./call.handler.js";
import { registerChatHandlers } from "./chat.handler.js";
import { registerPresenceHandlers } from "./presence.handler.js";

export function initSocketHandlers(io: Server): void {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (typeof token !== "string") {
        next(new Error("Unauthorized"));
        return;
      }

      const payload = verifyAccessToken(token);
      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || user.disabled) {
        next(new Error("Unauthorized"));
        return;
      }

      socket.data.userId = user.id;
      socket.data.userRole = user.role;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const userId = socket.data.userId as string;
    const userRole = socket.data.userRole as string;

    socket.join(`user:${userId}`);
    if (userRole === "ADMIN" || userRole === "SUPER_ADMIN") {
      socket.join("admins");
    }

    registerCallHandlers(io, socket, userId);
    registerChatHandlers(io, socket, userId);
    registerPresenceHandlers(socket, userId, userRole);

    // Disconnect marks a doctor unavailable (below); nothing previously reversed that on the
    // next reconnect, so any doctor who ever lost their connection -- a closed tab, a reload, a
    // network blip -- stayed permanently unassignable with no recovery path anywhere in the
    // product. Restore availability here, mirroring the disconnect handler.
    if (userRole === "DOCTOR") {
      prisma.doctorProfile
        .updateMany({ where: { userId, isAvailable: false }, data: { isAvailable: true } })
        .catch((error: unknown) => console.error(error));
    }

    socket.on("disconnect", () => {
      if (userRole !== "DOCTOR") {
        return;
      }

      prisma.doctorProfile
        .updateMany({ where: { userId, isAvailable: true }, data: { isAvailable: false } })
        .catch((error: unknown) => console.error(error));
    });
  });
}
