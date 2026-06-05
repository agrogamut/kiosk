import { useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { NumPad } from "../../components/kiosk/NumPad";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";
import { useAuthStore } from "../../store/auth.store";

export default function KioskLogin() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [step, setStep] = useState<"phone" | "pin">("phone");

  async function submit(): Promise<void> {
    try {
      const response = await api.post("/auth/patient/login", { phone, pin });
      setAuth(response.data.accessToken, response.data.user);
      navigate("/dashboard");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Login failed"));
      setPin("");
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
          disabled={phone.length < 10}
          onClick={() => setStep("pin")}
          className="rounded-3xl bg-blue-600 px-12 py-5 text-2xl font-semibold text-white disabled:opacity-40"
        >
          Next
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <h2 className="text-center text-4xl font-bold">Enter PIN</h2>
      <NumPad value={pin} onChange={setPin} />
      <button
        type="button"
        disabled={pin.length < 4}
        onClick={() => void submit()}
        className="rounded-3xl bg-blue-600 px-12 py-5 text-2xl font-semibold text-white disabled:opacity-40"
      >
        Login
      </button>
    </div>
  );
}
