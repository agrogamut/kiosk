import { CalendarCheck, FolderHeart, User } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: typeof CalendarCheck;
}

const NAV: NavItem[] = [
  { label: "Appointments", href: "/dashboard", icon: CalendarCheck },
  { label: "Health Locker", href: "/dashboard/locker", icon: FolderHeart },
  { label: "Profile", href: "/dashboard/profile", icon: User },
];

function isActiveHref(pathname: string, href: string): boolean {
  return href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
}

export function PatientBottomNav() {
  const location = useLocation();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-6"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      <div className="flex items-center gap-1 rounded-full border border-border/50 bg-card/70 px-2 py-2 shadow-lg backdrop-blur-lg">
        {NAV.map((item) => {
          const active = isActiveHref(location.pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-full px-5 py-2 text-xs font-medium text-muted-foreground transition-colors",
                active && "bg-primary/10 text-primary",
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
