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
import AdminLogin from "./pages/admin/Login";
import AdminPatients from "./pages/admin/Patients";
import AdminStats from "./pages/admin/Stats";
import AdminUserDetail from "./pages/admin/UserDetail";
import AdminUsers from "./pages/admin/Users";
import AdminWallet from "./pages/admin/Wallet";
import AdminWithdrawals from "./pages/admin/Withdrawals";
import DeleteAccount from "./pages/legal/DeleteAccount";
import DoctorCall from "./pages/doctor/Call";
import DoctorDashboard from "./pages/doctor/Dashboard";
import DoctorHistory from "./pages/doctor/History";
import DoctorLogin from "./pages/doctor/Login";
import DoctorRegister from "./pages/doctor/Register";
import DoctorWallet from "./pages/doctor/Wallet";
import KioskConsult from "./pages/kiosk/Consult";
import KioskDashboard from "./pages/kiosk/Dashboard";
import KioskHome from "./pages/kiosk/Home";
import KioskLogin from "./pages/kiosk/Login";
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
      <Route path="/" element={<KioskHome />} />
      <Route path="/register" element={<KioskRegister />} />
      <Route path="/login" element={<KioskLogin />} />
      <Route path="/delete-account" element={<DeleteAccount />} />
      <Route path="/dashboard" element={<RequireRole role="PATIENT"><KioskDashboard /></RequireRole>} />
      <Route path="/consult" element={<RequireRole role="PATIENT"><KioskConsult /></RequireRole>} />
      <Route path="/prescription/:id" element={<RequireRole role="PATIENT"><KioskPrescription /></RequireRole>} />
      <Route path="/doctor/login" element={<DoctorLogin />} />
      <Route path="/doctor/register" element={<DoctorRegister />} />
      <Route path="/doctor" element={<RequireRole role="DOCTOR" loginPath="/doctor/login"><DoctorDashboard /></RequireRole>} />
      <Route path="/doctor/call/:id" element={<RequireRole role="DOCTOR" loginPath="/doctor/login"><DoctorCall /></RequireRole>} />
      <Route path="/doctor/wallet" element={<RequireRole role="DOCTOR" loginPath="/doctor/login"><DoctorWallet /></RequireRole>} />
      <Route path="/doctor/history" element={<RequireRole role="DOCTOR" loginPath="/doctor/login"><DoctorHistory /></RequireRole>} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<RequireRole role={["SUPER_ADMIN", "ADMIN"]} loginPath="/admin/login"><AdminDashboard /></RequireRole>} />
      <Route path="/admin/doctors" element={<RequireRole role="SUPER_ADMIN" loginPath="/admin/login"><AdminDoctors /></RequireRole>} />
      <Route path="/admin/users" element={<RequireRole role="SUPER_ADMIN" loginPath="/admin/login"><AdminUsers /></RequireRole>} />
      <Route path="/admin/users/:id" element={<RequireRole role="SUPER_ADMIN" loginPath="/admin/login"><AdminUserDetail /></RequireRole>} />
      <Route path="/admin/stats" element={<RequireRole role={["SUPER_ADMIN", "ADMIN"]} loginPath="/admin/login"><AdminStats /></RequireRole>} />
      <Route path="/admin/calls" element={<RequireRole role={["SUPER_ADMIN", "ADMIN"]} loginPath="/admin/login"><AdminCalls /></RequireRole>} />
      <Route path="/admin/withdrawals" element={<RequireRole role="SUPER_ADMIN" loginPath="/admin/login"><AdminWithdrawals /></RequireRole>} />
      <Route path="/admin/devices" element={<RequireRole role="ADMIN" loginPath="/admin/login"><AdminDevices /></RequireRole>} />
      <Route path="/admin/wallet" element={<RequireRole role="ADMIN" loginPath="/admin/login"><AdminWallet /></RequireRole>} />
      <Route path="/admin/patients" element={<RequireRole role="ADMIN" loginPath="/admin/login"><AdminPatients /></RequireRole>} />
      <Route path="/admin/audit-log" element={<RequireRole role={["SUPER_ADMIN", "ADMIN"]} loginPath="/admin/login"><AdminAuditLog /></RequireRole>} />
    </Routes>
  );
}
