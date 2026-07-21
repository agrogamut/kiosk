import type { ReactNode } from "react";
import { useEffect } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import type { UserRole } from "@madamgy/api-client";
import AdminAuditLog from "./pages/admin/AuditLog";
import AdminCalls from "./pages/admin/Calls";
import AdminDevices from "./pages/admin/Devices";
import AdminDoctors from "./pages/admin/Doctors";
import AdminPatients from "./pages/admin/Patients";
import AdminPricing from "./pages/admin/Pricing";
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
import DoctorPrescriptions from "./pages/doctor/Prescriptions";
import DoctorRegister from "./pages/doctor/Register";
import DoctorWallet from "./pages/doctor/Wallet";
import Entry from "./pages/Entry";
import KioskConsult from "./pages/kiosk/Consult";
import KioskDashboard from "./pages/kiosk/Dashboard";
import KioskPrescription from "./pages/kiosk/Prescription";
import KioskRegister from "./pages/kiosk/Register";
import { AdminShell } from "./components/layout/AdminShell";
import { DoctorShell } from "./components/layout/DoctorShell";
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
      <Route
        element={
          <RequireRole role="DOCTOR" loginPath="/?role=doctor">
            <DoctorShell>
              <Outlet />
            </DoctorShell>
          </RequireRole>
        }
      >
        <Route path="/doctor" element={<DoctorDashboard />} />
        <Route path="/doctor/wallet" element={<DoctorWallet />} />
        <Route path="/doctor/history" element={<DoctorHistory />} />
        <Route path="/doctor/prescriptions" element={<DoctorPrescriptions />} />
      </Route>
      <Route path="/doctor/call/:id" element={<RequireRole role="DOCTOR" loginPath="/?role=doctor"><DoctorCall /></RequireRole>} />
      <Route path="/admin/login" element={<Navigate to="/?role=admin" replace />} />
      <Route
        element={
          <RequireRole role={["SUPER_ADMIN", "ADMIN"]} loginPath="/?role=admin">
            <AdminShell>
              <Outlet />
            </AdminShell>
          </RequireRole>
        }
      >
        <Route path="/admin" element={<Navigate to="/admin/stats" replace />} />
        <Route path="/admin/doctors" element={<RequireRole role="SUPER_ADMIN" loginPath="/?role=admin"><AdminDoctors /></RequireRole>} />
        <Route path="/admin/users" element={<RequireRole role="SUPER_ADMIN" loginPath="/?role=admin"><AdminUsers /></RequireRole>} />
        <Route path="/admin/users/:id" element={<RequireRole role="SUPER_ADMIN" loginPath="/?role=admin"><AdminUserDetail /></RequireRole>} />
        <Route path="/admin/stats" element={<AdminStats />} />
        <Route path="/admin/calls" element={<AdminCalls />} />
        <Route path="/admin/withdrawals" element={<RequireRole role="SUPER_ADMIN" loginPath="/?role=admin"><AdminWithdrawals /></RequireRole>} />
        <Route path="/admin/pricing" element={<RequireRole role="SUPER_ADMIN" loginPath="/?role=admin"><AdminPricing /></RequireRole>} />
        <Route path="/admin/devices" element={<RequireRole role="ADMIN" loginPath="/?role=admin"><AdminDevices /></RequireRole>} />
        <Route path="/admin/wallet" element={<RequireRole role="ADMIN" loginPath="/?role=admin"><AdminWallet /></RequireRole>} />
        <Route path="/admin/patients" element={<RequireRole role="ADMIN" loginPath="/?role=admin"><AdminPatients /></RequireRole>} />
        <Route path="/admin/audit-log" element={<AdminAuditLog />} />
      </Route>
    </Routes>
  );
}
