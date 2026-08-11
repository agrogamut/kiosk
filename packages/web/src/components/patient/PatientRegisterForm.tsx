import { useEffect, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import toast from "react-hot-toast";
import {
  PatientRegisterInitiateSchema,
  type Gender,
  type PatientRegisterInitiate,
  type UserRole,
} from "@madamgy/api-client";
import { NumPad } from "@/components/kiosk/NumPad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/errors";

type RegisterInfo = Omit<PatientRegisterInitiate, "pin" | "consent" | "gender" | "email">;

interface RegisterResponse {
  accessToken: string;
  user: { id: string; name: string; role: UserRole };
}

interface PatientRegisterFormProps {
  onSuccess: (response: RegisterResponse) => void;
  // Where "log in instead" goes when the number turns out to already have an account, carrying
  // the number with it so nobody retypes what they just typed. Without a handler the form still
  // says what happened, it just can't offer the shortcut.
  onExistingAccount?: (phone: string) => void;
  footer: ReactNode;
}

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Other" },
];

const RESEND_COOLDOWN_SECONDS = 30;

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

/**
 * Turns a failed sign-up call into something the person can act on.
 *
 * Every one of these arrives as the same axios rejection, and the generic "check the number and
 * try again" that used to cover all of them is wrong for most: a taken number is not a typo, and
 * being rate limited is not something trying again fixes.
 */
function describeFailure(error: unknown): { message: string; field: "phone" | null } {
  if (!axios.isAxiosError(error)) {
    return { message: "Something went wrong. Try again.", field: null };
  }

  if (!error.response) {
    return { message: "Can't reach the server. Check your connection and try again.", field: null };
  }

  switch (error.response.status) {
    case 409:
      return { message: "This number already has an account.", field: "phone" };
    case 429:
      return { message: "Too many attempts for this number. Try again in 15 minutes.", field: null };
    case 401:
      return { message: "That code is wrong or has expired. Request a new one.", field: null };
    default:
      return { message: getApiErrorMessage(error, "Something went wrong. Try again."), field: null };
  }
}

export function PatientRegisterForm({ onSuccess, onExistingAccount, footer }: PatientRegisterFormProps) {
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [gender, setGender] = useState<Gender | "">("");
  const [email, setEmail] = useState("");
  // "details" collects the form and asks for a code; "verify" spends that code to create the
  // account. Nothing is written on the server until the second step, so an abandoned sign-up
  // leaves the phone number free for whoever actually owns it.
  const [step, setStep] = useState<"details" | "verify">("details");
  const [pending, setPending] = useState<PatientRegisterInitiate | null>(null);
  const [otp, setOtp] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  // The number that came back as already registered, held so "log in instead" can carry it over.
  // Null whenever the phone field has been touched since, because the answer no longer applies.
  const [takenPhone, setTakenPhone] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterInfo>({
    resolver: zodResolver(PatientRegisterInitiateSchema.omit({ pin: true, consent: true, gender: true, email: true })),
  });
  const dobRegistration = register("dob");
  const phoneRegistration = register("phone");

  useEffect(() => {
    if (step !== "verify" || resendCooldown <= 0) {
      return;
    }
    const timer = setTimeout(() => setResendCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [step, resendCooldown]);

  async function requestOtp(values: PatientRegisterInitiate): Promise<void> {
    setSubmitting(true);
    try {
      await api.post("/auth/patient/register/initiate", values);
      setPending(values);
      setOtp("");
      setStep("verify");
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      toast.success("OTP sent");
    } catch (error) {
      const failure = describeFailure(error);
      if (failure.field === "phone") {
        // On the field rather than in a toast: it's the one input that's wrong, the answer stays
        // on screen while they read it, and it sits next to the way out of the dead end. Resend
        // comes through here too, from the verify step, where that field isn't on screen -- so go
        // back to it rather than setting an error nobody can see.
        setTakenPhone(values.phone);
        setStep("details");
        setError("phone", { message: failure.message });
        return;
      }
      toast.error(failure.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function submit(values: RegisterInfo): Promise<void> {
    await requestOtp({
      ...values,
      consent: true,
      ...(gender ? { gender } : {}),
      ...(email.trim() ? { email: email.trim() } : {}),
    });
  }

  async function createAccount(): Promise<void> {
    if (!pending) {
      return;
    }
    setSubmitting(true);
    try {
      const response = await api.post<RegisterResponse>("/auth/patient/register", { ...pending, otp });
      onSuccess(response.data);
    } catch (error) {
      setOtp("");
      const failure = describeFailure(error);
      // Someone else finished signing up on this number in the seconds it took to read the SMS.
      // Rare, but leaving them on a numpad that can no longer succeed is a dead end, so send them
      // back to the field the answer belongs to.
      if (failure.field === "phone") {
        setTakenPhone(pending.phone);
        setStep("details");
        setError("phone", { message: failure.message });
        return;
      }
      toast.error(failure.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "verify" && pending) {
    return (
      <div className="flex flex-col items-center gap-6">
        <p className="text-center text-sm text-muted-foreground">Enter the 6-digit code sent to {pending.phone}</p>
        <NumPad value={otp} onChange={setOtp} maxLength={6} />
        <Button
          type="button"
          disabled={submitting || otp.length !== 6}
          onClick={() => void createAccount()}
          className="w-full rounded-full"
        >
          {submitting ? "Creating account..." : "Create account"}
        </Button>
        <button
          type="button"
          onClick={() => {
            setStep("details");
            setOtp("");
          }}
          className="text-sm font-semibold text-primary"
        >
          Change my details
        </button>
        <button
          type="button"
          disabled={resendCooldown > 0 || submitting}
          onClick={() => void requestOtp(pending)}
          className="text-sm font-semibold text-primary disabled:text-muted-foreground"
        >
          {resendCooldown > 0 ? `Resend code in 0:${resendCooldown.toString().padStart(2, "0")}` : "Resend OTP"}
        </button>
        {footer}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="register-name">Full name</Label>
        <Input id="register-name" {...register("name")} placeholder="Your name" />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="register-phone">Phone number</Label>
        <Input
          id="register-phone"
          {...phoneRegistration}
          onChange={(event) => {
            // A different number is a different question, so drop the answer to the old one.
            setTakenPhone(null);
            void phoneRegistration.onChange(event);
          }}
          type="tel"
          placeholder="10-digit phone number"
        />
        {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
        {takenPhone && onExistingAccount && (
          <button
            type="button"
            onClick={() => onExistingAccount(takenPhone)}
            className="self-start text-sm font-semibold text-primary"
          >
            Log in as {takenPhone} instead
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="register-dob">Date of birth</Label>
        <Input
          id="register-dob"
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
        />
        {errors.dob && <p className="text-sm text-destructive">{errors.dob.message}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label>Gender (optional)</Label>
        <div className="flex gap-2">
          {GENDER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setGender(option.value)}
              className={
                gender === option.value
                  ? "flex h-11 flex-1 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
                  : "flex h-11 flex-1 items-center justify-center rounded-full border border-input text-sm font-semibold text-foreground"
              }
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="register-email">Email (optional)</Label>
        <Input id="register-email" value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="you@example.com" />
      </div>

      <label className="flex items-start gap-3 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
          className="mt-1 h-5 w-5 shrink-0 accent-primary"
        />
        I consent to receiving a teleconsultation and understand my health data will be stored for this purpose.
      </label>

      <Button type="submit" disabled={submitting || !consent} className="mt-2 w-full rounded-full">
        {submitting ? "Sending code..." : "Send OTP"}
      </Button>

      {footer}
    </form>
  );
}
