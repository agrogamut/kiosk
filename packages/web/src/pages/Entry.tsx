import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
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
import { logout } from "../lib/logout";
import { useAuthStore } from "../store/auth.store";
import { useKioskStore } from "../store/kiosk.store";

type EntryRole = "PATIENT" | "DOCTOR" | "KIOSK_OWNER" | "ADMIN";

const ROLE_LABELS: Record<EntryRole, string> = {
  PATIENT: "Patient",
  DOCTOR: "Doctor",
  KIOSK_OWNER: "Kiosk Owner",
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
  if (value === "kiosk-owner") return "KIOSK_OWNER";
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

  const displayRole: EntryRole = locked ? (showUnlock ? "KIOSK_OWNER" : "PATIENT") : role;

  const staleSessionCheckedRef = useRef(false);

  // A freshly-mounted, locked, patient-only screen must never sit on top of a leftover
  // ADMIN/SUPER_ADMIN session -- that session is persisted across app restarts, and RequireRole
  // gates purely on it, so anyone at this terminal could otherwise navigate straight into the
  // admin dashboard without ever seeing this screen. Patients are unaffected.
  //
  // This check runs exactly once, at mount, reading a one-time snapshot of the store instead of
  // reacting to `locked`/`showUnlock`. It must NOT re-run when `locked` flips true later in this
  // same mount's lifetime: `signInAdmin` calls `lockDevice()` (synchronous zustand update) before
  // `navigate()` (async) unmounts this component, so a reactive version of this effect would
  // catch that one intermediate commit -- where `locked` is already true but `showUnlock` is
  // still false -- and force-log-out the admin session that JUST succeeded. A mount-only check
  // still catches every real stale-session case (fresh device, app reopened, back-button return)
  // because those all genuinely start from a fresh mount of this component, with `showUnlock`
  // (local useState, always false on a fresh mount) already false at that point.
  useEffect(() => {
    // Guards against React StrictMode's dev-only double-invoke of effects, which would otherwise
    // run this mount check (and potentially `logout()`) twice for the same real mount.
    if (staleSessionCheckedRef.current) return;
    staleSessionCheckedRef.current = true;

    const wasLockedAtMount = useKioskStore.getState().locked;
    const staleUser = useAuthStore.getState().user;
    const isPrivileged = staleUser?.role === "ADMIN" || staleUser?.role === "SUPER_ADMIN";
    if (wasLockedAtMount && isPrivileged) {
      void logout();
    }
  }, []);

  function changeRole(value: EntryRole): void {
    setRole(value);
    setStep("credentials");
    setOtp("");
  }

  function enterApp(user: { role: UserRole }): void {
    navigate(ROLE_HOME[user.role]);
  }

  function cancelUnlockHold(): void {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }

  function startUnlockHold(): void {
    cancelUnlockHold();
    holdTimer.current = setTimeout(() => {
      setShowUnlock(true);
      // The admin's long-press should always land on the credentials step, even if a patient
      // left the screen mid-OTP-entry -- otherwise the abandoned numpad view wins below since
      // it's checked ahead of displayRole.
      setStep("credentials");
      setOtp("");
    }, UNLOCK_HOLD_MS);
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

      // "Kiosk Owner" and "Admin" are the same login form/endpoint under the hood -- only the
      // expected role differs. A mismatch (e.g. a kiosk owner's phone typed into the Admin
      // entry) must never persist the token or trigger kiosk lock/registration below.
      const expectedRole = displayRole === "KIOSK_OWNER" ? "ADMIN" : "SUPER_ADMIN";
      if (response.data.user.role !== expectedRole) {
        toast.error(
          displayRole === "KIOSK_OWNER"
            ? "That's a platform admin account -- use the Admin login instead."
            : "That's a kiosk owner account -- use the Kiosk Owner login instead.",
        );
        return;
      }

      setAuth(response.data.accessToken, response.data.user);

      if (response.data.user.role === "ADMIN") {
        // `locked` here is the reactive value as of this render, i.e. the device's lock state
        // immediately before this login -- so this is true only on the device's very first lock.
        // Registration re-runs on every login for self-healing, but the label should only be set
        // once: sending it on every login would silently overwrite any custom label an admin set
        // later via /admin/devices. Omitting the field (rather than sending it as `undefined`) is
        // equally safe here -- the schema treats `label` as optional, and the upsert's `update`
        // clause only touches fields it's given -- but omitting is the more explicit choice.
        const isFirstLock = !locked;
        try {
          await api.post(
            "/admin/kiosk-devices",
            isFirstLock ? { deviceId, label: response.data.user.name } : { deviceId },
          );
          lockDevice();
          if (isFirstLock) {
            toast.success("This device is now locked as your kiosk. Long-press the logo to sign in again.");
          }
        } catch (error) {
          // Registration can fail (e.g. this device is already claimed, active, by a
          // different admin) -- the admin still reaches their dashboard normally,
          // the device just doesn't lock. Never block sign-in on this, but surface it
          // so it isn't silently invisible.
          console.error("Kiosk device registration failed", error);
          if (axios.isAxiosError(error) && error.response?.status === 409) {
            toast.error("This device is already registered to another admin.");
          } else {
            toast.error("Could not register this device as a kiosk. Sign-in still succeeded.");
          }
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
            onTouchCancel={locked && !showUnlock ? cancelUnlockHold : undefined}
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
