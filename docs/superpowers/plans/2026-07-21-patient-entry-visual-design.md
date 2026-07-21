# Patient Entry & Kiosk Visual Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the shadcn/ui + brand-token foundation, build the single role-based Entry screen, and restyle the full patient/kiosk flow (register, dashboard, consult, prescription) per `docs/superpowers/specs/2026-07-21-visual-brand-design.md`.

**Architecture:** `shadcn/ui` (new-york style, Radix primitives) is added to `packages/web` as the component layer, restyled via CSS custom properties in `src/index.css` mapped through `tailwind.config.ts` to the approved brand palette. A signature `PulseRing` component (framer-motion, already a dependency) replaces generic spinners at loading/waiting moments. Three previously-separate login pages (patient OTP-only, doctor password+OTP, admin password-only) plus the button-grid home screen collapse into one `Entry` component with a role dropdown over a shared shell.

**Tech Stack:** Vite + React 18 + Tailwind CSS v3.4 (not v4 — `@theme inline` syntax does not apply here), shadcn/ui (`--base radix`), framer-motion, react-hook-form + zod, `@fontsource/baloo-2` + `@fontsource/manrope` (self-hosted, no CDN).

## Global Constraints

- **Scope:** this plan covers Entry (role-based login) + patient/kiosk pages only (`Home.tsx`/`Login.tsx` retirement, `Register.tsx`, `Dashboard.tsx`, `Consult.tsx`, `Prescription.tsx` + prescription subcomponents, `NumPad.tsx`). Doctor flow, admin panel, and legal pages are separate follow-up plans (see "Not in this plan" at the end) — this spec covers multiple independent subsystems and this plan deliberately takes only the first, shippable slice.
- **Token colors are HSL-channel triples, not hex**, specifically so Tailwind's opacity-modifier syntax works. `packages/web/src/index.css` stores each token as `H S% L%` (no `hsl()` wrapper, no commas — e.g. `--primary: 338 62% 63%;`), and `tailwind.config.ts` maps them through `hsl(var(--x) / <alpha-value>)`. This was a Task 1 mid-implementation correction: the installed `shadcn@latest` CLI generates component internals (button.tsx, select.tsx, etc.) that lean heavily on opacity-modifier classes like `hover:bg-primary/80` and `bg-destructive/10` — verified by compiling `src/index.css` through `npx tailwindcss` directly and inspecting the output CSS; with plain hex-in-var tokens, `bg-primary/80` silently compiled to no rule at all (broken hover/tint states across every shadcn primitive), and with the HSL-channel + `hsl(var(--x) / <alpha-value>)` pattern it correctly compiles to `background-color: hsl(var(--primary) / 0.8)`. Because of this, `bg-primary/20`-style opacity modifiers on token colors now work correctly and are the *preferred* way to get a tinted/translucent token color — prefer them over hand-picked 8-digit hex arbitrary values (`bg-[#EE908D33]`) in any new code, including follow-up plans. Existing 8-digit hex arbitrary values already written into Tasks 4/6/7/9 of this plan (e.g. `bg-[#EE908D33]` in NumPad, `bg-[#DC262614]` in Dashboard) still render correctly as-is and do not need to be changed retroactively — they're just no longer the recommended pattern going forward.
- **No test framework exists in `packages/web`** (zero `*.test.*` files, no vitest/testing-library dependency) — this is a styling pass with no new business logic, so verification is `npm run typecheck --workspace @madamgy/web` plus manual browser verification at a phone viewport (390×844) for every task, matching the spec's own "Testing / verification" section. Do not introduce a test framework as part of this plan — out of scope.
- **Fonts are self-hosted**, not loaded from Google Fonts CDN — this is a Capacitor-wrapped native app shell and must not depend on network access to render its own chrome.
- **Backend contract is unchanged.** No task in this plan modifies `packages/server`. Endpoints used: `POST /auth/patient/login/otp/initiate`, `POST /auth/patient/login/otp/verify`, `POST /auth/doctor/login/initiate`, `POST /auth/doctor/login/verify`, `POST /auth/admin/login`, `POST /auth/patient/register`, `GET/POST/DELETE /health-files`, `DELETE /account/me`.

---

### Task 1: shadcn/ui foundation + brand tokens

**Files:**
- Create: `packages/web/components.json` (via CLI)
- Create: `packages/web/src/lib/utils.ts` (via CLI)
- Create: `packages/web/src/components/ui/button.tsx`, `card.tsx`, `input.tsx`, `label.tsx`, `select.tsx`, `alert.tsx`, `alert-dialog.tsx`, `dialog.tsx`, `badge.tsx`, `table.tsx`, `dropdown-menu.tsx`, `sheet.tsx`, `skeleton.tsx`, `avatar.tsx` (via CLI)
- Modify: `packages/web/src/index.css`
- Modify: `packages/web/tailwind.config.ts`
- Modify: `packages/web/package.json` (new dependencies from CLI + `tailwindcss-animate`)

**Interfaces:**
- Produces: `cn()` util at `src/lib/utils.ts` (shadcn standard signature: `cn(...inputs: ClassValue[]): string`), the full `components/ui/*` primitive set, and Tailwind tokens `bg-background`, `text-foreground`, `bg-card`, `text-card-foreground`, `bg-primary`, `text-primary-foreground`, `bg-secondary`, `bg-accent`, `text-muted-foreground`, `border-input`, `font-display`, `font-sans`, `rounded-lg/md/sm` — every later task in this plan (and follow-ups) builds on these exact class names.

- [ ] **Step 1: Initialize shadcn/ui**

Run from `packages/web/`:
```bash
npx shadcn@latest init -d --base radix
```
Expected: creates `components.json`, `src/lib/utils.ts`; installs `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `radix-ui`, `tailwindcss-animate`; modifies `tailwind.config.ts` and `src/index.css`. It will detect Tailwind v3.4 and configure via CSS custom properties in `:root` (not the v4 `@theme inline` block).

- [ ] **Step 2: Add the component primitives this plan and its follow-ups need**

Run from `packages/web/`:
```bash
npx shadcn@latest add button card input label select alert alert-dialog dialog badge table dropdown-menu sheet skeleton avatar
```
Expected: creates each file listed above under `src/components/ui/`.

- [ ] **Step 3: Overwrite the token values in `src/index.css`**

Open `src/index.css`. Replace the entire `:root { ... }` block (and delete any `.dark { ... }` block the CLI generated — this app has no dark mode) with exactly:

```css
:root {
  --background: #FEF8F8;
  --foreground: #4A4A4A;
  --card: #FFFFFF;
  --card-foreground: #4A4A4A;
  --popover: #FFFFFF;
  --popover-foreground: #4A4A4A;
  --primary: #DB6591;
  --primary-foreground: #FFFFFF;
  --secondary: #EE908D;
  --secondary-foreground: #4A4A4A;
  --muted: #FEF8F8;
  --muted-foreground: #A8A6A6;
  --accent: #EE908D;
  --accent-foreground: #4A4A4A;
  --destructive: #DC2626;
  --destructive-foreground: #FFFFFF;
  --border: #F0DEDD;
  --input: #F0DEDD;
  --ring: #DB6591;
  --radius: 1.25rem;
}
```

Keep the rest of the file (the `body { ... }` rule with safe-area padding and `overscroll-behavior: none`) as-is, but update `background` and `color` in that `body` rule to `var(--background)` and `var(--foreground)` respectively, and remove the hardcoded `font-family` line (fonts are wired in Task 2).

- [ ] **Step 4: Overwrite `tailwind.config.ts`**

Replace the full file content with:

```ts
import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: { DEFAULT: "var(--card)", foreground: "var(--card-foreground)" },
        popover: { DEFAULT: "var(--popover)", foreground: "var(--popover-foreground)" },
        primary: { DEFAULT: "var(--primary)", foreground: "var(--primary-foreground)" },
        secondary: { DEFAULT: "var(--secondary)", foreground: "var(--secondary-foreground)" },
        muted: { DEFAULT: "var(--muted)", foreground: "var(--muted-foreground)" },
        accent: { DEFAULT: "var(--accent)", foreground: "var(--accent-foreground)" },
        destructive: { DEFAULT: "var(--destructive)", foreground: "var(--destructive-foreground)" },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 8px)",
      },
      fontFamily: {
        display: ["Baloo 2", "system-ui", "sans-serif"],
        sans: ["Manrope", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors.

- [ ] **Step 6: Manual verify**

Run `npm run dev --workspace @madamgy/web`, open the app in a browser at a 390px-wide viewport. The existing (unstyled) pages should still render without console errors — this task only lays the foundation, no page markup changes yet.

- [ ] **Step 7: Commit**

```bash
git add packages/web/components.json packages/web/src/lib/utils.ts packages/web/src/components/ui packages/web/src/index.css packages/web/tailwind.config.ts packages/web/package.json packages/web/package-lock.json
git commit -m "feat: add shadcn/ui foundation and brand color tokens"
```

---

### Task 2: Self-hosted brand fonts

**Files:**
- Modify: `packages/web/package.json` (add `@fontsource/baloo-2`, `@fontsource/manrope`)
- Modify: `packages/web/src/index.css`

**Interfaces:**
- Consumes: `font-display` / `font-sans` Tailwind classes from Task 1.
- Produces: `font-display` renders Baloo 2, `font-sans` (the Tailwind default, used implicitly by `body`) renders Manrope.

- [ ] **Step 1: Install the font packages**

Run:
```bash
npm install @fontsource/baloo-2 @fontsource/manrope --workspace @madamgy/web
```

- [ ] **Step 2: Import the weights this design uses**

At the top of `packages/web/src/index.css`, above the `@tailwind` directives, add:

```css
@import "@fontsource/baloo-2/600.css";
@import "@fontsource/baloo-2/700.css";
@import "@fontsource/manrope/400.css";
@import "@fontsource/manrope/500.css";
@import "@fontsource/manrope/600.css";
```

- [ ] **Step 3: Set Manrope as the default body font**

In the `body { ... }` rule in the same file, add `font-family: "Manrope", system-ui, sans-serif;` (this is the fallback for anything not explicitly using `font-display`; Tailwind's `font-sans` utility class also resolves to this via the Task 1 config).

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors.

- [ ] **Step 5: Manual verify**

Run `npm run dev --workspace @madamgy/web`, open devtools Network tab, reload — confirm the Baloo 2 and Manrope woff2 files load from `localhost` (Vite dev server), not `fonts.googleapis.com` or any external host. Confirm body text visibly renders in Manrope (rounder, more geometric than the previous system-font fallback).

- [ ] **Step 6: Commit**

```bash
git add packages/web/package.json packages/web/package-lock.json packages/web/src/index.css
git commit -m "feat: self-host Baloo 2 and Manrope brand fonts"
```

---

### Task 3: PulseRing signature component

**Files:**
- Create: `packages/web/src/components/brand/PulseRing.tsx`

**Interfaces:**
- Produces: `PulseRing({ size?: "sm" | "lg" }): JSX.Element` — default export is a named export `PulseRing`, imported as `import { PulseRing } from "../../components/brand/PulseRing"` (or `"../brand/PulseRing"` depending on caller depth). Used by Task 8 (Consult.tsx) and Task 9 (Prescription.tsx loading state).

- [ ] **Step 1: Write the component**

Create `packages/web/src/components/brand/PulseRing.tsx`:

```tsx
import { motion, useReducedMotion } from "framer-motion";

interface PulseRingProps {
  size?: "sm" | "lg";
}

const RING_COUNT = 3;

export function PulseRing({ size = "lg" }: PulseRingProps) {
  const reduceMotion = useReducedMotion();
  const dimension = size === "lg" ? 96 : 40;

  if (reduceMotion) {
    return (
      <div
        role="status"
        aria-label="Loading"
        className="rounded-full border-4 border-primary"
        style={{ width: dimension, height: dimension }}
      />
    );
  }

  return (
    <div role="status" aria-label="Loading" className="relative" style={{ width: dimension, height: dimension }}>
      {Array.from({ length: RING_COUNT }).map((_, index) => (
        <motion.span
          key={index}
          className="absolute inset-0 rounded-full border-2 border-primary"
          initial={{ opacity: 0.6, scale: 0.4 }}
          animate={{ opacity: 0, scale: 1 }}
          transition={{
            duration: 1.8,
            repeat: Infinity,
            ease: "easeOut",
            delay: index * 0.6,
          }}
        />
      ))}
      <div className="absolute inset-[30%] rounded-full bg-primary" />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors.

- [ ] **Step 3: Manual verify**

Temporarily render `<PulseRing size="lg" />` in `App.tsx` (or any mounted page) to eyeball it: confirm three rose rings ripple outward from a solid center dot, looping smoothly. Then in devtools, Rendering tab, enable "Emulate CSS media feature prefers-reduced-motion: reduce", reload — confirm it now renders as a static ring with no animation. Remove the temporary render before committing.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/brand/PulseRing.tsx
git commit -m "feat: add PulseRing signature loading motif"
```

---

### Task 4: Restyle NumPad

**Files:**
- Modify: `packages/web/src/components/kiosk/NumPad.tsx`

**Interfaces:**
- Consumes: `bg-primary`, `bg-border`, `bg-card`, `text-foreground`, `font-display` tokens from Task 1.
- Produces: unchanged props (`value: string`, `onChange: (value: string) => void`, `maxLength?: number`) — Task 5 (Entry) depends on this exact signature, already used identically by the pre-existing `kiosk/Login.tsx` this plan retires.

- [ ] **Step 1: Rewrite the component**

Replace `packages/web/src/components/kiosk/NumPad.tsx` with:

```tsx
import clsx from "clsx";

interface NumPadProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
}

export function NumPad({ value, onChange, maxLength = 4 }: NumPadProps) {
  function push(digit: string): void {
    if (value.length < maxLength) {
      onChange(value + digit);
    }
  }

  function pop(): void {
    onChange(value.slice(0, -1));
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="mb-2 flex gap-3">
        {Array.from({ length: maxLength }).map((_, index) => (
          <div
            key={index}
            className={clsx("h-3 w-3 rounded-full transition-colors", index < value.length ? "bg-primary" : "bg-border")}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "Del"].map((key) => (
          <button
            key={key}
            type="button"
            disabled={!key}
            onClick={() => (key === "Del" ? pop() : push(key))}
            className={clsx(
              "h-16 w-16 rounded-full font-display text-2xl font-semibold transition-colors",
              key ? "bg-card text-foreground shadow-sm hover:bg-[#EE908D33] active:bg-[#EE908D4D]" : "invisible",
            )}
          >
            {key}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors.

- [ ] **Step 3: Manual verify**

`NumPad` isn't mounted anywhere reachable until Task 5 rewires `Entry.tsx` to use it (the old `kiosk/Login.tsx` that currently renders it will be deleted in Task 5). Skip standalone browser verification here — Task 5's manual verify step covers it.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/kiosk/NumPad.tsx
git commit -m "feat: restyle NumPad with brand tokens"
```

---

### Task 5: Unified Entry screen (role-based login) + route consolidation

**Files:**
- Create: `packages/web/src/pages/Entry.tsx`
- Delete: `packages/web/src/pages/kiosk/Home.tsx`
- Delete: `packages/web/src/pages/kiosk/Login.tsx`
- Delete: `packages/web/src/pages/doctor/Login.tsx`
- Delete: `packages/web/src/pages/admin/Login.tsx`
- Modify: `packages/web/src/App.tsx`

**Interfaces:**
- Consumes: `NumPad` (Task 4), `components/ui/{button,card,input,label,select}` (Task 1), `useAuthStore.setAuth(accessToken: string, user: {id, name, role})` (existing, unchanged), `PatientLoginOtpInitiateSchema`/`PatientLoginOtpVerifySchema`/`DoctorLoginInitiateSchema`/`DoctorLoginVerifySchema`/`AdminLoginSchema` and their inferred types (`PatientLoginOtpInitiate`, `DoctorLoginInitiate`, `AdminLogin`, `UserRole`) from `@madamgy/api-client`.
- Produces: route `/` renders `Entry`; `/doctor/login` and `/admin/login` redirect to `/?role=doctor` / `/?role=admin`. No other page in this plan imports `Entry` directly (`App.tsx` wires it via the router).

- [ ] **Step 1: Write `Entry.tsx`**

Create `packages/web/src/pages/Entry.tsx`:

```tsx
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import {
  AdminLoginSchema,
  DoctorLoginInitiateSchema,
  PatientLoginOtpInitiateSchema,
  type AdminLogin,
  type DoctorLoginInitiate,
  type PatientLoginOtpInitiate,
  type UserRole,
} from "@madamgy/api-client";
import { NumPad } from "../components/kiosk/NumPad";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { api } from "../lib/api";
import { getApiErrorMessage } from "../lib/errors";
import { useAuthStore } from "../store/auth.store";

type EntryRole = "PATIENT" | "DOCTOR" | "ADMIN";

const ROLE_LABELS: Record<EntryRole, string> = {
  PATIENT: "Patient",
  DOCTOR: "Doctor",
  ADMIN: "Admin",
};

const ROLE_HOME: Record<UserRole, string> = {
  PATIENT: "/dashboard",
  DOCTOR: "/doctor",
  ADMIN: "/admin",
  SUPER_ADMIN: "/admin",
};

interface LoginResponse {
  accessToken: string;
  user: { id: string; name: string; role: UserRole };
}

function roleFromParam(value: string | null): EntryRole {
  if (value === "doctor") return "DOCTOR";
  if (value === "admin") return "ADMIN";
  return "PATIENT";
}

export default function Entry() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [role, setRole] = useState<EntryRole>(() => roleFromParam(searchParams.get("role")));
  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const patientForm = useForm<PatientLoginOtpInitiate>({ resolver: zodResolver(PatientLoginOtpInitiateSchema) });
  const doctorForm = useForm<DoctorLoginInitiate>({ resolver: zodResolver(DoctorLoginInitiateSchema) });
  const adminForm = useForm<AdminLogin>({ resolver: zodResolver(AdminLoginSchema) });

  function changeRole(value: EntryRole): void {
    setRole(value);
    setStep("credentials");
    setOtp("");
  }

  function enterApp(user: { role: UserRole }): void {
    navigate(ROLE_HOME[user.role]);
  }

  async function sendPatientOtp(values: PatientLoginOtpInitiate): Promise<void> {
    setSubmitting(true);
    try {
      await api.post("/auth/patient/login/otp/initiate", values);
      setPhone(values.phone);
      setStep("otp");
      toast.success("OTP sent");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not send the OTP. Check the number and try again."));
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyPatientOtp(): Promise<void> {
    setSubmitting(true);
    try {
      const response = await api.post<LoginResponse>("/auth/patient/login/otp/verify", { phone, otp });
      setAuth(response.data.accessToken, response.data.user);
      enterApp(response.data.user);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "That code didn't match. Try again."));
      setOtp("");
    } finally {
      setSubmitting(false);
    }
  }

  async function sendDoctorOtp(values: DoctorLoginInitiate): Promise<void> {
    setSubmitting(true);
    try {
      await api.post("/auth/doctor/login/initiate", values);
      setPhone(values.phone);
      setStep("otp");
      toast.success("OTP sent");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not log in. Check your phone and password."));
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyDoctorOtp(): Promise<void> {
    setSubmitting(true);
    try {
      const response = await api.post<LoginResponse>("/auth/doctor/login/verify", { phone, otp });
      setAuth(response.data.accessToken, response.data.user);
      enterApp(response.data.user);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "That code didn't match. Try again."));
      setOtp("");
    } finally {
      setSubmitting(false);
    }
  }

  async function signInAdmin(values: AdminLogin): Promise<void> {
    setSubmitting(true);
    try {
      const response = await api.post<LoginResponse>("/auth/admin/login", values);
      setAuth(response.data.accessToken, response.data.user);
      enterApp(response.data.user);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not sign in. Check your phone and password."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-center bg-background px-6 py-10">
      <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-8">
        <div className="text-center">
          <h1 className="font-display text-4xl font-bold text-foreground">MadamGy</h1>
          <p className="mt-2 text-muted-foreground">Your health, in one tap.</p>
        </div>

        <Card className="w-full rounded-lg border-none shadow-[0_8px_24px_-8px_rgba(219,101,145,0.15)]">
          <CardContent className="flex flex-col gap-6 p-6">
            <div className="flex flex-col gap-2">
              <Label htmlFor="entry-role">I am a</Label>
              <Select value={role} onValueChange={(value) => changeRole(value as EntryRole)}>
                <SelectTrigger id="entry-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROLE_LABELS) as EntryRole[]).map((value) => (
                    <SelectItem key={value} value={value}>
                      {ROLE_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {step === "otp" ? (
              <div className="flex flex-col items-center gap-6">
                <p className="text-center text-sm text-muted-foreground">Enter the 6-digit code sent to {phone}</p>
                <NumPad value={otp} onChange={setOtp} maxLength={6} />
                <Button
                  type="button"
                  disabled={submitting || otp.length !== 6}
                  onClick={() => void (role === "DOCTOR" ? verifyDoctorOtp() : verifyPatientOtp())}
                  className="w-full rounded-full"
                >
                  {submitting ? "Verifying..." : "Log in"}
                </Button>
                <button type="button" onClick={() => setStep("credentials")} className="text-sm font-semibold text-primary">
                  Change phone number
                </button>
              </div>
            ) : role === "PATIENT" ? (
              <form onSubmit={patientForm.handleSubmit(sendPatientOtp)} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="patient-phone">Phone number</Label>
                  <Input id="patient-phone" type="tel" placeholder="10-digit phone number" {...patientForm.register("phone")} />
                  {patientForm.formState.errors.phone && (
                    <p className="text-sm text-red-500">{patientForm.formState.errors.phone.message}</p>
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
            ) : role === "DOCTOR" ? (
              <form onSubmit={doctorForm.handleSubmit(sendDoctorOtp)} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="doctor-phone">Phone number</Label>
                  <Input id="doctor-phone" type="tel" {...doctorForm.register("phone")} />
                  {doctorForm.formState.errors.phone && (
                    <p className="text-sm text-red-500">{doctorForm.formState.errors.phone.message}</p>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="doctor-password">Password</Label>
                  <Input id="doctor-password" type="password" {...doctorForm.register("password")} />
                  {doctorForm.formState.errors.password && (
                    <p className="text-sm text-red-500">{doctorForm.formState.errors.password.message}</p>
                  )}
                </div>
                <Button type="submit" disabled={submitting} className="w-full rounded-full">
                  {submitting ? "Sending..." : "Send OTP"}
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                  Need approval?{" "}
                  <Link to="/doctor/register" className="font-semibold text-primary">
                    Register
                  </Link>
                </p>
              </form>
            ) : (
              <form onSubmit={adminForm.handleSubmit(signInAdmin)} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="admin-phone">Phone number</Label>
                  <Input id="admin-phone" type="tel" {...adminForm.register("phone")} />
                  {adminForm.formState.errors.phone && (
                    <p className="text-sm text-red-500">{adminForm.formState.errors.phone.message}</p>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="admin-password">Password</Label>
                  <Input id="admin-password" type="password" {...adminForm.register("password")} />
                  {adminForm.formState.errors.password && (
                    <p className="text-sm text-red-500">{adminForm.formState.errors.password.message}</p>
                  )}
                </div>
                <Button type="submit" disabled={submitting} className="w-full rounded-full">
                  {submitting ? "Signing in..." : "Sign in"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Delete the retired pages**

```bash
git rm packages/web/src/pages/kiosk/Home.tsx packages/web/src/pages/kiosk/Login.tsx packages/web/src/pages/doctor/Login.tsx packages/web/src/pages/admin/Login.tsx
```

- [ ] **Step 3: Rewrite `App.tsx`**

Replace `packages/web/src/App.tsx` with:

```tsx
import type { ReactNode } from "react";
import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import type { UserRole } from "@madamgy/api-client";
import AdminAuditLog from "./pages/admin/AuditLog";
import AdminCalls from "./pages/admin/Calls";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminDevices from "./pages/admin/Devices";
import AdminDoctors from "./pages/admin/Doctors";
import AdminPatients from "./pages/admin/Patients";
import AdminStats from "./pages/admin/Stats";
import AdminUserDetail from "./pages/admin/UserDetail";
import AdminUsers from "./pages/admin/Users";
import AdminWallet from "./pages/admin/Wallet";
import AdminWithdrawals from "./pages/admin/Withdrawals";
import DeleteAccount from "./pages/legal/DeleteAccount";
import PrivacyPolicy from "./pages/legal/PrivacyPolicy";
import DoctorCall from "./pages/doctor/Call";
import DoctorDashboard from "./pages/doctor/Dashboard";
import DoctorHistory from "./pages/doctor/History";
import DoctorRegister from "./pages/doctor/Register";
import DoctorWallet from "./pages/doctor/Wallet";
import Entry from "./pages/Entry";
import KioskConsult from "./pages/kiosk/Consult";
import KioskDashboard from "./pages/kiosk/Dashboard";
import KioskPrescription from "./pages/kiosk/Prescription";
import KioskRegister from "./pages/kiosk/Register";
import { useAndroidBackButton } from "./hooks/useAndroidBackButton";
import { useAuthStore } from "./store/auth.store";

function RequireRole({ role, loginPath, children }: { role: UserRole | UserRole[]; loginPath?: string; children: ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const allowedRoles = Array.isArray(role) ? role : [role];
  if (!user) {
    return <Navigate to={loginPath ?? "/"} replace />;
  }
  if (!allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  useAndroidBackButton();

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      void SplashScreen.hide();
    }
  }, []);

  return (
    <Routes>
      <Route path="/" element={<Entry />} />
      <Route path="/register" element={<KioskRegister />} />
      <Route path="/delete-account" element={<DeleteAccount />} />
      <Route path="/privacy-policy" element={<PrivacyPolicy />} />
      <Route path="/dashboard" element={<RequireRole role="PATIENT"><KioskDashboard /></RequireRole>} />
      <Route path="/consult" element={<RequireRole role="PATIENT"><KioskConsult /></RequireRole>} />
      <Route path="/prescription/:id" element={<RequireRole role="PATIENT"><KioskPrescription /></RequireRole>} />
      <Route path="/doctor/login" element={<Navigate to="/?role=doctor" replace />} />
      <Route path="/doctor/register" element={<DoctorRegister />} />
      <Route path="/doctor" element={<RequireRole role="DOCTOR" loginPath="/?role=doctor"><DoctorDashboard /></RequireRole>} />
      <Route path="/doctor/call/:id" element={<RequireRole role="DOCTOR" loginPath="/?role=doctor"><DoctorCall /></RequireRole>} />
      <Route path="/doctor/wallet" element={<RequireRole role="DOCTOR" loginPath="/?role=doctor"><DoctorWallet /></RequireRole>} />
      <Route path="/doctor/history" element={<RequireRole role="DOCTOR" loginPath="/?role=doctor"><DoctorHistory /></RequireRole>} />
      <Route path="/admin/login" element={<Navigate to="/?role=admin" replace />} />
      <Route path="/admin" element={<RequireRole role={["SUPER_ADMIN", "ADMIN"]} loginPath="/?role=admin"><AdminDashboard /></RequireRole>} />
      <Route path="/admin/doctors" element={<RequireRole role="SUPER_ADMIN" loginPath="/?role=admin"><AdminDoctors /></RequireRole>} />
      <Route path="/admin/users" element={<RequireRole role="SUPER_ADMIN" loginPath="/?role=admin"><AdminUsers /></RequireRole>} />
      <Route path="/admin/users/:id" element={<RequireRole role="SUPER_ADMIN" loginPath="/?role=admin"><AdminUserDetail /></RequireRole>} />
      <Route path="/admin/stats" element={<RequireRole role={["SUPER_ADMIN", "ADMIN"]} loginPath="/?role=admin"><AdminStats /></RequireRole>} />
      <Route path="/admin/calls" element={<RequireRole role={["SUPER_ADMIN", "ADMIN"]} loginPath="/?role=admin"><AdminCalls /></RequireRole>} />
      <Route path="/admin/withdrawals" element={<RequireRole role="SUPER_ADMIN" loginPath="/?role=admin"><AdminWithdrawals /></RequireRole>} />
      <Route path="/admin/devices" element={<RequireRole role="ADMIN" loginPath="/?role=admin"><AdminDevices /></RequireRole>} />
      <Route path="/admin/wallet" element={<RequireRole role="ADMIN" loginPath="/?role=admin"><AdminWallet /></RequireRole>} />
      <Route path="/admin/patients" element={<RequireRole role="ADMIN" loginPath="/?role=admin"><AdminPatients /></RequireRole>} />
      <Route path="/admin/audit-log" element={<RequireRole role={["SUPER_ADMIN", "ADMIN"]} loginPath="/?role=admin"><AdminAuditLog /></RequireRole>} />
    </Routes>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors. If it complains about unused `AdminLogin`/`DoctorLogin`/`KioskLogin`/`KioskHome` imports anywhere else in the codebase, grep for them (`grep -rn "pages/kiosk/Home\|pages/kiosk/Login\|pages/doctor/Login\|pages/admin/Login" packages/web/src`) and remove the stale import — there should be none outside the old `App.tsx`.

- [ ] **Step 5: Manual verify**

Run `npm run dev --workspace @madamgy/web` (and ensure `packages/server` dev + docker services are running). At a 390px-wide viewport:
1. Open `/` — confirm it shows the role dropdown defaulted to "Patient", a phone input, "Send OTP".
2. Enter any 10-digit number, tap "Send OTP" — confirm it advances to the OTP screen with the restyled NumPad.
3. Enter `000000`, tap "Log in" — confirm it navigates to `/dashboard` (an existing patient account) or reports the actual API error if the number isn't registered (either is correct behavior; only the earlier port-conflict environment bug caused true breakage).
4. Back on `/`, switch the dropdown to "Doctor" — confirm phone + password fields appear instead.
5. Switch to "Admin" — confirm phone + password appear with a single "Sign in" button and no OTP step.
6. Visit `/doctor/login` directly — confirm it redirects to `/?role=doctor` and the dropdown is pre-set to Doctor.
7. Visit `/admin/login` directly — confirm the same for Admin.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/pages/Entry.tsx packages/web/src/App.tsx
git commit -m "feat: consolidate login pages into a single role-based Entry screen"
```

---

### Task 6: Restyle Register.tsx (patient signup)

**Files:**
- Modify: `packages/web/src/pages/kiosk/Register.tsx`

**Interfaces:**
- Consumes: `components/ui/{button,card,input,label}` (Task 1).
- Produces: no change to `POST /auth/patient/register` request shape or `useAuthStore.setAuth` call — purely visual.

- [ ] **Step 1: Rewrite the page**

Replace `packages/web/src/pages/kiosk/Register.tsx` with:

```tsx
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
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center font-display text-3xl font-bold text-foreground">Create account</h1>
        <Card className="rounded-lg border-none shadow-[0_8px_24px_-8px_rgba(219,101,145,0.15)]">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="register-name">Full name</Label>
                <Input id="register-name" {...register("name")} placeholder="Your name" />
                {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="register-phone">Phone number</Label>
                <Input id="register-phone" {...register("phone")} type="tel" placeholder="10-digit phone number" />
                {errors.phone && <p className="text-sm text-red-500">{errors.phone.message}</p>}
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
                {errors.dob && <p className="text-sm text-red-500">{errors.dob.message}</p>}
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
                          ? "flex-1 rounded-full bg-primary py-2 text-sm font-semibold text-primary-foreground"
                          : "flex-1 rounded-full border border-input py-2 text-sm font-semibold text-foreground"
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
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors.

- [ ] **Step 3: Manual verify**

At `/register` (390px viewport): confirm the card styling matches Entry's card (same radius, same shadow), the gender toggle switches to filled-rose when selected, the submit button stays disabled until the consent checkbox is checked, and "Log in" links back to `/`. Complete a real registration and confirm it lands on `/dashboard`.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/pages/kiosk/Register.tsx
git commit -m "feat: restyle patient registration page"
```

---

### Task 7: Restyle Dashboard.tsx (patient home)

**Files:**
- Modify: `packages/web/src/pages/kiosk/Dashboard.tsx`

**Interfaces:**
- Consumes: `components/ui/{button,alert-dialog}` (Task 1).
- Produces: no change to any API call — purely visual, plus the inline delete-account confirmation becomes a shadcn `AlertDialog`.

- [ ] **Step 1: Rewrite the page**

Replace `packages/web/src/pages/kiosk/Dashboard.tsx` with:

```tsx
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import type { HealthFile } from "@madamgy/api-client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../components/ui/alert-dialog";
import { Button } from "../../components/ui/button";
import { IdleGuard } from "../../components/kiosk/IdleGuard";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";
import { logout } from "../../lib/logout";
import { connectSocket } from "../../lib/socket";
import { useAuthStore } from "../../store/auth.store";

export default function KioskDashboard() {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const [uploading, setUploading] = useState(false);
  const { data: files, refetch } = useQuery({
    queryKey: ["health-files"],
    queryFn: () => api.get<HealthFile[]>("/health-files").then((response) => response.data),
  });

  useEffect(() => {
    const socket = connectSocket();
    socket.on("prescription:ready", ({ healthFileId }: { healthFileId: string }) => {
      toast.success("Prescription ready!");
      void refetch();
      navigate(`/prescription/${healthFileId}`);
    });

    return () => {
      socket.off("prescription:ready");
    };
  }, [navigate, refetch]);

  async function uploadFile(file: File): Promise<void> {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await api.post("/health-files", formData, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Lab report uploaded");
      await refetch();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "We couldn't upload that file. Try again."));
    } finally {
      setUploading(false);
    }
  }

  async function deleteFile(id: string): Promise<void> {
    try {
      await api.delete(`/health-files/${id}`);
      toast.success("Lab report deleted");
      await refetch();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "We couldn't delete that file. Try again."));
    }
  }

  async function deleteAccount(): Promise<void> {
    try {
      await api.delete("/account/me");
      await logout();
      navigate("/");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "We couldn't delete your account. Try again."));
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <IdleGuard />
      <div className="mx-auto max-w-md px-6 py-10">
        <div className="mb-8 flex flex-col gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Welcome, {user?.name}</h1>
            <p className="text-muted-foreground">Your health folder</p>
          </div>
          <Button onClick={() => navigate("/consult")} className="w-full rounded-full py-6 text-lg">
            Consult doctor
          </Button>
        </div>

        <label className="mb-6 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-input bg-card p-6 text-center">
          <span className="font-semibold text-primary">{uploading ? "Uploading..." : "Upload lab report"}</span>
          <span className="mt-1 text-sm text-muted-foreground">PDF or image, up to 10MB</span>
          <input
            type="file"
            disabled={uploading}
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) {
                void uploadFile(file);
              }
            }}
          />
        </label>

        <div className="flex flex-col gap-3">
          {files?.length === 0 && <p className="py-12 text-center text-muted-foreground">No files yet. Start a consultation.</p>}
          {files?.map((file) => (
            <div key={file.id} className="rounded-lg bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <button type="button" onClick={() => navigate(`/prescription/${file.id}`)} className="text-left">
                  <p className="font-semibold text-foreground">{file.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {file.type === "PRESCRIPTION" ? "Prescription" : "Lab report"} · {format(new Date(file.createdAt), "dd MMM yyyy")}
                  </p>
                </button>
                {file.type !== "PRESCRIPTION" && (
                  <button
                    type="button"
                    onClick={() => void deleteFile(file.id)}
                    className="rounded-full bg-[#DC262614] px-4 py-2 text-sm font-semibold text-red-600"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 border-t border-input pt-6 text-center">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button type="button" className="text-sm text-red-600 underline">
                Delete my account
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>This permanently deletes your account. This cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void deleteAccount()} className="bg-red-600 hover:bg-red-700">
                  Yes, delete my account
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors.

- [ ] **Step 3: Manual verify**

At `/dashboard` (390px viewport, logged in as a patient): confirm the card list, upload dropzone, and "Consult doctor" pill button render with brand tokens. Tap "Delete my account" — confirm a modal dialog appears (not the old inline text swap) with Cancel/confirm actions, and Cancel dismisses it without calling the API.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/pages/kiosk/Dashboard.tsx
git commit -m "feat: restyle patient dashboard, delete-account as AlertDialog"
```

---

### Task 8: Restyle Consult.tsx (uses PulseRing)

**Files:**
- Modify: `packages/web/src/pages/kiosk/Consult.tsx`

**Interfaces:**
- Consumes: `PulseRing` (Task 3).
- Produces: no change to call-setup logic — only the two loading-state blocks change markup.

- [ ] **Step 1: Add the import**

At the top of `packages/web/src/pages/kiosk/Consult.tsx`, add:

```tsx
import { PulseRing } from "../../components/brand/PulseRing";
```

- [ ] **Step 2: Replace the first loading block**

Find:

```tsx
  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
        <div className="h-16 w-16 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        <p className="text-center text-2xl text-gray-700">{waitingText}</p>
        <button type="button" onClick={cancel} className="mt-4 text-lg text-gray-500 underline">
          Cancel
        </button>
      </div>
    );
  }
```

Replace with:

```tsx
  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-8">
        <PulseRing size="lg" />
        <p className="text-center text-xl text-foreground">{waitingText}</p>
        <button type="button" onClick={cancel} className="mt-4 text-muted-foreground underline">
          Cancel
        </button>
      </div>
    );
  }
```

- [ ] **Step 3: Update the video-call container background**

Find:

```tsx
      <div className="flex min-h-screen flex-col bg-gray-50 lg:flex-row">
```

Replace with:

```tsx
      <div className="flex min-h-screen flex-col bg-background lg:flex-row">
```

- [ ] **Step 4: Replace the second loading block**

Find:

```tsx
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="h-16 w-16 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      <p className="text-center text-2xl text-gray-700">{callSession?.status === "RINGING" ? "Waiting for doctor to accept..." : "Finding available doctor..."}</p>
      <button type="button" onClick={cancel} className="mt-4 text-lg text-gray-500 underline">
        Cancel
      </button>
    </div>
  );
```

Replace with:

```tsx
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-8">
      <PulseRing size="lg" />
      <p className="text-center text-xl text-foreground">{callSession?.status === "RINGING" ? "Waiting for doctor to accept..." : "Finding available doctor..."}</p>
      <button type="button" onClick={cancel} className="mt-4 text-muted-foreground underline">
        Cancel
      </button>
    </div>
  );
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors.

- [ ] **Step 6: Manual verify**

From `/dashboard`, tap "Consult doctor" — confirm the "Finding available doctor..." screen shows the PulseRing (rose ripple rings) instead of the old spinning border, and "Cancel" still returns to `/dashboard`.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/pages/kiosk/Consult.tsx
git commit -m "feat: use PulseRing for consult waiting states"
```

---

### Task 9: Restyle Prescription.tsx and its subcomponents

**Files:**
- Modify: `packages/web/src/pages/kiosk/Prescription.tsx`
- Modify: `packages/web/src/components/prescription/PrescriptionViewer.tsx`
- Modify: `packages/web/src/components/prescription/PrintButton.tsx`
- Modify: `packages/web/src/components/prescription/PrescriptionDoc.tsx`

**Interfaces:**
- Consumes: `PulseRing` (Task 3), `components/ui/button` (Task 1).
- Produces: no change to any props/API call — purely visual.

- [ ] **Step 1: Rewrite `Prescription.tsx`**

Replace `packages/web/src/pages/kiosk/Prescription.tsx` with:

```tsx
import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import type { HealthFile } from "@madamgy/api-client";
import { IdleGuard } from "../../components/kiosk/IdleGuard";
import { PulseRing } from "../../components/brand/PulseRing";
import { PrescriptionViewer } from "../../components/prescription/PrescriptionViewer";
import { PrintButton } from "../../components/prescription/PrintButton";
import { api } from "../../lib/api";

export default function KioskPrescription() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const printRef = useRef<HTMLDivElement>(null);
  const { data: file, isLoading } = useQuery({
    queryKey: ["health-file", id],
    queryFn: () => api.get<HealthFile>(`/health-files/${id}`).then((response) => response.data),
    enabled: Boolean(id),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <PulseRing size="lg" />
      </div>
    );
  }
  if (!file) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-lg text-red-500">We couldn't find that file.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <IdleGuard />
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex items-center justify-between gap-4">
          <button type="button" onClick={() => navigate("/dashboard")} className="text-primary">
            &larr; Back
          </button>
          <PrintButton targetRef={printRef} />
        </div>
        <PrescriptionViewer ref={printRef} pdfUrl={file.url} name={file.name} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `PrescriptionViewer.tsx`**

Replace `packages/web/src/components/prescription/PrescriptionViewer.tsx` with:

```tsx
import { forwardRef } from "react";

interface PrescriptionViewerProps {
  pdfUrl: string;
  name: string;
}

export const PrescriptionViewer = forwardRef<HTMLDivElement, PrescriptionViewerProps>(({ pdfUrl, name }, ref) => (
  <div ref={ref} className="overflow-hidden rounded-lg bg-card shadow-sm">
    <div className="border-b border-input bg-[#EE908D14] p-4">
      <h3 className="font-display font-semibold text-foreground">{name}</h3>
    </div>
    <iframe src={pdfUrl} title={name} className="w-full" style={{ height: "60vh", border: "none" }} />
  </div>
));

PrescriptionViewer.displayName = "PrescriptionViewer";
```

- [ ] **Step 3: Rewrite `PrintButton.tsx`**

Replace `packages/web/src/components/prescription/PrintButton.tsx` with:

```tsx
import type { RefObject } from "react";
import { useReactToPrint } from "react-to-print";
import { Button } from "../ui/button";

interface PrintButtonProps {
  targetRef: RefObject<HTMLElement>;
}

export function PrintButton({ targetRef }: PrintButtonProps) {
  const handlePrint = useReactToPrint({ content: () => targetRef.current });

  return (
    <Button type="button" onClick={() => handlePrint()} className="rounded-full">
      Print prescription
    </Button>
  );
}
```

- [ ] **Step 4: Rewrite `PrescriptionDoc.tsx`**

Replace `packages/web/src/components/prescription/PrescriptionDoc.tsx` with:

```tsx
interface PrescriptionDocProps {
  text: string;
}

export function PrescriptionDoc({ text }: PrescriptionDocProps) {
  return <div className="whitespace-pre-wrap text-base leading-7 text-foreground">{text}</div>;
}
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors.

- [ ] **Step 6: Manual verify**

From `/dashboard`, tap a prescription file — confirm the viewer card, header strip, and "Print prescription" pill button render with brand tokens, and the PDF iframe still loads.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/pages/kiosk/Prescription.tsx packages/web/src/components/prescription
git commit -m "feat: restyle prescription viewer and print button"
```

---

## Not in this plan

Separate follow-up plans, each its own subsystem, reusing the Task 1/2/3 foundation established here:

- **Doctor flow:** `doctor/Register.tsx`, `doctor/Dashboard.tsx`, `doctor/Call.tsx`, `doctor/Wallet.tsx`, `doctor/History.tsx`, `components/video/DoctorCallView.tsx`, `components/call/*` (including `VitalsForm.tsx`'s actual usage site, `CallChatPanel.tsx`), `components/wallet/WalletPanel.tsx`.
- **Admin panel:** all of `pages/admin/*` — needs its own layout decision (shared sidebar/nav shell) before individual pages, plus `Table`/`DropdownMenu`/`Sheet` adoption for the data-heavy pages.
- **Legal pages:** `legal/DeleteAccount.tsx`, `legal/PrivacyPolicy.tsx` — simple token-only pass, no new components needed.
- **App shell assets:** the actual splash screen PNG/icon (image assets, not React code) coordinating with the existing native-shell Task 4 in the frontend plan — not something this code-focused plan can produce.
- **Contrast fix:** the spec flagged `--muted-foreground` (`#A8A6A6`) on `--background` (`#FEF8F8`) as a likely WCAG AA failure for body-sized text. Run an actual contrast checker against the pages built in this plan once they're rendered, and darken `--muted-foreground` in Task 1's token block if it fails — this needs the real rendered pages to verify against, not just the spec's static tokens.
