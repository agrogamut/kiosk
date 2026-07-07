import type { Socket } from "socket.io";
import { redis } from "../lib/redis.js";

const HEARTBEAT_TTL_SECONDS = 45;

export function registerPresenceHandlers(socket: Socket, userId: string, userRole: string): void {
  socket.on("presence:ping", () => {
    socket.emit("presence:pong");
    if (userRole === "DOCTOR") {
      void redis.set(`doctor_heartbeat:${userId}`, "1", "EX", HEARTBEAT_TTL_SECONDS);
    }
  });
}
