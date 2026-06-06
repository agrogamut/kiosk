import { api } from "./api";
import { disconnectSocket } from "./socket";
import { useAuthStore } from "../store/auth.store";
import { useCallStore } from "../store/call.store";

export async function logout(): Promise<void> {
  try {
    await api.post("/auth/logout");
  } finally {
    disconnectSocket();
    useCallStore.getState().clearCall();
    useAuthStore.getState().logout();
  }
}
