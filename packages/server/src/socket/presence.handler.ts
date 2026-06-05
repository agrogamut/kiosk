import type { Socket } from "socket.io";

export function registerPresenceHandlers(socket: Socket): void {
  socket.on("presence:ping", () => {
    socket.emit("presence:pong");
  });
}
