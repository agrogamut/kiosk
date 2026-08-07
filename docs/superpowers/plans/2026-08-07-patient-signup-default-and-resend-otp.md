# Patient Signup Default + Resend OTP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unlocked patient entry (`/`) defaults to the sign-up form instead of login, with a local toggle to switch views; the shared OTP step gets a 30s-cooldown Resend button. Locked-kiosk, doctor, admin, and kiosk-owner flows are untouched.

**Architecture:** Extract the registration form out of `KioskRegister` into a standalone `PatientRegisterForm` component (props: `onSuccess`, `footer`) so both `/register` and the inline `Entry.tsx` view can use it without duplicating the form. `Entry.tsx` gains a `patientView` toggle (signup/login, unlocked only) and a `resendCooldown` timer wired to the existing OTP-initiate functions.

**Tech Stack:** React + TypeScript, react-hook-form + zod, Tailwind. No test framework in `packages/web` — verification is `tsc --noEmit` plus manual browser check of both flows.

## Global Constraints

- Locked-kiosk patient screen renders byte-for-byte the same JSX/behavior as today — login form first, `<Link to="/register">`. (spec: Decisions)
- Doctor/Admin/Kiosk-Owner code paths, the unlock chooser, `/register`'s own route and URL: unchanged. (spec: Decisions, Non-goals)
- No backend/API changes — resend reuses `/auth/patient/login/otp/initiate` and `/auth/doctor/login/initiate`, already rate-limited server-side. (spec: Scope)
- Resend cooldown: 30 seconds, client-side only, resets on every successful send. (spec: Decisions, Design C)

---

### Task 1: Extract `PatientRegisterForm`

**Files:**
- Create: `packages/web/src/components/patient/PatientRegisterForm.tsx`
- Modify: `packages/web/src/pages/kiosk/Register.tsx` (full rewrite, same route/behavior)

**Interfaces:**
- Produces: `PatientRegisterForm` component —
  ```ts
  interface PatientRegisterFormProps {
    onSuccess: (response: { accessToken: string; user: { id: string; name: string; role: UserRole } }) => void;
    footer: ReactNode;
  }
  export function PatientRegisterForm(props: PatientRegisterFormProps): JSX.Element
  ```
  Task 2 (Entry.tsx) consumes this exact signature.

- [ ] **Step 1: Create the extracted form component**

Create `packages/web/src/components/patient/PatientRegisterForm.tsx`:

```tsx
import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { PatientRegisterSchema, type Gender, type PatientRegister, type UserRole } from "@madamgy/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/errors";

type RegisterInfo = Omit<PatientRegister, "pin" | "consent" | "gender" | "email">;

interface RegisterResponse {
  accessToken: string;
  user: { id: string; name: string; role: UserRole };
}

interface PatientRegisterFormProps {
  onSuccess: (response: RegisterResponse) => void;
  footer: ReactNode;
}

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

export function PatientRegisterForm({ onSuccess, footer }: PatientRegisterFormProps) {
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
      const response = await api.post<RegisterResponse>("/auth/patient/register", {
        ...values,
        consent: true,
        ...(gender ? { gender } : {}),
        ...(email.trim() ? { email: email.trim() } : {}),
      });
      onSuccess(response.data);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "We couldn't create your account. Check the form and try again."));
    } finally {
      setSubmitting(false);
    }
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

      {footer}
    </form>
  );
}
```

This is the exact form from today's `KioskRegister.tsx` (same fields, same validation, same submit payload), with two changes: it takes `onSuccess`/`footer` props instead of calling `useAuthStore`/`useNavigate`/`<Link>` itself, and imports go through the `@/` alias (matching sibling files in `components/patient/`) instead of the page's old `../../` relative paths.

- [ ] **Step 2: Slim `KioskRegister.tsx` down to a thin wrapper**

Replace the full contents of `packages/web/src/pages/kiosk/Register.tsx` with:

```tsx
import { Link, useNavigate } from "react-router-dom";
import { Logo } from "../../components/brand/Logo";
import { Card, CardContent } from "../../components/ui/card";
import { PatientRegisterForm } from "../../components/patient/PatientRegisterForm";
import { useAuthStore } from "../../store/auth.store";

export default function KioskRegister() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);

  return (
    <div className="flex min-h-screen flex-col items-center bg-background px-6 py-10">
      <Logo className="mb-8 h-10 w-auto" />
      <div className="w-full max-w-sm sm:max-w-md lg:max-w-lg">
        <h1 className="mb-6 text-center font-display text-3xl font-bold text-foreground">Create account</h1>
        <Card className="rounded-lg border-none ring-0 shadow-[0_8px_24px_-8px_rgba(219,101,145,0.15)]">
          <CardContent className="p-6">
            <PatientRegisterForm
              onSuccess={(response) => {
                setAuth(response.accessToken, response.user);
                navigate("/dashboard");
              }}
              footer={
                <p className="text-center text-sm text-muted-foreground">
                  Already have an account?{" "}
                  <Link to="/" className="font-semibold text-primary">
                    Log in
                  </Link>
                </p>
              }
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

Route (`/register`), page chrome (logo/heading/card), and end-to-end behavior are unchanged — only the form internals moved to the new component.

- [ ] **Step 3: Typecheck**

Run: `cd packages/web && npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Visual check**

Run `npm run dev` (or use the already-running dev server), navigate to `/register`. Confirm the form renders and looks identical to before (all fields, gender toggle, consent checkbox, "Already have an account? Log in" footer linking to `/`).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/patient/PatientRegisterForm.tsx packages/web/src/pages/kiosk/Register.tsx
git commit -m "refactor: extract PatientRegisterForm out of the kiosk register page"
```

---

### Task 2: Entry.tsx — sign-up-first on the unlocked patient tab

**Files:**
- Modify: `packages/web/src/pages/Entry.tsx`

**Interfaces:**
- Consumes: `PatientRegisterForm` from Task 1 — `{ onSuccess: (response: { accessToken: string; user: { id: string; name: string; role: UserRole } }) => void; footer: ReactNode }`.
- Produces: nothing new for other files — `Entry` is a leaf route component.

- [ ] **Step 1: Import `PatientRegisterForm` and add the `patientView` state**

Add the import near the other component imports (`packages/web/src/pages/Entry.tsx:16-18`):

```tsx
import { NumPad } from "../components/kiosk/NumPad";
import { Logo } from "../components/brand/Logo";
import { PatientRegisterForm } from "../components/patient/PatientRegisterForm";
import { ContactUsDialog } from "../components/support/ContactUsDialog";
```

Add the state next to the existing `step`/`phone`/`otp` state (`packages/web/src/pages/Entry.tsx:87-90`):

```tsx
  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Unlocked patient tab only (see `locked` branch in the render below, which
  // never reads this) -- which of the two patient views is showing. Defaults
  // to signup since most people landing on an unlocked "/" are new patients;
  // a locked kiosk's own patient screen always shows login regardless of
  // this value.
  const [patientView, setPatientView] = useState<"signup" | "login">("signup");
```

In `changeRole` (`packages/web/src/pages/Entry.tsx:153-157`), reset it alongside the existing resets:

```tsx
  function changeRole(value: EntryRole): void {
    setRole(value);
    setStep("credentials");
    setOtp("");
    setPatientView("signup");
  }
```

- [ ] **Step 2: Extract the phone-only login form into a local render helper**

Both the locked-kiosk patient screen and the unlocked `patientView === "login"` view need the exact same phone-input login form, differing only in the footer. Add this local helper function inside `Entry()`, right before the `return` statement (i.e. just above `packages/web/src/pages/Entry.tsx:340`):

```tsx
  function renderPatientLoginForm(footer: ReactNode): ReactNode {
    return (
      <form onSubmit={patientForm.handleSubmit(sendPatientOtp)} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="patient-phone">Phone number</Label>
          <Input id="patient-phone" type="tel" placeholder="10-digit phone number" {...patientForm.register("phone")} />
          {patientForm.formState.errors.phone && (
            <p className="text-sm text-destructive">{patientForm.formState.errors.phone.message}</p>
          )}
        </div>
        <Button type="submit" disabled={submitting} className="w-full rounded-full">
          {submitting ? "Sending..." : "Send OTP"}
        </Button>
        {footer}
      </form>
    );
  }
```

Add `type ReactNode` to the existing `react` import at the top of the file (`packages/web/src/pages/Entry.tsx:1`):

```tsx
import { useEffect, useRef, useState, type ReactNode } from "react";
```

- [ ] **Step 3: Replace the `displayRole === "PATIENT"` branch**

Current code (`packages/web/src/pages/Entry.tsx:407-425`):

```tsx
            ) : displayRole === "PATIENT" ? (
              <form onSubmit={patientForm.handleSubmit(sendPatientOtp)} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="patient-phone">Phone number</Label>
                  <Input id="patient-phone" type="tel" placeholder="10-digit phone number" {...patientForm.register("phone")} />
                  {patientForm.formState.errors.phone && (
                    <p className="text-sm text-destructive">{patientForm.formState.errors.phone.message}</p>
                  )}
                </div>
                <Button type="submit" disabled={submitting} className="w-full rounded-full">
                  {submitting ? "Sending..." : "Send OTP"}
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                  New here?{" "}
                  <Link to="/register" className="font-semibold text-primary">
                    Create an account
                  </Link>
                </p>
              </form>
            ) : displayRole === "DOCTOR" ? (
```

Replace with:

```tsx
            ) : displayRole === "PATIENT" ? (
              locked ? (
                renderPatientLoginForm(
                  <p className="text-center text-sm text-muted-foreground">
                    New here?{" "}
                    <Link to="/register" className="font-semibold text-primary">
                      Create an account
                    </Link>
                  </p>,
                )
              ) : patientView === "signup" ? (
                <PatientRegisterForm
                  onSuccess={(response) => {
                    setAuth(response.accessToken, response.user);
                    enterApp(response.user);
                  }}
                  footer={
                    <p className="text-center text-sm text-muted-foreground">
                      Already have an account?{" "}
                      <button type="button" onClick={() => setPatientView("login")} className="font-semibold text-primary">
                        Log in
                      </button>
                    </p>
                  }
                />
              ) : (
                renderPatientLoginForm(
                  <p className="text-center text-sm text-muted-foreground">
                    New here?{" "}
                    <button type="button" onClick={() => setPatientView("signup")} className="font-semibold text-primary">
                      Create an account
                    </button>
                  </p>,
                )
              )
            ) : displayRole === "DOCTOR" ? (
```

Everything else in the file (doctor form, admin form, OTP step, unlock chooser, `sendPatientOtp`/`verifyPatientOtp`, kiosk-lock dialog) is untouched by this task.

- [ ] **Step 4: Typecheck**

Run: `cd packages/web && npm run typecheck`
Expected: no errors. (`Link` is already imported at the top of `Entry.tsx` — still used by the locked-branch footer, so no import changes needed there.)

- [ ] **Step 5: Visual check**

With the dev server running:
- Visit `/` unlocked (fresh browser/incognito, no kiosk lock set): confirm the Create Account form shows by default, with "Already have an account? Log in" switching to the phone-login form in place (no URL change), and "New here? Create an account" switching back.
- Confirm registering through this inline form still lands on `/dashboard` logged in.
- Confirm `/register` (direct URL) still works standalone, unchanged.
- If a locked-kiosk state is easy to set locally (kiosk store), confirm the locked patient screen still shows login-first with a real `Create an account` link to `/register` — otherwise, code-review this branch carefully since it's the one guarded by `locked` and hardest to click-test.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/pages/Entry.tsx
git commit -m "feat: default unlocked patient entry to sign-up, with a login toggle"
```

---

### Task 3: Resend OTP

**Files:**
- Modify: `packages/web/src/pages/Entry.tsx`

**Interfaces:**
- Consumes: `sendPatientOtp(values: PatientLoginOtpInitiate)`, `sendDoctorOtp(values: DoctorLoginInitiate)`, `patientForm`, `doctorForm` — all already defined in this file (Task 2 does not change their signatures).
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Add cooldown state and its ticking effect**

Add next to the `patientView` state added in Task 2 (`packages/web/src/pages/Entry.tsx`, same block):

```tsx
  const [patientView, setPatientView] = useState<"signup" | "login">("signup");
  // Seconds remaining before Resend OTP is clickable again; 0 means ready.
  const [resendCooldown, setResendCooldown] = useState(0);
```

Add a new effect near the other `useEffect` in the file (after the stale-session effect, `packages/web/src/pages/Entry.tsx:139-151`):

```tsx
  useEffect(() => {
    if (step !== "otp" || resendCooldown <= 0) {
      return;
    }
    const timer = setInterval(() => {
      setResendCooldown((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [step, resendCooldown]);
```

- [ ] **Step 2: Start the cooldown on every successful send**

In `sendPatientOtp` (`packages/web/src/pages/Entry.tsx:194-206`), add `setResendCooldown(30)` right after `setStep("otp")`:

```tsx
  async function sendPatientOtp(values: PatientLoginOtpInitiate): Promise<void> {
    setSubmitting(true);
    try {
      await api.post("/auth/patient/login/otp/initiate", values);
      setPhone(values.phone);
      setStep("otp");
      setResendCooldown(30);
      toast.success("OTP sent");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not send the OTP. Check the number and try again."));
    } finally {
      setSubmitting(false);
    }
  }
```

In `sendDoctorOtp` (`packages/web/src/pages/Entry.tsx:222-234`), the same change:

```tsx
  async function sendDoctorOtp(values: DoctorLoginInitiate): Promise<void> {
    setSubmitting(true);
    try {
      await api.post("/auth/doctor/login/initiate", values);
      setPhone(values.phone);
      setStep("otp");
      setResendCooldown(30);
      toast.success("OTP sent");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not log in. Check your phone and password."));
    } finally {
      setSubmitting(false);
    }
  }
```

- [ ] **Step 3: Add the `resendOtp` function**

Add right after `verifyDoctorOtp` (`packages/web/src/pages/Entry.tsx:236-248`):

```tsx
  async function resendOtp(): Promise<void> {
    if (resendCooldown > 0 || submitting) {
      return;
    }
    if (displayRole === "DOCTOR") {
      await sendDoctorOtp(doctorForm.getValues());
    } else {
      await sendPatientOtp(patientForm.getValues());
    }
  }
```

This reuses whatever the user already typed into `patientForm`/`doctorForm` — neither form is reset when the flow moves to the OTP step today, so `getValues()` still has the phone (and, for doctor, the password) from the original submit.

- [ ] **Step 4: Add the Resend button to the OTP step**

Current code (`packages/web/src/pages/Entry.tsx:391-406`):

```tsx
            ) : step === "otp" ? (
              <div className="flex flex-col items-center gap-6">
                <p className="text-center text-sm text-muted-foreground">Enter the 6-digit code sent to {phone}</p>
                <NumPad value={otp} onChange={setOtp} maxLength={6} />
                <Button
                  type="button"
                  disabled={submitting || otp.length !== 6}
                  onClick={() => void (displayRole === "DOCTOR" ? verifyDoctorOtp() : verifyPatientOtp())}
                  className="w-full rounded-full"
                >
                  {submitting ? "Verifying..." : "Log in"}
                </Button>
                <button type="button" onClick={() => setStep("credentials")} className="text-sm font-semibold text-primary">
                  Change phone number
                </button>
              </div>
            ) : displayRole === "PATIENT" ? (
```

Replace with (adds the Resend control right after "Change phone number"):

```tsx
            ) : step === "otp" ? (
              <div className="flex flex-col items-center gap-6">
                <p className="text-center text-sm text-muted-foreground">Enter the 6-digit code sent to {phone}</p>
                <NumPad value={otp} onChange={setOtp} maxLength={6} />
                <Button
                  type="button"
                  disabled={submitting || otp.length !== 6}
                  onClick={() => void (displayRole === "DOCTOR" ? verifyDoctorOtp() : verifyPatientOtp())}
                  className="w-full rounded-full"
                >
                  {submitting ? "Verifying..." : "Log in"}
                </Button>
                <button type="button" onClick={() => setStep("credentials")} className="text-sm font-semibold text-primary">
                  Change phone number
                </button>
                <button
                  type="button"
                  disabled={resendCooldown > 0 || submitting}
                  onClick={() => void resendOtp()}
                  className="text-sm font-semibold text-primary disabled:text-muted-foreground"
                >
                  {resendCooldown > 0 ? `Resend code in 0:${resendCooldown.toString().padStart(2, "0")}` : "Resend OTP"}
                </button>
              </div>
            ) : displayRole === "PATIENT" ? (
```

- [ ] **Step 5: Typecheck**

Run: `cd packages/web && npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Visual check**

With the dev server running, start a patient login (phone `9876543210`, dev OTP `000000` still applies for verify — resend just re-triggers a send, doesn't change what code is valid). Confirm: OTP step shows "Resend code in 0:30" disabled, counting down once per second; once it hits `0:00` the label flips to "Resend OTP" and is clickable; clicking it shows the "OTP sent" toast again and restarts the countdown at 30. Confirm doctor login's OTP step shows the same control (doctor login itself may not be testable end-to-end depending on seeded doctor credentials — at minimum confirm the button renders and is wired to `resendOtp`).

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/pages/Entry.tsx
git commit -m "feat: add resend OTP with a 30s cooldown to the login flow"
```
