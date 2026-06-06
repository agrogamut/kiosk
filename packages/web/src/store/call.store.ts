import { create } from "zustand";
import type { CallSession } from "@madamgy/api-client";

interface CallState {
  callSession: CallSession | null;
  livekitToken: string | null;
  setCall: (callSession: CallSession) => void;
  setCallStatus: (status: CallSession["status"]) => void;
  setLivekitToken: (livekitToken: string) => void;
  clearCall: () => void;
}

export const useCallStore = create<CallState>((set) => ({
  callSession: null,
  livekitToken: null,
  setCall: (callSession) => set({ callSession }),
  setCallStatus: (status) => set((state) => ({ callSession: state.callSession ? { ...state.callSession, status } : null })),
  setLivekitToken: (livekitToken) => set({ livekitToken }),
  clearCall: () => set({ callSession: null, livekitToken: null }),
}));
