import { useState } from "react";
import toast from "react-hot-toast";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
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
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 bg-background p-8 text-center">
        <h1 className="font-display text-2xl font-bold text-foreground">Account deleted</h1>
        <p className="text-muted-foreground">
          Your MadamGy account and personal details have been removed. Any consultation or payment
          records tied to your account are retained only as required for medical record-keeping and
          financial audit.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 bg-background p-8">
      <div>
        <h1 className="font-display mb-2 text-2xl font-bold text-foreground">Delete your MadamGy account</h1>
        <p className="text-muted-foreground">
          This permanently removes your name, contact details, and health profile from MadamGy. This
          cannot be undone. You don't need the app installed to do this.
        </p>
      </div>
      {step === "phone" ? (
        <div className="flex flex-col gap-4">
          <Input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone number used to register" type="tel" />
          <Button
            variant="destructive"
            disabled={submitting || phone.length < 10}
            onClick={() => void initiate()}
            className="w-full text-lg"
          >
            {submitting ? "Sending..." : "Send verification code"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Input
            value={otp}
            onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="6-digit code"
            inputMode="numeric"
            className="text-center text-2xl tracking-widest"
          />
          <Input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password (only required for doctor accounts)"
            type="password"
          />
          <Button variant="destructive" disabled={submitting || otp.length !== 6} onClick={() => void verify()} className="w-full text-lg">
            {submitting ? "Deleting..." : "Confirm deletion"}
          </Button>
        </div>
      )}
    </div>
  );
}
