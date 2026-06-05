import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "../store/auth.store";

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
        const response = await refreshClient.post<{ accessToken: string }>("/auth/refresh");
        useAuthStore.getState().setAccessToken(response.data.accessToken);
        config.headers.Authorization = `Bearer ${response.data.accessToken}`;
        return api(config);
      } catch {
        useAuthStore.getState().logout();
      }
    }

    return Promise.reject(error);
  },
);
