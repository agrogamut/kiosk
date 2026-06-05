import { Link } from "react-router-dom";

export default function AdminDashboard() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <h1 className="mb-8 text-3xl font-bold">Admin Panel</h1>
      <div className="grid max-w-lg grid-cols-1 gap-6 sm:grid-cols-2">
        {[
          { label: "Stats", href: "/admin/stats" },
          { label: "Doctors", href: "/admin/doctors" },
          { label: "Users", href: "/admin/users" },
          { label: "Call History", href: "/admin/calls" },
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
