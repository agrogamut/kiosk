import { Link, useNavigate } from "react-router-dom";
import { logout } from "../../lib/logout";

export default function AdminDashboard() {
  const navigate = useNavigate();

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
        {[
          { label: "Stats", href: "/admin/stats" },
          { label: "Doctors", href: "/admin/doctors" },
          { label: "Users", href: "/admin/users" },
          { label: "Call History", href: "/admin/calls" },
          { label: "Withdrawals", href: "/admin/withdrawals" },
        ].map((item) => (
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
