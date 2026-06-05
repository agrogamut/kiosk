import { io, type Socket } from "socket.io-client";
import { useAuthStore } from "../store/auth.store";

let socket: Socket | null = null;

export function getSocket(): Socket {
  const token = useAuthStore.getState().accessToken;
  if (!socket) {
    socket = io(import.meta.env.VITE_SOCKET_URL ?? "", {
      auth: { token },
      autoConnect: false,
    });
  } else {
    socket.auth = { token };
  }

  return socket;
}

export function connectSocket(): Socket {
  const activeSocket = getSocket();
  if (!activeSocket.connected) {
    activeSocket.connect();
  }

  return activeSocket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
