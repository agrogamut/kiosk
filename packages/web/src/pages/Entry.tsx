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
import { Logo } from "../components/brand/Logo";
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
          <Logo className="mx-auto h-12 w-auto" />
          <p className="mt-2 text-muted-foreground">Your health, in one tap.</p>
        </div>

        <Card className="w-full rounded-lg border-none ring-0 shadow-[0_8px_24px_-8px_rgba(219,101,145,0.15)]">
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
            ) : role === "DOCTOR" ? (
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
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
