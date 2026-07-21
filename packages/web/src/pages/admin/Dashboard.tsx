import { Link, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
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
    <div className="min-h-screen bg-background px-6 py-10">
      <div className="mb-8 flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold text-foreground">Admin panel</h1>
        <Button variant="outline" onClick={() => void signOut()}>
          Logout
        </Button>
      </div>
      <div className="grid max-w-lg grid-cols-1 gap-4 sm:grid-cols-2">
        {links.map((item) => (
          <Link
            key={item.href}
            to={item.href}
            className="rounded-lg bg-card p-6 text-center text-lg font-semibold text-primary shadow-sm transition-shadow hover:shadow-md"
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
