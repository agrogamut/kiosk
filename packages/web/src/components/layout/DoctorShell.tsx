import type { ReactNode } from "react";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Logo } from "../brand/Logo";
import { Button } from "../ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "../ui/sheet";
import { logout } from "../../lib/logout";
import { useActiveCallRedirect } from "../../hooks/useActiveCallRedirect";
import { useDoctorPresenceHeartbeat } from "../../hooks/useDoctorPresenceHeartbeat";

interface NavItem {
  label: string;
  href: string;
}

const NAV: NavItem[] = [
  { label: "Dashboard", href: "/doctor" },
  { label: "History", href: "/doctor/history" },
  { label: "Prescriptions", href: "/doctor/prescriptions" },
  { label: "Wallet", href: "/doctor/wallet" },
];

function isActiveHref(pathname: string, href: string): boolean {
  return href === "/doctor" ? pathname === "/doctor" : pathname.startsWith(href);
}

export function DoctorShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  useActiveCallRedirect();
  // Lives on the shell, not on Dashboard: the heartbeat used to stop the moment a doctor opened
  // Wallet, History or Prescriptions, and 45s later the assign worker stopped considering them
  // for calls entirely while the UI still said they were available.
  useDoctorPresenceHeartbeat();

  async function signOut(): Promise<void> {
    await logout();
    navigate("/doctor/login");
  }

  function renderNav(onNavigate?: () => void) {
    return (
      <nav className="flex flex-col gap-1">
        {NAV.map((item) => {
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
    <div className="min-h-full bg-background lg:flex">
      <aside className="hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col lg:gap-6 lg:border-r lg:border-border lg:bg-card lg:p-6">
        <Link to="/doctor" className="inline-flex">
          <Logo />
        </Link>
        <div className="flex-1">{renderNav()}</div>
        <Button variant="outline" onClick={() => void signOut()}>
          Logout
        </Button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-border bg-card px-6 py-4 lg:hidden">
          <Link to="/doctor" className="inline-flex">
            <Logo />
          </Link>
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="outline">Menu</Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-6">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <Link to="/doctor" onClick={() => setMobileOpen(false)} className="mb-6 inline-flex">
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
