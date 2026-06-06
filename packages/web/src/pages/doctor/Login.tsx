import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";
import { useAuthStore } from "../../store/auth.store";

interface LoginResponse {
  accessToken: string;
  user: { id: string; name: string; role: "DOCTOR" };
}

export default function DoctorLogin() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [submitting, setSubmitting] = useState(false);

  async function initiate(): Promise<void> {
    setSubmitting(true);
    try {
      await api.post("/auth/doctor/login/initiate", { phone, password });
      setStep("otp");
      toast.success("OTP sent");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Login failed"));
    } finally {
      setSubmitting(false);
    }
  }

  async function verify(): Promise<void> {
    setSubmitting(true);
    try {
      const response = await api.post<LoginResponse>("/auth/doctor/login/verify", { phone, otp });
      setAuth(response.data.accessToken, response.data.user);
      navigate("/doctor");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "OTP verification failed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-blue-50 p-8">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm">
        <h1 className="mb-2 text-3xl font-bold text-blue-950">Doctor Login</h1>
        <p className="mb-6 text-blue-700">Use OTP 000000 in local development.</p>
        {step === "credentials" ? (
          <div className="flex flex-col gap-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-600">Phone</span>
              <input value={phone} onChange={(event) => setPhone(event.target.value)} type="tel" className="w-full rounded-xl border-2 p-3" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-600">Password</span>
              <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" className="w-full rounded-xl border-2 p-3" />
            </label>
            <button type="button" disabled={submitting || phone.length < 10 || password.length === 0} onClick={() => void initiate()} className="rounded-xl bg-blue-600 py-4 font-semibold text-white disabled:opacity-50">
              {submitting ? "Sending..." : "Send OTP"}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-600">OTP</span>
              <input value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" className="w-full rounded-xl border-2 p-3 text-center text-2xl tracking-widest" />
            </label>
            <button type="button" disabled={submitting || otp.length !== 6} onClick={() => void verify()} className="rounded-xl bg-blue-600 py-4 font-semibold text-white disabled:opacity-50">
              {submitting ? "Verifying..." : "Verify and Login"}
            </button>
            <button type="button" onClick={() => setStep("credentials")} className="text-sm font-semibold text-blue-700">
              Change phone or password
            </button>
          </div>
        )}
        <p className="mt-6 text-center text-sm text-gray-600">
          Need approval? <Link to="/doctor/register" className="font-semibold text-blue-700">Register</Link>
        </p>
      </div>
    </div>
  );
}
