import { useEffect } from "react";
import type { Socket } from "socket.io-client";
import { connectSocket, disconnectSocket, getSocket } from "../lib/socket";

export function useSocket(): Socket {
  useEffect(() => {
    connectSocket();
    return () => {
      disconnectSocket();
    };
  }, []);

  return getSocket();
}
