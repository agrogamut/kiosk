import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { PatientRegisterSchema, type PatientRegister } from "@madamgy/api-client";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";
import { useAuthStore } from "../../store/auth.store";

type RegisterInfo = Omit<PatientRegister, "pin" | "consent">;

function formatDateOfBirthInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) {
    return digits;
  }
  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }

  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export default function KioskRegister() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterInfo>({ resolver: zodResolver(PatientRegisterSchema.omit({ pin: true, consent: true })) });
  const dobRegistration = register("dob");

  async function submit(values: RegisterInfo): Promise<void> {
    setSubmitting(true);
    try {
      const response = await api.post("/auth/patient/register", { ...values, consent: true });
      setAuth(response.data.accessToken, response.data.user);
      navigate("/dashboard");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Registration failed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-8">
      <h2 className="text-4xl font-bold text-gray-900">Create Account</h2>
      <form onSubmit={handleSubmit(submit)} className="flex w-full flex-col gap-4">
        <input {...register("name")} placeholder="Full Name" className="w-full rounded-2xl border-2 p-5 text-xl" />
        {errors.name && <p className="text-red-500">{errors.name.message}</p>}
        <input
          {...register("phone")}
          placeholder="Phone Number"
          type="tel"
          className="w-full rounded-2xl border-2 p-5 text-xl"
        />
        {errors.phone && <p className="text-red-500">{errors.phone.message}</p>}
        <input
          {...dobRegistration}
          onChange={(event) => {
            event.target.value = formatDateOfBirthInput(event.target.value);
            void dobRegistration.onChange(event);
          }}
          type="text"
          placeholder="DD/MM/YYYY"
          autoComplete="bday"
          inputMode="numeric"
          maxLength={10}
          className="w-full rounded-2xl border-2 p-5 text-xl"
        />
        {errors.dob && <p className="text-red-500">{errors.dob.message}</p>}
        <label className="flex items-start gap-3 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            className="mt-1 h-5 w-5 shrink-0"
          />
          I consent to receiving a teleconsultation and understand my health data will be stored for this purpose.
        </label>
        <button
          type="submit"
          disabled={submitting || !consent}
          className="mt-4 w-full rounded-3xl bg-blue-600 py-5 text-2xl font-semibold text-white disabled:opacity-40"
        >
          {submitting ? "Creating account..." : "Register"}
        </button>
      </form>
    </div>
  );
}
