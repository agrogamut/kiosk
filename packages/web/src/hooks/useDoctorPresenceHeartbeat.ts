import { useEffect } from "react";
import { getSocket } from "../lib/socket";

const HEARTBEAT_INTERVAL_MS = 20_000;

export function useDoctorPresenceHeartbeat(): void {
  useEffect(() => {
    getSocket().emit("presence:ping");
    const interval = setInterval(() => {
      getSocket().emit("presence:ping");
    }, HEARTBEAT_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);
}
