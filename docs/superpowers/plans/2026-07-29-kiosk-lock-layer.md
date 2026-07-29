# Kiosk Lock Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a device-local "kiosk lock" to the shared login screen so a physical terminal shows patient-login-only after an admin logs in on it once, plus finish wiring the device-based revenue-attribution mechanism that was designed in 2026-07-15 but never actually connected to the booking request.

**Architecture:** Frontend-only. A new persisted zustand store holds a stable per-install device ID and a locked flag. `Entry.tsx`'s existing admin login, on success, registers that device ID against the existing kiosk-device backend (unchanged) and flips the lock. `Entry.tsx` renders the role picker only when unlocked; a hidden long-press-the-logo gate reveals the admin login again for a one-time peek at the dashboard. `Consult.tsx` starts sending the device ID on every booking, which is the missing piece that makes the existing server-side attribution logic actually fire.

**Tech Stack:** React 18 + Vite, zustand (+ `persist` middleware, already used by `auth.store.ts`), react-hook-form + zod (existing form pattern), axios (`api` client in `lib/api.ts`). No new dependencies.

## Global Constraints

- No backend or schema changes anywhere in this plan — `POST /auth/admin/login`, `POST /admin/kiosk-devices`, and `POST /calls` (with its already-optional `deviceId` field) are used exactly as they exist today.
- `packages/web` has no automated test runner (only `tsc --noEmit` via the `typecheck` script — confirmed by inspecting `package.json`, no vitest/jest/testing-library present). Do not introduce one as part of this plan. Every task's verification is: `npm run typecheck --workspace @madamgy/web` passes, then a manual check in a running dev server, per this project's standing rule that frontend changes get verified in a real browser before being called done.
- Run the full stack for manual verification with `npm run dev` from the repo root (`new/`) — starts both `@madamgy/server` and `@madamgy/web` together. Requires `docker-compose up -d` (postgres/redis/minio/livekit) already running per this project's existing dev setup.
- Visual styling of the locked screen and the hidden unlock affordance is explicitly out of scope for this plan (per the design spec) — implement it functionally plain; a later visual-design pass owns the "stylish but minimal" treatment.
- Do not touch `packages/web/src/pages/admin/Devices.tsx` — it stays as the existing manual device-management page, unaffected by this plan.

---

## File Structure

- **Create** `packages/web/src/store/kiosk.store.ts` — persisted device ID + locked flag. No dependencies on other new files.
- **Modify** `packages/web/src/pages/kiosk/Consult.tsx` — both `POST /calls` call sites gain `deviceId`. Depends on the store from the task above.
- **Modify** `packages/web/src/pages/Entry.tsx` — kiosk-registration-and-lock trigger in the admin login handler, locked-mode rendering, hidden unlock gate. Depends on the store; independent of the `Consult.tsx` change (can be done in either order, but the store must exist first).

---

### Task 1: Kiosk device-identity and lock-state store

**Files:**
- Create: `packages/web/src/store/kiosk.store.ts`

**Interfaces:**
- Produces: `useKioskStore` — a zustand hook exposing `{ deviceId: string; locked: boolean; lock: () => void; unlock: () => void }`. Later tasks read `useKioskStore.getState().deviceId` (outside React components, e.g. inside async handlers) and `useKioskStore((state) => state.locked)` (inside component render).

- [ ] **Step 1: Create the store file**

```ts
// packages/web/src/store/kiosk.store.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

const DEVICE_ID_STORAGE_KEY = "madamgy-kiosk-device-id";

function getOrCreateDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (existing) {
    return existing;
  }
  const generated = crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_STORAGE_KEY, generated);
  return generated;
}

interface KioskState {
  deviceId: string;
  locked: boolean;
  lock: () => void;
  unlock: () => void;
}

export const useKioskStore = create<KioskState>()(
  persist(
    (set) => ({
      deviceId: getOrCreateDeviceId(),
      locked: false,
      lock: () => set({ locked: true }),
      unlock: () => set({ locked: false }),
    }),
    {
      name: "madamgy-kiosk",
      partialize: (state) => ({ locked: state.locked }),
    },
  ),
);
```

Note on the design: `deviceId` is deliberately read/written through a plain `localStorage` call (`getOrCreateDeviceId`) rather than left to zustand's `persist` rehydration. `persist` only writes to storage when `set()` is called from outside, so a device that's never triggered `lock()` (e.g. a personal phone that's never been used as a kiosk) would otherwise get a fresh random ID on every page load instead of a stable one. Reading/writing `deviceId` directly at store-creation time sidesteps that timing issue entirely. `partialize` keeps zustand's own persisted blob to just `locked`, so there's exactly one source of truth for each piece of state.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: passes with no errors (this file has no consumers yet, so it can only fail on a syntax/type mistake in the file itself).

- [ ] **Step 3: Manual verification**

Run `npm run dev` from `new/`, open the web app in a browser, open devtools → Application → Local Storage for that origin.
Expected: a `madamgy-kiosk-device-id` key appears automatically on page load, holding a UUID-looking string (e.g. `3fa85f64-5717-4562-b3fc-2c963f66afa6`). Reload the page — the value must stay exactly the same (confirms stability). There should be no `madamgy-kiosk` key yet, or if zustand's `persist` created an empty one, it should contain only `{"state":{"locked":false},...}` — confirming `deviceId` is not duplicated into that blob.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/store/kiosk.store.ts
git commit -m "feat: add persisted kiosk device-id and lock-state store"
```

---

### Task 2: Send the device ID on every booking request

**Files:**
- Modify: `packages/web/src/pages/kiosk/Consult.tsx`

**Interfaces:**
- Consumes: `useKioskStore` from Task 1 — specifically `useKioskStore.getState().deviceId` (read once per call, outside a render, so `getState()` is correct here rather than the hook form).

- [ ] **Step 1: Add the import**

In `packages/web/src/pages/kiosk/Consult.tsx`, add near the other store import:

```ts
import { useKioskStore } from "../../store/kiosk.store";
```

- [ ] **Step 2: Include `deviceId` in the pay-then-call request**

Find this existing line inside `createCallWithPayment`:

```ts
        const response = await api.post("/calls", { paymentId });
```

Replace with:

```ts
        const response = await api.post("/calls", { paymentId, deviceId: useKioskStore.getState().deviceId });
```

- [ ] **Step 3: Include `deviceId` in the free-consult request**

Find this existing line inside `startConsult`:

```ts
        const response = await api.post("/calls");
```

Replace with:

```ts
        const response = await api.post("/calls", { deviceId: useKioskStore.getState().deviceId });
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: passes. (`CallCreateSchema.deviceId` is already `z.string().min(1).optional()` server-side and the request body here is untyped JSON from axios's perspective, so no type-level friction is expected — this step exists to catch a typo, not a type mismatch.)

- [ ] **Step 5: Manual verification**

With the full stack running (`npm run dev` from `new/`), log in as a patient and start a consult (either the free path or, if `RAZORPAY` env vars are configured in this environment, the paid path). Open devtools → Network, find the `POST /calls` (or `/api/calls`) request, inspect its request payload.
Expected: the JSON body includes a `deviceId` field whose value matches the UUID seen in `localStorage` under `madamgy-kiosk-device-id` from Task 1's verification step. The call should still start normally (this change must not break booking for a never-registered device — an unresolved `deviceId` server-side is expected to fall through to the existing un-attributed split, not error).

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/pages/kiosk/Consult.tsx
git commit -m "feat: send device id on booking so kiosk attribution actually resolves"
```

---

### Task 3: Kiosk lock trigger, locked entry screen, and hidden unlock gate

**Files:**
- Modify: `packages/web/src/pages/Entry.tsx`

**Interfaces:**
- Consumes: `useKioskStore` from Task 1 (`deviceId`, `locked`, `lock`).
- Produces: nothing consumed by later tasks — this is the last task in this plan.

Context for whoever implements this: today `Entry.tsx` always shows a role dropdown (Patient/Doctor/Admin) above the login form. This task makes three behavioral changes to that one file: (1) a successful `ADMIN`-role login now also registers this device as that admin's kiosk and locks it, (2) while locked, the dropdown is hidden and the form always renders as the patient login, (3) a long-press (800ms) on the logo reveals the admin login form again — on success it goes to the dashboard as normal but does **not** persist an "unlocked" state, so the device is locked again (dropdown hidden) the next time this screen mounts.

Only role `"ADMIN"` triggers the lock — a `SUPER_ADMIN` logging in through the same form must not lock the device (a super-admin using a shared/office terminal for admin work should not turn that terminal into a kiosk).

- [ ] **Step 1: Replace the full contents of `packages/web/src/pages/Entry.tsx`**

```tsx
import { useRef, useState } from "react";
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
import { Logo } from "../components/brand/Logo";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { api } from "../lib/api";
import { getApiErrorMessage } from "../lib/errors";
import { useAuthStore } from "../store/auth.store";
import { useKioskStore } from "../store/kiosk.store";

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

const UNLOCK_HOLD_MS = 800;

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
  const locked = useKioskStore((state) => state.locked);
  const lockDevice = useKioskStore((state) => state.lock);
  const deviceId = useKioskStore((state) => state.deviceId);
  const [role, setRole] = useState<EntryRole>(() => roleFromParam(searchParams.get("role")));
  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showUnlock, setShowUnlock] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const patientForm = useForm<PatientLoginOtpInitiate>({ resolver: zodResolver(PatientLoginOtpInitiateSchema) });
  const doctorForm = useForm<DoctorLoginInitiate>({ resolver: zodResolver(DoctorLoginInitiateSchema) });
  const adminForm = useForm<AdminLogin>({ resolver: zodResolver(AdminLoginSchema) });

  const displayRole: EntryRole = locked ? (showUnlock ? "ADMIN" : "PATIENT") : role;

  function changeRole(value: EntryRole): void {
    setRole(value);
    setStep("credentials");
    setOtp("");
  }

  function enterApp(user: { role: UserRole }): void {
    navigate(ROLE_HOME[user.role]);
  }

  function startUnlockHold(): void {
    holdTimer.current = setTimeout(() => setShowUnlock(true), UNLOCK_HOLD_MS);
  }

  function cancelUnlockHold(): void {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
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

      if (response.data.user.role === "ADMIN" && !locked) {
        try {
          await api.post("/admin/kiosk-devices", { deviceId });
          lockDevice();
        } catch {
          // Registration can fail (e.g. this device is already claimed, active, by a
          // different admin) -- the admin still reaches their dashboard normally,
          // the device just doesn't lock. Never block sign-in on this.
        }
      }

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
          <div
            className="select-none"
            onMouseDown={locked && !showUnlock ? startUnlockHold : undefined}
            onMouseUp={locked && !showUnlock ? cancelUnlockHold : undefined}
            onMouseLeave={locked && !showUnlock ? cancelUnlockHold : undefined}
            onTouchStart={locked && !showUnlock ? startUnlockHold : undefined}
            onTouchEnd={locked && !showUnlock ? cancelUnlockHold : undefined}
          >
            <Logo className="mx-auto h-12 w-auto" />
          </div>
          <p className="mt-2 text-muted-foreground">Your health, in one tap.</p>
        </div>

        <Card className="w-full rounded-lg border-none ring-0 shadow-[0_8px_24px_-8px_rgba(219,101,145,0.15)]">
          <CardContent className="flex flex-col gap-6 p-6">
            {!locked && (
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
            )}

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
              <form onSubmit={doctorForm.handleSubmit(sendDoctorOtp)} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="doctor-phone">Phone number</Label>
                  <Input id="doctor-phone" type="tel" {...doctorForm.register("phone")} />
                  {doctorForm.formState.errors.phone && (
                    <p className="text-sm text-destructive">{doctorForm.formState.errors.phone.message}</p>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="doctor-password">Password</Label>
                  <Input id="doctor-password" type="password" {...doctorForm.register("password")} />
                  {doctorForm.formState.errors.password && (
                    <p className="text-sm text-destructive">{doctorForm.formState.errors.password.message}</p>
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
                    <p className="text-sm text-destructive">{adminForm.formState.errors.phone.message}</p>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="admin-password">Password</Label>
                  <Input id="admin-password" type="password" {...adminForm.register("password")} />
                  {adminForm.formState.errors.password && (
                    <p className="text-sm text-destructive">{adminForm.formState.errors.password.message}</p>
                  )}
                </div>
                <Button type="submit" disabled={submitting} className="w-full rounded-full">
                  {submitting ? "Signing in..." : "Sign in"}
                </Button>
                {locked && showUnlock && (
                  <button type="button" onClick={() => setShowUnlock(false)} className="text-sm font-semibold text-muted-foreground">
                    Cancel
                  </button>
                )}
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: passes with no errors.

- [ ] **Step 3: Manual verification — locking**

With the full stack running (`npm run dev` from `new/`) and a seeded `ADMIN`-role user available (check `packages/server/src/prisma/seed.ts` or the project's existing seed data for admin test credentials — do not invent new ones):
1. Clear the browser's `localStorage` for the app's origin first (a clean "fresh device" state), then load the entry screen. Confirm the role dropdown is visible, as today.
2. Select "Admin", log in with valid admin credentials.
3. Expected: sign-in succeeds and lands on `/admin` as before. Open devtools → Network and confirm a `POST /admin/kiosk-devices` (or `/api/admin/kiosk-devices`) request fired with a 201, carrying the same `deviceId` seen in `localStorage`.
4. Reload the page (or navigate back to `/`). Expected: the role dropdown is now gone; only the patient phone-number form is shown.

- [ ] **Step 4: Manual verification — unlock gate**

Continuing from the locked state above:
1. Press and hold the logo (mouse click-and-hold in a desktop browser, or touch-and-hold on a device/emulator) for slightly under a second.
2. Expected: the screen switches to the admin phone+password form (no dropdown), with a "Cancel" link/button beneath the sign-in button.
3. Click "Cancel". Expected: returns to the patient-only form.
4. Repeat the long-press, this time submit valid admin credentials. Expected: lands on `/admin` normally, and this time no second `POST /admin/kiosk-devices` call should fire (device is already registered/locked — confirm via Network tab that this call is either absent or, if present, was a no-op re-registration; either is acceptable, but re-locking behavior itself must not error).
5. Reload the page again. Expected: back to the patient-only form (the unlock did not persist).

- [ ] **Step 5: Manual verification — conflicting device claim**

If a second admin test account is available: register the same browser's device as kiosk for Admin A (Step 3 above), then clear only the `madamgy-kiosk` localStorage key (not the device-id key) to simulate a fresh app-open state without needing a second physical device, and attempt to log in as Admin B on the same `deviceId`. Expected: sign-in still succeeds and Admin B still lands on `/admin` (never blocked), but the device does not lock — reloading afterward should still show the full role picker, not the patient-only view, since the registration attempt failed with a 409 handled by the existing try/catch. (This check can be skipped if a second admin account isn't readily available in this environment — it's confirming existing, unmodified server behavior, not new logic.)

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/pages/Entry.tsx
git commit -m "feat: lock kiosk devices to patient-only login after admin sign-in"
```

---

## Self-Review Notes

**Spec coverage:** device identity (Task 1), booking now carries `deviceId` closing the attribution gap (Task 2), kiosk login auto-registration + lock (Task 3), locked entry screen (Task 3), unlock flow via hidden gate with session-scoped re-lock (Task 3), no backend changes anywhere, `/admin/devices` untouched — all covered.

**Placeholder scan:** no TBD/TODO; every step has literal code or an exact manual procedure with expected outcomes.

**Type consistency:** `useKioskStore` (Task 1) exposes `deviceId: string`, `locked: boolean`, `lock: () => void`, `unlock: () => void` — Task 2 uses `deviceId` via `getState()`, Task 3 uses `deviceId` and `locked`/`lock` via the reactive hook form; names match exactly across all three tasks. `unlock()` is defined but not called anywhere in this plan (session-scoped unlock is handled by simply not calling it, per the design) — kept on the store's interface since it's a natural, cheap-to-keep escape hatch (e.g. a future "reset this kiosk" admin action), not dead code requiring removal.
