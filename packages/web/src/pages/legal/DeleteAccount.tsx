import { useState } from "react";
import toast from "react-hot-toast";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";

export default function DeleteAccount() {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"phone" | "otp" | "done">("phone");
  const [submitting, setSubmitting] = useState(false);

  async function initiate(): Promise<void> {
    setSubmitting(true);
    try {
      await api.post("/account/delete/initiate", { phone });
      setStep("otp");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Something went wrong"));
    } finally {
      setSubmitting(false);
    }
  }

  async function verify(): Promise<void> {
    setSubmitting(true);
    try {
      const payload: { phone: string; otp: string; password?: string } = { phone, otp };
      if (password) {
        payload.password = password;
      }
      await api.post("/account/delete/verify", payload);
      setStep("done");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Invalid or expired OTP"));
      setOtp("");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "done") {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900">Account deleted</h1>
        <p className="text-gray-600">
          Your MadamGy account and personal details have been removed. Any consultation or payment
          records tied to your account are retained only as required for medical record-keeping and
          financial audit.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-8">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-gray-900">Delete your MadamGy account</h1>
        <p className="text-gray-600">
          This permanently removes your name, contact details, and health profile from MadamGy. This
          cannot be undone. You don't need the app installed to do this.
        </p>
      </div>
      {step === "phone" ? (
        <div className="flex flex-col gap-4">
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="Phone number used to register"
            type="tel"
            className="w-full rounded-2xl border-2 p-4 text-lg"
          />
          <button
            type="button"
            disabled={submitting || phone.length < 10}
            onClick={() => void initiate()}
            className="rounded-2xl bg-red-600 py-4 text-lg font-semibold text-white disabled:opacity-40"
          >
            {submitting ? "Sending..." : "Send verification code"}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <input
            value={otp}
            onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="6-digit code"
            inputMode="numeric"
            className="w-full rounded-2xl border-2 p-4 text-center text-2xl tracking-widest"
          />
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password (only required for doctor accounts)"
            type="password"
            className="w-full rounded-2xl border-2 p-4 text-lg"
          />
          <button
            type="button"
            disabled={submitting || otp.length !== 6}
            onClick={() => void verify()}
            className="rounded-2xl bg-red-600 py-4 text-lg font-semibold text-white disabled:opacity-40"
          >
            {submitting ? "Deleting..." : "Confirm deletion"}
          </button>
        </div>
      )}
    </div>
  );
}
