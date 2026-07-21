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

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;
    if (error.response?.status === 401 && config && !config._retry) {
      config._retry = true;
      try {
        const response = await refreshClient.post<{ accessToken: string; user: AuthUser }>("/auth/refresh");
        const previousUserId = useAuthStore.getState().user?.id;
        useAuthStore.getState().setAuth(response.data.accessToken, response.data.user);

        if (previousUserId && previousUserId !== response.data.user.id) {
          // A different account authenticated in another tab and overwrote the shared refresh cookie.
          useAuthStore.getState().logout();
          return Promise.reject(error);
        }

        config.headers.Authorization = `Bearer ${response.data.accessToken}`;
        return api(config);
      } catch {
        useAuthStore.getState().logout();
      }
    }

    return Promise.reject(error);
  },
);
