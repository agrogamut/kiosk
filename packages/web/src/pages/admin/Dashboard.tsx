import { Link, useNavigate } from "react-router-dom";
import { logout } from "../../lib/logout";
import { useAuthStore } from "../../store/auth.store";

const SUPER_ADMIN_LINKS = [
  { label: "Stats", href: "/admin/stats" },
  { label: "Doctors", href: "/admin/doctors" },
  { label: "Users", href: "/admin/users" },
  { label: "Call History", href: "/admin/calls" },
  { label: "Withdrawals", href: "/admin/withdrawals" },
  { label: "Audit Log", href: "/admin/audit-log" },
];

const KIOSK_ADMIN_LINKS = [
  { label: "Stats", href: "/admin/stats" },
  { label: "Call History", href: "/admin/calls" },
  { label: "Patients", href: "/admin/patients" },
  { label: "My Devices", href: "/admin/devices" },
  { label: "Wallet", href: "/admin/wallet" },
  { label: "Audit Log", href: "/admin/audit-log" },
];

export default function AdminDashboard() {
  const navigate = useNavigate();
  const role = useAuthStore((state) => state.user?.role);
  const links = role === "ADMIN" ? KIOSK_ADMIN_LINKS : SUPER_ADMIN_LINKS;

  async function signOut(): Promise<void> {
    await logout();
    navigate("/admin/login");
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mb-8 flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Admin Panel</h1>
        <button type="button" onClick={() => void signOut()} className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white">
          Logout
        </button>
      </div>
      <div className="grid max-w-lg grid-cols-1 gap-6 sm:grid-cols-2">
        {links.map((item) => (
          <Link
            key={item.href}
            to={item.href}
            className="rounded-2xl border border-gray-100 bg-white p-6 text-center text-xl font-semibold text-blue-700 shadow-sm transition-colors hover:border-blue-300"
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
