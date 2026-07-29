import { create } from "zustand";
import { persist } from "zustand/middleware";

const DEVICE_ID_STORAGE_KEY = "madamgy-kiosk-device-id";

function getOrCreateDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (existing) {
    return existing;
  }
  const generated = crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_STORAGE_KEY, generated);
  return generated;
}

interface KioskState {
  deviceId: string;
  locked: boolean;
  lock: () => void;
  unlock: () => void;
}

export const useKioskStore = create<KioskState>()(
  persist(
    (set) => ({
      deviceId: getOrCreateDeviceId(),
      locked: false,
      lock: () => set({ locked: true }),
      unlock: () => set({ locked: false }),
    }),
    {
      name: "madamgy-kiosk",
      partialize: (state) => ({ locked: state.locked }),
    },
  ),
);
