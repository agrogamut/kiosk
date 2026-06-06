import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { AdminLoginSchema, type AdminLogin } from "@madamgy/api-client";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";
import { useAuthStore } from "../../store/auth.store";

interface LoginResponse {
  accessToken: string;
  user: { id: string; name: string; role: "ADMIN" };
}

export default function AdminLogin() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AdminLogin>({ resolver: zodResolver(AdminLoginSchema) });

  async function submit(data: AdminLogin): Promise<void> {
    setSubmitting(true);
    try {
      const response = await api.post<LoginResponse>("/auth/admin/login", data);
      setAuth(response.data.accessToken, response.data.user);
      navigate("/admin");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Login failed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-8">
      <form onSubmit={handleSubmit((data) => void submit(data))} className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-3xl font-bold text-slate-900">Admin Login</h1>
        <label className="mb-4 block">
          <span className="mb-1 block text-sm font-medium text-slate-600">Phone</span>
          <input {...register("phone")} type="tel" className="w-full rounded-xl border-2 p-3 text-lg" />
          {errors.phone && <p className="mt-1 text-sm text-red-500">{errors.phone.message}</p>}
        </label>
        <label className="mb-6 block">
          <span className="mb-1 block text-sm font-medium text-slate-600">Password</span>
          <input {...register("password")} type="password" className="w-full rounded-xl border-2 p-3 text-lg" />
          {errors.password && <p className="mt-1 text-sm text-red-500">{errors.password.message}</p>}
        </label>
        <button type="submit" disabled={submitting} className="w-full rounded-xl bg-slate-900 py-4 font-semibold text-white disabled:opacity-50">
          {submitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
