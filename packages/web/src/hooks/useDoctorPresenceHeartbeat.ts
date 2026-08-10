import { useEffect } from "react";
import { connectSocket, getSocket } from "../lib/socket";

const HEARTBEAT_INTERVAL_MS = 20_000;

/**
 * Keeps the doctor reachable for call assignment.
 *
 * assign-doctor.worker skips any doctor without a fresh `doctor_heartbeat:<id>` key in Redis, and
 * that key expires 45s after the last ping. So this is not a nicety -- a doctor who stops pinging
 * is passed over for every incoming call while still showing as online, on duty and available,
 * with nothing anywhere to indicate why the calls stopped arriving. Mount it for the whole of a
 * doctor's session, not per page.
 *
 * connectSocket rather than getSocket because a ping emitted on a socket that has never connected
 * is only buffered, and the ping is the one thing that has to actually reach the server; the
 * re-ping on `connect` covers a reconnect that outlasted the key's TTL, which would otherwise
 * leave the doctor unreachable until the next interval tick.
 */
export function useDoctorPresenceHeartbeat(): void {
  useEffect(() => {
    const socket = connectSocket();
    const ping = (): void => {
      getSocket().emit("presence:ping");
    };

    ping();
    socket.on("connect", ping);
    const interval = setInterval(ping, HEARTBEAT_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      socket.off("connect", ping);
    };
  }, []);
}
