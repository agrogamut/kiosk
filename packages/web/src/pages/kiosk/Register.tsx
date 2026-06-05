import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { PatientRegisterSchema, type PatientRegister } from "@madamgy/api-client";
import { NumPad } from "../../components/kiosk/NumPad";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";
import { useAuthStore } from "../../store/auth.store";

type RegisterInfo = Omit<PatientRegister, "pin">;

export default function KioskRegister() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [step, setStep] = useState<"info" | "pin" | "confirm">("info");

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<RegisterInfo>({ resolver: zodResolver(PatientRegisterSchema.omit({ pin: true })) });

  async function submit(): Promise<void> {
    if (pin !== confirmPin) {
      toast.error("PINs do not match");
      setStep("pin");
      setPin("");
      setConfirmPin("");
      return;
    }

    try {
      const response = await api.post("/auth/patient/register", { ...getValues(), pin });
      setAuth(response.data.accessToken, response.data.user);
      navigate("/dashboard");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Registration failed"));
    }
  }

  if (step === "info") {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-8">
        <h2 className="text-4xl font-bold text-gray-900">Create Account</h2>
        <form onSubmit={handleSubmit(() => setStep("pin"))} className="flex w-full flex-col gap-4">
          <input {...register("name")} placeholder="Full Name" className="w-full rounded-2xl border-2 p-5 text-xl" />
          {errors.name && <p className="text-red-500">{errors.name.message}</p>}
          <input
            {...register("phone")}
            placeholder="Phone Number"
            type="tel"
            className="w-full rounded-2xl border-2 p-5 text-xl"
          />
          {errors.phone && <p className="text-red-500">{errors.phone.message}</p>}
          <input {...register("dob")} type="date" className="w-full rounded-2xl border-2 p-5 text-xl" />
          {errors.dob && <p className="text-red-500">{errors.dob.message}</p>}
          <button type="submit" className="mt-4 w-full rounded-3xl bg-blue-600 py-5 text-2xl font-semibold text-white">
            Next
          </button>
        </form>
      </div>
    );
  }

  if (step === "pin") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
        <h2 className="text-center text-4xl font-bold">Choose a 4-digit PIN</h2>
        <NumPad value={pin} onChange={setPin} />
        <button
          type="button"
          disabled={pin.length < 4}
          onClick={() => setStep("confirm")}
          className="rounded-3xl bg-blue-600 px-12 py-5 text-2xl font-semibold text-white disabled:opacity-40"
        >
          Continue
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <h2 className="text-center text-4xl font-bold">Confirm PIN</h2>
      <NumPad value={confirmPin} onChange={setConfirmPin} />
      <button
        type="button"
        disabled={confirmPin.length < 4}
        onClick={() => void submit()}
        className="rounded-3xl bg-green-600 px-12 py-5 text-2xl font-semibold text-white disabled:opacity-40"
      >
        Register
      </button>
    </div>
  );
}
