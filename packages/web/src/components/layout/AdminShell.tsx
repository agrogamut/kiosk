import type { ReactNode } from "react";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import type { UserRole } from "@madamgy/api-client";
import { cn } from "@/lib/utils";
import { IdleGuard } from "../kiosk/IdleGuard";
import { Logo } from "../brand/Logo";
import { Button } from "../ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "../ui/sheet";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";
import { logout } from "../../lib/logout";
import { useAuthStore } from "../../store/auth.store";
import { useKioskStore } from "../../store/kiosk.store";

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
  const user = useAuthStore((state) => state.user);
  const deviceId = useKioskStore((state) => state.deviceId);
  const lockAsKiosk = useKioskStore((state) => state.lock);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [locking, setLocking] = useState(false);
  const items = navForRole(user?.role);

  async function signOut(): Promise<void> {
    // A plain logout hands this session's admin straight back to their own login form --
    // not the patient-lock screen a locked device otherwise defaults to. "Lock this device"
    // below is the only action that's supposed to end at the patient screen.
    const forceEntryRole = user?.role === "ADMIN" ? "KIOSK_OWNER" : "ADMIN";
    await logout();
    navigate("/", { state: { forceEntryRole } });
  }

  async function lockThisDevice(): Promise<void> {
    setLocking(true);
    try {
      await api.post("/admin/kiosk-devices", { deviceId, label: user?.name });
      lockAsKiosk();
      toast.success("Device locked as your kiosk. Long-press the logo to sign in again.");
      await logout();
      navigate("/");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not lock this device. Try again."));
    } finally {
      setLocking(false);
    }
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
        {user?.role === "ADMIN" && (
          <Button variant="outline" disabled={locking} onClick={() => void lockThisDevice()}>
            {locking ? "Locking..." : "Lock this device"}
          </Button>
        )}
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
              {user?.role === "ADMIN" && (
                <Button variant="outline" className="mt-6 w-full" disabled={locking} onClick={() => void lockThisDevice()}>
                  {locking ? "Locking..." : "Lock this device"}
                </Button>
              )}
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
