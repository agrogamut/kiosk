import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { useAuthStore, type AuthUser } from "../store/auth.store";

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

const baseURL = import.meta.env.VITE_API_URL ?? "/api";

export const api = axios.create({ baseURL, withCredentials: true });
const refreshClient = axios.create({ baseURL, withCredentials: true });

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshInFlight: Promise<string> | null = null;

/**
 * Exchanges the refresh cookie for a new access token, or signs the user out and throws.
 *
 * The access token is never persisted (see auth.store.ts), so every page load starts without one
 * and both the HTTP interceptor below and the socket (lib/socket.ts) need a way to get it back.
 * Callers that arrive while a refresh is already running share it rather than racing their own.
 */
export function refreshAccessToken(): Promise<string> {
  refreshInFlight ??= (async () => {
    try {
      const response = await refreshClient.post<{ accessToken: string; user: AuthUser }>("/auth/refresh");
      const previousUserId = useAuthStore.getState().user?.id;
      useAuthStore.getState().setAuth(response.data.accessToken, response.data.user);

      if (previousUserId && previousUserId !== response.data.user.id) {
        // A different account authenticated in another tab and overwrote the shared refresh cookie.
        throw new Error("Refresh cookie belongs to a different account");
      }

      return response.data.accessToken;
    } catch (error) {
      useAuthStore.getState().logout();
      throw error;
    }
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;
    if (error.response?.status === 401 && config && !config._retry) {
      config._retry = true;
      try {
        const accessToken = await refreshAccessToken();
        config.headers.Authorization = `Bearer ${accessToken}`;
        return api(config);
      } catch {
        // refreshAccessToken has already signed the user out.
      }
    }

    return Promise.reject(error);
  },
);
