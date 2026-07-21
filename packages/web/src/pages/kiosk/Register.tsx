import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { PatientRegisterSchema, type Gender, type PatientRegister } from "@madamgy/api-client";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";
import { useAuthStore } from "../../store/auth.store";

type RegisterInfo = Omit<PatientRegister, "pin" | "consent" | "gender" | "email">;

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Other" },
];

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
  const [gender, setGender] = useState<Gender | "">("");
  const [email, setEmail] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterInfo>({
    resolver: zodResolver(PatientRegisterSchema.omit({ pin: true, consent: true, gender: true, email: true })),
  });
  const dobRegistration = register("dob");

  async function submit(values: RegisterInfo): Promise<void> {
    setSubmitting(true);
    try {
      const response = await api.post("/auth/patient/register", {
        ...values,
        consent: true,
        ...(gender ? { gender } : {}),
        ...(email.trim() ? { email: email.trim() } : {}),
      });
      setAuth(response.data.accessToken, response.data.user);
      navigate("/dashboard");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "We couldn't create your account. Check the form and try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-background px-6 py-10">
      <div className="w-full max-w-sm sm:max-w-md lg:max-w-lg">
        <h1 className="mb-6 text-center font-display text-3xl font-bold text-foreground">Create account</h1>
        <Card className="rounded-lg border-none ring-0 shadow-[0_8px_24px_-8px_rgba(219,101,145,0.15)]">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="register-name">Full name</Label>
                <Input id="register-name" {...register("name")} placeholder="Your name" />
                {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="register-phone">Phone number</Label>
                <Input id="register-phone" {...register("phone")} type="tel" placeholder="10-digit phone number" />
                {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
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
                {submitting ? "Creating account..." : "Register"}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link to="/" className="font-semibold text-primary">
                  Log in
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
