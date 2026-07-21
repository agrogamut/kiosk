import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Logo } from "../brand/Logo";
import { Button } from "../ui/button";
import { logout } from "../../lib/logout";

interface NavItem {
  label: string;
  href: string;
}

const NAV: NavItem[] = [
  { label: "History", href: "/doctor/history" },
  { label: "Wallet", href: "/doctor/wallet" },
];

export function DoctorShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();

  async function signOut(): Promise<void> {
    await logout();
    navigate("/doctor/login");
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 flex items-center justify-between gap-4 border-b border-border bg-card px-6 py-4">
        <Link to="/doctor" className="inline-flex">
          <Logo />
        </Link>
        <div className="flex items-center gap-2">
          {NAV.map((item) => {
            const active = location.pathname.startsWith(item.href);
            return (
              <Button key={item.href} variant="outline" asChild className={cn(active && "bg-muted text-foreground")}>
                <Link to={item.href}>{item.label}</Link>
              </Button>
            );
          })}
          <Button variant="outline" onClick={() => void signOut()}>
            Logout
          </Button>
        </div>
      </header>
      <main className="px-6 py-10">{children}</main>
    </div>
  );
}
