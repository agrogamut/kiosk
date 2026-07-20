import { useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { NumPad } from "../../components/kiosk/NumPad";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";
import { useAuthStore } from "../../store/auth.store";

interface LoginResponse {
  accessToken: string;
  user: { id: string; name: string; role: "PATIENT" };
}

export default function KioskLogin() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [submitting, setSubmitting] = useState(false);

  async function initiate(): Promise<void> {
    setSubmitting(true);
    try {
      await api.post("/auth/patient/login/otp/initiate", { phone });
      setStep("otp");
      toast.success("OTP sent");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to send OTP"));
    } finally {
      setSubmitting(false);
    }
  }

  async function verify(): Promise<void> {
    setSubmitting(true);
    try {
      const response = await api.post<LoginResponse>("/auth/patient/login/otp/verify", { phone, otp });
      setAuth(response.data.accessToken, response.data.user);
      navigate("/dashboard");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "OTP verification failed"));
      setOtp("");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "phone") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
        <h2 className="text-center text-4xl font-bold">Enter Phone Number</h2>
        <input
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="10-digit phone number"
          type="tel"
          className="w-full max-w-sm rounded-2xl border-2 p-5 text-center text-2xl"
        />
        <button
          type="button"
          disabled={submitting || phone.length < 10}
          onClick={() => void initiate()}
          className="rounded-3xl bg-blue-600 px-12 py-5 text-2xl font-semibold text-white disabled:opacity-40"
        >
          {submitting ? "Sending..." : "Send OTP"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <h2 className="text-center text-4xl font-bold">Enter OTP</h2>
      <NumPad value={otp} onChange={setOtp} maxLength={6} />
      <button
        type="button"
        disabled={submitting || otp.length !== 6}
        onClick={() => void verify()}
        className="rounded-3xl bg-blue-600 px-12 py-5 text-2xl font-semibold text-white disabled:opacity-40"
      >
        {submitting ? "Verifying..." : "Login"}
      </button>
      <button type="button" onClick={() => setStep("phone")} className="text-sm font-semibold text-blue-700">
        Change phone number
      </button>
    </div>
  );
}
