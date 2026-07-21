import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserRole } from "@madamgy/api-client";

export interface AuthUser {
  id: string;
  name: string;
  role: UserRole;
}

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  setAuth: (accessToken: string, user: AuthUser) => void;
  setAccessToken: (accessToken: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      setAuth: (accessToken, user) => set({ accessToken, user }),
      setAccessToken: (accessToken) => set({ accessToken }),
      logout: () => set({ accessToken: null, user: null }),
    }),
    {
      name: "madamgy-auth",
      partialize: (state) => ({ user: state.user, accessToken: null }),
    },
  ),
);
