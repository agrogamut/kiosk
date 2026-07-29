import type { ReactNode } from "react";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { UserRole } from "@madamgy/api-client";
import { cn } from "@/lib/utils";
import { IdleGuard } from "../kiosk/IdleGuard";
import { Logo } from "../brand/Logo";
import { Button } from "../ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "../ui/sheet";
import { logout } from "../../lib/logout";
import { useAuthStore } from "../../store/auth.store";

interface NavItem {
  label: string;
  href: string;
}

const SUPER_ADMIN_NAV: NavItem[] = [
  { label: "Stats", href: "/admin/stats" },
  { label: "Doctors", href: "/admin/doctors" },
  { label: "Users", href: "/admin/users" },
  { label: "Call history", href: "/admin/calls" },
  { label: "Withdrawals", href: "/admin/withdrawals" },
  { label: "Pricing", href: "/admin/pricing" },
  { label: "Audit log", href: "/admin/audit-log" },
];

const ADMIN_NAV: NavItem[] = [
  { label: "Stats", href: "/admin/stats" },
  { label: "Call history", href: "/admin/calls" },
  { label: "Devices", href: "/admin/devices" },
  { label: "Wallet", href: "/admin/wallet" },
  { label: "Patients", href: "/admin/patients" },
  { label: "Audit log", href: "/admin/audit-log" },
];

function navForRole(role: UserRole | undefined): NavItem[] {
  return role === "ADMIN" ? ADMIN_NAV : SUPER_ADMIN_NAV;
}

function isActiveHref(pathname: string, href: string): boolean {
  return pathname.startsWith(href);
}

export function AdminShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const role = useAuthStore((state) => state.user?.role);
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = navForRole(role);

  async function signOut(): Promise<void> {
    await logout();
    navigate("/admin/login");
  }

  function renderNav(onNavigate?: () => void) {
    return (
      <nav className="flex flex-col gap-1">
        {items.map((item) => {
          const active = isActiveHref(location.pathname, item.href);
          return (
            <Link
              key={item.href}
              to={item.href}
              onClick={onNavigate}
              className={cn(
                "flex h-11 items-center rounded-lg border-l-4 border-transparent px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                active && "border-primary bg-muted font-semibold text-primary"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <div className="min-h-screen bg-background lg:flex">
      <IdleGuard />
      <aside className="hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col lg:gap-6 lg:border-r lg:border-border lg:bg-card lg:p-6">
        <Link to="/admin" className="inline-flex">
          <Logo />
        </Link>
        <div className="flex-1">{renderNav()}</div>
        <Button variant="outline" onClick={() => void signOut()}>
          Logout
        </Button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-border bg-card px-6 py-4 lg:hidden">
          <Link to="/admin" className="inline-flex">
            <Logo />
          </Link>
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="outline">Menu</Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-6">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <Link to="/admin" onClick={() => setMobileOpen(false)} className="mb-6 inline-flex">
                <Logo />
              </Link>
              {renderNav(() => setMobileOpen(false))}
              <Button variant="outline" className="mt-6 w-full" onClick={() => void signOut()}>
                Logout
              </Button>
            </SheetContent>
          </Sheet>
        </header>
        <main className="flex-1 px-6 py-10">{children}</main>
      </div>
    </div>
  );
}
