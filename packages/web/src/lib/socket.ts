import { io, type Socket } from "socket.io-client";
import { refreshAccessToken } from "./api";
import { useAuthStore } from "../store/auth.store";

/**
 * How many handshakes in a row the server may refuse before we stop re-authenticating. One retry
 * with a fresh token is normally all it takes; the cap only stops a refresh loop if the server
 * keeps refusing a token it has just issued.
 */
const MAX_AUTH_RETRIES = 3;

let socket: Socket | null = null;
let authRetries = 0;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(import.meta.env.VITE_SOCKET_URL ?? "", {
      // A function, not a value: socket.io calls it on every connection attempt. The old object
      // captured whatever token existed when the socket was built, and after a page load that is
      // always null -- the access token is deliberately not persisted -- so the handshake was
      // refused and the socket never heard another event.
      auth: (cb) => cb({ token: useAuthStore.getState().accessToken }),
      autoConnect: false,
    });

    const created = socket;
    created.on("connect", () => {
      authRetries = 0;
    });
    created.on("connect_error", () => {
      void reauthenticate(created);
    });
  }

  return socket;
}

/**
 * Brings a socket back after the server refused its handshake.
 *
 * socket.io destroys a socket whose handshake the server rejects and never retries it, unlike a
 * transport failure, which it retries on its own. Nothing else reconnected it either, so a patient
 * who reloaded while waiting for a doctor sat on "Finding available doctor..." for good -- their
 * call:accepted went to a socket that no longer existed, while the doctor waited alone in the
 * room -- and a doctor who reloaded their dashboard stopped sending presence pings and was never
 * rung again.
 */
async function reauthenticate(target: Socket): Promise<void> {
  // Still active means a transport failure, which socket.io is already retrying by itself.
  if (target.active || authRetries >= MAX_AUTH_RETRIES) {
    return;
  }
  authRetries += 1;

  try {
    await refreshAccessToken();
  } catch {
    // The session is gone and refreshAccessToken has signed the user out.
    return;
  }

  // Skip a socket that was discarded (logout) while the refresh was in flight.
  if (socket === target) {
    target.connect();
  }
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
  authRetries = 0;
}
