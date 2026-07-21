# App Shell and Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the madamGy web app persistent, branded chrome. Today every page reconstructs its own header from scratch, admin has no lateral navigation once you leave the hub, cards/buttons are flat (a 1px ring, no elevation), and no logo or favicon exists anywhere. This plan adds a real `Logo`, wires the staged favicon assets, gives `Card`/`Button` subtle elevation, and introduces three shared layout shells (`AdminShell` sidebar, `DoctorShell` topbar, `KioskHeader`) plus direct `Logo` placement on the public pages — then strips the now-duplicated per-page chrome so nothing is doubled. No color-token or typography changes.

**Architecture:** Chrome is centralized into `packages/web/src/components/layout/` and a `Logo` primitive in `packages/web/src/components/brand/`. `AdminShell` and `DoctorShell` are wired through nested React Router layout routes in `App.tsx` (a parent route renders the shell around an `<Outlet />`), so every `/admin/*` and shell-wrapped `/doctor/*` page inherits the same navigation and content padding without importing it. Kiosk uses the lighter direct-render approach — `KioskHeader` is dropped in at the top of the two shell-worthy kiosk pages rather than through the router, because kiosk only has two such routes and the live-call route must stay untouched. Public pages (`Entry`, `Register`, legal) place `Logo` inline. The two immersive live-video routes (`doctor/Call.tsx`, `kiosk/Consult.tsx`) are deliberately excluded from all shells and are not modified.

**Tech Stack:** React 18.3.1 + Vite (ESM), Tailwind CSS v3.4.19 (default breakpoint scale, no custom `screens`), `react-router-dom` v6 (nested layout routes + `<Outlet />`), shadcn/ui primitives already vendored in `packages/web/src/components/ui/` (`Sheet`, `Button`, `Card` used here), Zustand for `auth.store` (`useAuthStore((state) => state.user)` → `{ id, name, role } | null`), `@madamgy/api-client` for the `UserRole` type. The `cn` helper (`packages/web/src/lib/utils.ts`) is `twMerge(clsx(...))`, so later utility classes win over earlier ones. The path alias `@/*` maps to `packages/web/src/*`.

## Global Constraints

- Color tokens are locked — use only: `background`, `foreground`, `card`, `card-foreground`, `primary`, `primary-foreground`, `secondary`, `secondary-foreground`, `muted`, `muted-foreground`, `destructive`, `input`, `ring`, `popover`, `popover-foreground`, `border` (all confirmed present in `packages/web/src/index.css` and `packages/web/tailwind.config.ts`). No raw hex or named Tailwind color classes (`blue-*`, `gray-*`, `red-*`, `slate-*`, etc.) anywhere in this plan's diffs. Do not change any token value in `index.css`; this plan only adds shadow/elevation utilities and layout markup on top. (The single `theme-color` meta value in `index.html` is a raw hex — that is HTML metadata, not a Tailwind class, and is the only exception; it is derived from `--primary`.)
- `Button`/`Input`/`Select` default size stays `h-11` (44px touch target). No interactive control introduced by this plan may fall below a 44px hit target — this explicitly includes every sidebar nav item (each is `h-11`) and the mobile "Menu" trigger (default `Button`, `h-11`).
- No new `lucide-react` imports in hand-written code. Navigation is text-only: active/inactive state is shown by background color + font weight + a left accent border, never an icon. The mobile nav trigger is a plain `Button` reading "Menu", not a hamburger icon. The only icons permitted are those already baked into vendored shadcn primitives (e.g. the `XIcon` that `SheetContent` ships in its built-in close control) — never add a new one.
- `PulseRing` (full-screen loading only) is unrelated to this plan — do not touch it.
- Tailwind breakpoints: only the default scale — `sm` (640px), `md` (768px), `lg` (1024px), `xl` (1280px). No custom screens, no arbitrary-value media queries.
- Verification for every task: `npm run typecheck --workspace @madamgy/web` must pass with zero errors. No test framework exists in `packages/web` — do not invent one.
- Never add an AI-attribution trailer (e.g. `Co-Authored-By`) to any commit message, and never reference AI/model authorship in commit messages or code comments.
- Do not change any backend contract, API route, socket event, or Zustand store shape — this plan is UI/routing-shell only.
- Do not touch `packages/web/src/pages/doctor/Call.tsx` or `packages/web/src/pages/kiosk/Consult.tsx` beyond confirming they are correctly left OUT of every shell — these are live video-call screens that must stay full-screen and chrome-free.
- `RequireRole` logic in `App.tsx` is not changed — this plan only re-nests the routes that `RequireRole` wraps. No existing per-route access gate may be weakened: where a nested layout route's outer gate proves only "is some kind of admin", the narrower child gates stay as their own inner `RequireRole`.
- Use the fish shell for every command in this plan's steps.

---

### Task 1: Logo component, favicon and index.html wiring

**Files:**
- Create: `packages/web/src/components/brand/Logo.tsx`
- Modify: `packages/web/index.html`

**Interfaces:**
- Produces: named export `Logo` with props `{ className?: string }` — renders `<img src="/madamgy_horizontal.png" alt="MadamGy" />` with a default size of `h-8 w-auto`, mergeable/overridable via the `className` prop (because `cn` is `twMerge`-backed, a caller passing `h-12` replaces `h-8`). Every later task that renders `<Logo />` or `<Logo className="..." />` (Tasks 3, 4, 10, 11) imports it from `../brand/Logo` or `../../components/brand/Logo`.
- The staged assets already exist at `packages/web/public/`: `madamgy_horizontal.png` (799×160), `favicon.ico`, `favicon-16.png`, `favicon-32.png`, `apple-touch-icon.png` (180×180), `icon-512.png`. This task only references them; it does not create or modify them.

- [ ] **Step 1: Create `Logo.tsx`**

Create `packages/web/src/components/brand/Logo.tsx` with:

```tsx
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
}

export function Logo({ className }: LogoProps) {
  return <img src="/madamgy_horizontal.png" alt="MadamGy" className={cn("h-8 w-auto", className)} />;
}
```

- [ ] **Step 2: Replace `index.html`**

Replace the entire contents of `packages/web/index.html` with (adds the favicon link set, the apple-touch-icon, and a `theme-color` derived from `--primary` `338 62% 63%` = `#db6691`; leaves the existing Razorpay checkout script untouched):

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#db6691" />
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
    <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <title>MadamGy</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
    <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
  </body>
</html>
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors.

- [ ] **Step 4: Commit**

```fish
git add packages/web/src/components/brand/Logo.tsx packages/web/index.html
git commit -m "feat: add brand logo component and wire favicons"
```

---

### Task 2: Elevation pass on Card and Button

**Files:**
- Modify: `packages/web/src/components/ui/card.tsx`
- Modify: `packages/web/src/components/ui/button.tsx`

**Interfaces:**
- No exported signatures change. `Card` keeps its existing ring and gains a `shadow-sm`; the default `Button` variant gains `shadow-sm hover:shadow-md transition-shadow` while keeping its existing `active:translate-y-px` press behavior (that class lives in the shared `cva` base string and is not touched). Every existing consumer of `Card`/`Button` inherits the elevation with no code change.

- [ ] **Step 1: Add a shadow to `Card`**

In `packages/web/src/components/ui/card.tsx`, inside the `Card` component's `className`, change the exact substring:

```
ring-1 ring-foreground/10
```

to:

```
shadow-sm ring-1 ring-foreground/10
```

(This is the only occurrence in the file — it is on the root `<div>` of `Card`, not on `CardHeader`/`CardContent`.)

- [ ] **Step 2: Add elevation to the default `Button` variant**

In `packages/web/src/components/ui/button.tsx`, change the `default` variant line exactly from:

```
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
```

to:

```
        default: "bg-primary text-primary-foreground shadow-sm transition-shadow hover:bg-primary/80 hover:shadow-md",
```

Do not change any other variant, the `size` map, or the shared base string (which already contains `active:translate-y-px` and `transition-all`).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors.

- [ ] **Step 4: Commit**

```fish
git add packages/web/src/components/ui/card.tsx packages/web/src/components/ui/button.tsx
git commit -m "style: add subtle elevation to card and primary button"
```

---

### Task 3: AdminShell layout component

**Files:**
- Create: `packages/web/src/components/layout/AdminShell.tsx`

**Interfaces:**
- Consumes: `Logo` from `../brand/Logo` (Task 1); `Button` from `../ui/button`; `Sheet`, `SheetTrigger`, `SheetContent`, `SheetTitle` from `../ui/sheet`; `cn` from `@/lib/utils`; `logout` from `../../lib/logout` (`() => Promise<void>`, clears auth/socket/call state); `useAuthStore` from `../../store/auth.store`; `UserRole` type from `@madamgy/api-client`; `Link`, `useLocation`, `useNavigate` from `react-router-dom`.
- Produces: named export `AdminShell` with props `{ children: ReactNode }`. It renders a persistent left sidebar at `lg:`+ (fixed `lg:w-64`) containing `Logo`, a role-filtered text-only nav, and a Logout control at the bottom; below `lg:` the sidebar is hidden and a topbar shows `Logo` + a "Menu" `Button` that opens a left `Sheet` with the same nav and Logout. `children` render in a `px-6 py-10` content area. **Task 5 renders it exactly as `<AdminShell><Outlet /></AdminShell>`** — the prop is `children`, not `render` or an `outlet` prop.
- Nav lists are filtered to the current user's role so a nav item only appears for a role that route's `RequireRole` actually admits (verified against the gates in `App.tsx`): `SUPER_ADMIN` → Dashboard(`/admin`), Stats(`/admin/stats`), Doctors(`/admin/doctors`), Users(`/admin/users`), Call history(`/admin/calls`), Withdrawals(`/admin/withdrawals`), Audit log(`/admin/audit-log`); `ADMIN` → Dashboard(`/admin`), Stats(`/admin/stats`), Call history(`/admin/calls`), Devices(`/admin/devices`), Wallet(`/admin/wallet`), Patients(`/admin/patients`), Audit log(`/admin/audit-log`).

- [ ] **Step 1: Create `AdminShell.tsx`**

Create `packages/web/src/components/layout/AdminShell.tsx` with:

```tsx
import type { ReactNode } from "react";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { UserRole } from "@madamgy/api-client";
import { cn } from "@/lib/utils";
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
  { label: "Dashboard", href: "/admin" },
  { label: "Stats", href: "/admin/stats" },
  { label: "Doctors", href: "/admin/doctors" },
  { label: "Users", href: "/admin/users" },
  { label: "Call history", href: "/admin/calls" },
  { label: "Withdrawals", href: "/admin/withdrawals" },
  { label: "Audit log", href: "/admin/audit-log" },
];

const ADMIN_NAV: NavItem[] = [
  { label: "Dashboard", href: "/admin" },
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
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
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
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors. (`AdminShell` is not yet imported anywhere — this only confirms it compiles in isolation.)

- [ ] **Step 3: Commit**

```fish
git add packages/web/src/components/layout/AdminShell.tsx
git commit -m "feat: add admin sidebar shell"
```

---

### Task 4: DoctorShell layout component

**Files:**
- Create: `packages/web/src/components/layout/DoctorShell.tsx`

**Interfaces:**
- Consumes: `Logo` from `../brand/Logo` (Task 1); `Button` from `../ui/button`; `cn` from `@/lib/utils`; `logout` from `../../lib/logout`; `Link`, `useLocation`, `useNavigate` from `react-router-dom`.
- Produces: named export `DoctorShell` with props `{ children: ReactNode }`. Renders a sticky topbar (`Logo` on the left; text nav links History + Wallet and a Logout button on the right) over a `px-6 py-10` content area. **Task 5 renders it exactly as `<DoctorShell><Outlet /></DoctorShell>`.** It wraps Dashboard/History/Wallet only — never `doctor/Call.tsx`.

- [ ] **Step 1: Create `DoctorShell.tsx`**

Create `packages/web/src/components/layout/DoctorShell.tsx` with:

```tsx
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
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors.

- [ ] **Step 3: Commit**

```fish
git add packages/web/src/components/layout/DoctorShell.tsx
git commit -m "feat: add doctor topbar shell"
```

---

### Task 5: Wire AdminShell and DoctorShell into App.tsx routing

**Files:**
- Modify: `packages/web/src/App.tsx`

**Interfaces:**
- Consumes: `AdminShell` from `./components/layout/AdminShell` (Task 3, prop `children`), `DoctorShell` from `./components/layout/DoctorShell` (Task 4, prop `children`), and `Outlet` from `react-router-dom` (added to the existing import).
- The flat `/admin/*` and `/doctor/*` routes become nested layout routes: a pathless parent route renders `<RequireRole ...><Shell><Outlet /></Shell></RequireRole>`, and each child route keeps its own narrower `RequireRole` wherever the current gate is stricter than the parent gate. **No access gate is changed** — `/admin/doctors`, `/admin/users`, `/admin/users/:id`, `/admin/withdrawals` stay `SUPER_ADMIN`; `/admin/devices`, `/admin/wallet`, `/admin/patients` stay `ADMIN`; `/admin`, `/admin/stats`, `/admin/calls`, `/admin/audit-log` are covered by the parent `["SUPER_ADMIN","ADMIN"]` gate and need no inner gate. `/doctor/call/:id` stays a flat top-level route (no `DoctorShell`, immersive). Kiosk routes are unchanged here — `KioskHeader` is added directly to the kiosk pages in Task 10, not through the router.
- `RequireRole` itself is not modified.

- [ ] **Step 1: Replace `App.tsx`**

Replace the entire contents of `packages/web/src/App.tsx` with:

```tsx
import type { ReactNode } from "react";
import { useEffect } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import type { UserRole } from "@madamgy/api-client";
import AdminAuditLog from "./pages/admin/AuditLog";
import AdminCalls from "./pages/admin/Calls";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminDevices from "./pages/admin/Devices";
import AdminDoctors from "./pages/admin/Doctors";
import AdminPatients from "./pages/admin/Patients";
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
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/doctors" element={<RequireRole role="SUPER_ADMIN" loginPath="/?role=admin"><AdminDoctors /></RequireRole>} />
        <Route path="/admin/users" element={<RequireRole role="SUPER_ADMIN" loginPath="/?role=admin"><AdminUsers /></RequireRole>} />
        <Route path="/admin/users/:id" element={<RequireRole role="SUPER_ADMIN" loginPath="/?role=admin"><AdminUserDetail /></RequireRole>} />
        <Route path="/admin/stats" element={<AdminStats />} />
        <Route path="/admin/calls" element={<AdminCalls />} />
        <Route path="/admin/withdrawals" element={<RequireRole role="SUPER_ADMIN" loginPath="/?role=admin"><AdminWithdrawals /></RequireRole>} />
        <Route path="/admin/devices" element={<RequireRole role="ADMIN" loginPath="/?role=admin"><AdminDevices /></RequireRole>} />
        <Route path="/admin/wallet" element={<RequireRole role="ADMIN" loginPath="/?role=admin"><AdminWallet /></RequireRole>} />
        <Route path="/admin/patients" element={<RequireRole role="ADMIN" loginPath="/?role=admin"><AdminPatients /></RequireRole>} />
        <Route path="/admin/audit-log" element={<AdminAuditLog />} />
      </Route>
    </Routes>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors.

- [ ] **Step 3: Commit**

```fish
git add packages/web/src/App.tsx
git commit -m "feat: wrap admin and doctor routes in shared layout shells"
```

---

### Task 6: Trim admin Dashboard, Stats and Devices for the shell

**Files:**
- Modify: `packages/web/src/pages/admin/Dashboard.tsx`
- Modify: `packages/web/src/pages/admin/Stats.tsx`
- Modify: `packages/web/src/pages/admin/Devices.tsx`

**Interfaces:**
- `AdminShell` (Task 3) now provides the sidebar navigation, the logo, the logout control, and the `px-6 py-10` content padding for every `/admin/*` page. This task removes the duplicated chrome and outer padding from these three pages so nothing is doubled. `AdminDashboard` becomes a plain welcome landing (its former logout button and nav-card grid are now the shell's job); `AdminStats` and `AdminDevices` only drop their outer container padding/min-height. No query keys, data flow, or mutations change.

- [ ] **Step 1: Replace `Dashboard.tsx`**

Replace the entire contents of `packages/web/src/pages/admin/Dashboard.tsx` with (removes the header row, logout button, and the redundant nav-card grid — all now provided by `AdminShell`):

```tsx
import { useAuthStore } from "../../store/auth.store";

export default function AdminDashboard() {
  const user = useAuthStore((state) => state.user);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-display text-2xl font-bold text-foreground">Welcome, {user?.name}</h1>
      <p className="mt-2 text-muted-foreground">Use the navigation to manage the platform.</p>
    </div>
  );
}
```

- [ ] **Step 2: Trim `Stats.tsx`**

In `packages/web/src/pages/admin/Stats.tsx`, change the outer container line exactly from:

```
    <div className="min-h-screen bg-background px-6 py-10">
```

to:

```
    <div className="mx-auto max-w-5xl">
```

Change nothing else in the file.

- [ ] **Step 3: Trim `Devices.tsx`**

In `packages/web/src/pages/admin/Devices.tsx`, change the outer container line exactly from:

```
    <div className="mx-auto max-w-5xl px-6 py-10">
```

to:

```
    <div className="mx-auto max-w-5xl">
```

Change nothing else in the file.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors.

- [ ] **Step 5: Commit**

```fish
git add packages/web/src/pages/admin/Dashboard.tsx packages/web/src/pages/admin/Stats.tsx packages/web/src/pages/admin/Devices.tsx
git commit -m "refactor: drop duplicated chrome from admin dashboard, stats and devices"
```

---

### Task 7: Trim admin Doctors, Users and Patients for the shell

**Files:**
- Modify: `packages/web/src/pages/admin/Doctors.tsx`
- Modify: `packages/web/src/pages/admin/Users.tsx`
- Modify: `packages/web/src/pages/admin/Patients.tsx`

**Interfaces:**
- Each of these three pages has a single outer container `<div className="mx-auto max-w-5xl px-6 py-10">`. Since `AdminShell` now provides the `px-6 py-10` content padding, drop it and keep the width constraint. No other markup, query, table, or mutation changes.

- [ ] **Step 1: Trim `Doctors.tsx`**

In `packages/web/src/pages/admin/Doctors.tsx`, change the outer container line exactly from:

```
    <div className="mx-auto max-w-5xl px-6 py-10">
```

to:

```
    <div className="mx-auto max-w-5xl">
```

- [ ] **Step 2: Trim `Users.tsx`**

In `packages/web/src/pages/admin/Users.tsx`, change the outer container line exactly from:

```
    <div className="mx-auto max-w-5xl px-6 py-10">
```

to:

```
    <div className="mx-auto max-w-5xl">
```

- [ ] **Step 3: Trim `Patients.tsx`**

In `packages/web/src/pages/admin/Patients.tsx`, change the outer container line exactly from:

```
    <div className="mx-auto max-w-5xl px-6 py-10">
```

to:

```
    <div className="mx-auto max-w-5xl">
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors.

- [ ] **Step 5: Commit**

```fish
git add packages/web/src/pages/admin/Doctors.tsx packages/web/src/pages/admin/Users.tsx packages/web/src/pages/admin/Patients.tsx
git commit -m "refactor: drop duplicated padding from admin doctor/user/patient lists"
```

---

### Task 8: Trim admin Calls, Withdrawals, AuditLog and UserDetail for the shell

**Files:**
- Modify: `packages/web/src/pages/admin/Calls.tsx`
- Modify: `packages/web/src/pages/admin/Withdrawals.tsx`
- Modify: `packages/web/src/pages/admin/AuditLog.tsx`
- Modify: `packages/web/src/pages/admin/UserDetail.tsx`

**Interfaces:**
- Calls/Withdrawals/AuditLog each have a single outer container `<div className="mx-auto max-w-5xl px-6 py-10">` to trim. `UserDetail` has three containers to trim: its full-screen `PulseRing` loading wrapper, its error wrapper, and its main content wrapper (the last two share the same `mx-auto max-w-5xl px-6 py-10` string, so a replace-all covers both). No query keys, data flow, or mutations change.

- [ ] **Step 1: Trim `Calls.tsx`**

In `packages/web/src/pages/admin/Calls.tsx`, change the outer container line exactly from:

```
    <div className="mx-auto max-w-5xl px-6 py-10">
```

to:

```
    <div className="mx-auto max-w-5xl">
```

- [ ] **Step 2: Trim `Withdrawals.tsx`**

In `packages/web/src/pages/admin/Withdrawals.tsx`, change the outer container line exactly from:

```
    <div className="mx-auto max-w-5xl px-6 py-10">
```

to:

```
    <div className="mx-auto max-w-5xl">
```

- [ ] **Step 3: Trim `AuditLog.tsx`**

In `packages/web/src/pages/admin/AuditLog.tsx`, change the outer container line exactly from:

```
    <div className="mx-auto max-w-5xl px-6 py-10">
```

to:

```
    <div className="mx-auto max-w-5xl">
```

- [ ] **Step 4: Trim `UserDetail.tsx`**

In `packages/web/src/pages/admin/UserDetail.tsx`, make these two changes:

First, change the full-screen loading wrapper exactly from:

```
      <div className="flex min-h-screen items-center justify-center bg-background">
```

to:

```
      <div className="flex min-h-[60vh] items-center justify-center">
```

Second, replace **both** occurrences of the content container line exactly from:

```
      <div className="mx-auto max-w-5xl px-6 py-10">
```

to:

```
      <div className="mx-auto max-w-5xl">
```

(One occurrence is the error-state wrapper and one is the main content wrapper; both drop the `px-6 py-10`. Leave all inner markup, sections, and the `Link` back-button unchanged.)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors.

- [ ] **Step 6: Commit**

```fish
git add packages/web/src/pages/admin/Calls.tsx packages/web/src/pages/admin/Withdrawals.tsx packages/web/src/pages/admin/AuditLog.tsx packages/web/src/pages/admin/UserDetail.tsx
git commit -m "refactor: drop duplicated chrome from admin call/withdrawal/audit/detail pages"
```

---

### Task 9: Trim doctor Dashboard, History and shared WalletPanel for the shell

**Files:**
- Modify: `packages/web/src/pages/doctor/Dashboard.tsx`
- Modify: `packages/web/src/pages/doctor/History.tsx`
- Modify: `packages/web/src/components/wallet/WalletPanel.tsx`

**Interfaces:**
- `DoctorShell` (Task 4) now provides the sticky topbar (`Logo`, History/Wallet links, Logout) and the `px-6 py-10` content padding for `/doctor`, `/doctor/history`, `/doctor/wallet`. `DoctorDashboard` loses its own header row containing the Logout/History/Wallet buttons but keeps the "Welcome" heading, the availability toggle, the incoming-call panel, and the delete-account dialog. `DoctorHistory` and `WalletPanel` only drop their outer `min-h-screen bg-background px-6 py-10` container (the inner width-constrained wrapper becomes the root). `WalletPanel` is shared: `AdminWallet` renders it inside `AdminShell` and `DoctorWallet` renders it inside `DoctorShell`, so this single trim serves both — both shells supply the `px-6 py-10` the panel used to add itself. No query keys, socket handlers, or mutations change.

- [ ] **Step 1: Replace `doctor/Dashboard.tsx`**

Replace the entire contents of `packages/web/src/pages/doctor/Dashboard.tsx` with (removes the `Link`-based nav buttons, the Logout button, the `signOut` helper, the now-unused `Link` import, and the outer `min-h-screen bg-background px-6 py-10` wrapper; keeps `logout` because `deleteAccount` still uses it, and keeps `navigate` for the socket handler and delete flow):

```tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../components/ui/alert-dialog";
import { Button } from "../../components/ui/button";
import { api } from "../../lib/api";
import { logout } from "../../lib/logout";
import { getApiErrorMessage } from "../../lib/errors";
import { connectSocket, getSocket } from "../../lib/socket";
import { useAuthStore } from "../../store/auth.store";
import { useCallStore } from "../../store/call.store";

interface IncomingCall {
  callSession: { id: string; livekitRoom: string };
  patient: { id: string; name: string };
}

interface MeResponse {
  doctorProfile?: { isAvailable: boolean } | null;
}

export default function DoctorDashboard() {
  const user = useAuthStore((state) => state.user);
  const setLivekitToken = useCallStore((state) => state.setLivekitToken);
  const navigate = useNavigate();
  const [isAvailable, setIsAvailable] = useState(false);
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);

  useEffect(() => {
    api
      .get<MeResponse>("/users/me")
      .then((response) => setIsAvailable(Boolean(response.data.doctorProfile?.isAvailable)))
      .catch(() => setIsAvailable(false));

    const socket = connectSocket();
    socket.on("call:incoming", (data: IncomingCall) => {
      setIncoming(data);
      toast("Incoming call");
    });
    socket.on("call:accepted", ({ callSessionId, livekitToken }: { callSessionId: string; livekitToken: string }) => {
      setLivekitToken(livekitToken);
      navigate(`/doctor/call/${callSessionId}`);
    });

    return () => {
      socket.off("call:incoming");
      socket.off("call:accepted");
    };
  }, [navigate, setLivekitToken]);

  useEffect(() => {
    getSocket().emit("presence:ping");
    const interval = setInterval(() => {
      getSocket().emit("presence:ping");
    }, 20_000);

    return () => clearInterval(interval);
  }, []);

  function toggleAvailable(): void {
    const next = !isAvailable;
    setIsAvailable(next);
    getSocket().emit("doctor:toggle_available", { isAvailable: next });
  }

  function accept(): void {
    if (!incoming) {
      return;
    }

    getSocket().emit("call:accept", { callSessionId: incoming.callSession.id });
    setIncoming(null);
  }

  function reject(): void {
    if (!incoming) {
      return;
    }

    getSocket().emit("call:reject", { callSessionId: incoming.callSession.id });
    setIncoming(null);
  }

  async function deleteAccount(): Promise<void> {
    try {
      await api.delete("/account/me");
      await logout();
      navigate("/doctor/login");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "We couldn't delete your account. Try again."));
    }
  }

  return (
    <div className="mx-auto max-w-2xl lg:max-w-4xl">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold text-foreground">Welcome, Dr. {user?.name}</h1>
        <Button
          type="button"
          onClick={toggleAvailable}
          variant={isAvailable ? "default" : "secondary"}
          className="mt-3 rounded-full"
        >
          {isAvailable ? "Available" : "Unavailable"}
        </Button>
      </div>

      {incoming && (
        <div className="rounded-xl bg-card p-6 shadow-sm ring-1 ring-primary/30">
          <h2 className="font-display mb-2 text-xl font-bold text-foreground">Incoming call</h2>
          <p className="mb-4 text-foreground">
            Patient: <strong>{incoming.patient.name}</strong>
          </p>
          <div className="flex gap-4">
            <Button onClick={accept} className="flex-1 rounded-full text-lg">
              Accept
            </Button>
            <Button variant="destructive" onClick={reject} className="flex-1 rounded-full text-lg">
              Reject
            </Button>
          </div>
        </div>
      )}

      <div className="mt-8 border-t border-input pt-6 text-center">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button type="button" className="text-sm text-destructive underline">
              Delete my account
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your account?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes your account. Any wallet balance must be withdrawn first. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void deleteAccount()} className="bg-destructive hover:bg-destructive/90">
                Yes, delete my account
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace `doctor/History.tsx`**

Replace the entire contents of `packages/web/src/pages/doctor/History.tsx` with (drops the outer `min-h-screen bg-background px-6 py-10` wrapper; the width-constrained inner div is now the root):

```tsx
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { CallSession } from "@madamgy/api-client";
import { Badge } from "../../components/ui/badge";
import { ErrorState } from "../../components/common/ErrorState";
import { SkeletonRows } from "../../components/common/SkeletonRows";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";

interface HistoryResponse {
  calls: (CallSession & { patient: { name: string } })[];
  total: number;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  ENDED: "default",
  NO_DOCTOR: "destructive",
};

export default function DoctorHistory() {
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["call-history"],
    queryFn: () => api.get<HistoryResponse>("/calls/history").then((response) => response.data),
  });

  return (
    <div className="mx-auto max-w-2xl sm:max-w-3xl lg:max-w-4xl">
      <h1 className="font-display mb-8 text-2xl font-bold text-foreground">Call history</h1>
      {isLoading && <SkeletonRows />}
      {isError && (
        <ErrorState message={getApiErrorMessage(error, "We couldn't load your call history.")} onRetry={() => void refetch()} />
      )}
      {!isLoading && !isError && (
        <div className="flex flex-col gap-3">
          {data?.calls.length === 0 && <p className="py-12 text-center text-muted-foreground">No calls yet.</p>}
          {data?.calls.map((call) => (
            <div key={call.id} className="flex items-center justify-between gap-4 rounded-lg bg-card p-5 shadow-sm">
              <div>
                <p className="font-semibold text-foreground">{call.patient?.name}</p>
                <p className="text-sm text-muted-foreground">{format(new Date(call.createdAt), "dd MMM yyyy HH:mm")}</p>
              </div>
              <Badge variant={STATUS_VARIANT[call.status] ?? "secondary"}>{call.status}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Trim `WalletPanel.tsx`**

In `packages/web/src/components/wallet/WalletPanel.tsx`, change the two adjacent opening container lines exactly from:

```
    <div className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-2xl lg:max-w-3xl">
```

to:

```
    <div className="mx-auto max-w-2xl lg:max-w-3xl">
```

Then, at the end of the component's returned JSX, change the two adjacent closing tags exactly from:

```
      </div>
    </div>
  );
}
```

to:

```
    </div>
  );
}
```

(This removes the outer `min-h-screen` wrapper and its matching close, leaving the width-constrained div as the single root. Change nothing else — all form fields, the balance card, and the transaction list stay identical.)

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors.

- [ ] **Step 5: Commit**

```fish
git add packages/web/src/pages/doctor/Dashboard.tsx packages/web/src/pages/doctor/History.tsx packages/web/src/components/wallet/WalletPanel.tsx
git commit -m "refactor: drop duplicated chrome from doctor dashboard, history and wallet panel"
```

---

### Task 10: KioskHeader and kiosk Dashboard / Prescription branding

**Files:**
- Create: `packages/web/src/components/layout/KioskHeader.tsx`
- Modify: `packages/web/src/pages/kiosk/Dashboard.tsx`
- Modify: `packages/web/src/pages/kiosk/Prescription.tsx`

**Interfaces:**
- Consumes: `Logo` from `../brand/Logo` (Task 1).
- Produces: named export `KioskHeader` (no props) — a lightweight top bar rendering `Logo` centered, for the two authenticated kiosk pages. Kiosk uses direct render (not a router layout) because only two routes need it and `kiosk/Consult.tsx` (live call) must stay untouched. `KioskHeader` is inserted at the top of each page's existing outer container, immediately after the `<IdleGuard />` element. No query keys, upload/delete flows, or socket handlers change.

- [ ] **Step 1: Create `KioskHeader.tsx`**

Create `packages/web/src/components/layout/KioskHeader.tsx` with:

```tsx
import { Logo } from "../brand/Logo";

export function KioskHeader() {
  return (
    <header className="flex items-center justify-center border-b border-border bg-card px-6 py-4">
      <Logo />
    </header>
  );
}
```

- [ ] **Step 2: Wire `KioskHeader` into `kiosk/Dashboard.tsx`**

In `packages/web/src/pages/kiosk/Dashboard.tsx`, add the import alongside the other component imports (immediately after the `IdleGuard` import line):

```
import { IdleGuard } from "../../components/kiosk/IdleGuard";
```

becomes:

```
import { IdleGuard } from "../../components/kiosk/IdleGuard";
import { KioskHeader } from "../../components/layout/KioskHeader";
```

Then, in the returned JSX, change:

```
    <div className="min-h-screen bg-background">
      <IdleGuard />
      <div className="mx-auto max-w-md px-6 py-10 sm:max-w-lg lg:max-w-2xl">
```

to:

```
    <div className="min-h-screen bg-background">
      <IdleGuard />
      <KioskHeader />
      <div className="mx-auto max-w-md px-6 py-10 sm:max-w-lg lg:max-w-2xl">
```

- [ ] **Step 3: Wire `KioskHeader` into `kiosk/Prescription.tsx`**

In `packages/web/src/pages/kiosk/Prescription.tsx`, add the import immediately after the `IdleGuard` import line:

```
import { IdleGuard } from "../../components/kiosk/IdleGuard";
```

becomes:

```
import { IdleGuard } from "../../components/kiosk/IdleGuard";
import { KioskHeader } from "../../components/layout/KioskHeader";
```

Then, in the returned JSX of the loaded state, change:

```
    <div className="min-h-screen bg-background p-6">
      <IdleGuard />
      <div className="mx-auto max-w-md sm:max-w-lg lg:max-w-2xl">
```

to:

```
    <div className="min-h-screen bg-background p-6">
      <IdleGuard />
      <KioskHeader />
      <div className="mx-auto max-w-md sm:max-w-lg lg:max-w-2xl">
```

(Do not touch the `isLoading` `PulseRing` branch or the "file not found" branch — only the final loaded return.)

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors.

- [ ] **Step 5: Commit**

```fish
git add packages/web/src/components/layout/KioskHeader.tsx packages/web/src/pages/kiosk/Dashboard.tsx packages/web/src/pages/kiosk/Prescription.tsx
git commit -m "feat: add branded header to kiosk dashboard and prescription"
```

---

### Task 11: Logo on public pages (Entry, Register, legal)

**Files:**
- Modify: `packages/web/src/pages/Entry.tsx`
- Modify: `packages/web/src/pages/kiosk/Register.tsx`
- Modify: `packages/web/src/pages/legal/DeleteAccount.tsx`
- Modify: `packages/web/src/pages/legal/PrivacyPolicy.tsx`

**Interfaces:**
- Consumes: `Logo` from `../brand/Logo` (Entry) or `../../components/brand/Logo` (Register, legal pages). These pages are structurally distinct and pre-auth, so they get `Logo` inline rather than a shared shell. `Entry` swaps its text "MadamGy" wordmark for the real `Logo`; `Register` and the legal pages add `Logo` above their existing content. No form logic, queries, or flows change.

- [ ] **Step 1: `Entry.tsx` — replace the text wordmark with `Logo`**

In `packages/web/src/pages/Entry.tsx`, add the import immediately after the `NumPad` import line:

```
import { NumPad } from "../components/kiosk/NumPad";
```

becomes:

```
import { NumPad } from "../components/kiosk/NumPad";
import { Logo } from "../components/brand/Logo";
```

Then change the header text block exactly from:

```
          <h1 className="font-display text-4xl font-bold text-foreground">MadamGy</h1>
          <p className="mt-2 text-muted-foreground">Your health, in one tap.</p>
```

to:

```
          <Logo className="mx-auto h-12 w-auto" />
          <p className="mt-2 text-muted-foreground">Your health, in one tap.</p>
```

- [ ] **Step 2: `kiosk/Register.tsx` — add `Logo` above the form card**

In `packages/web/src/pages/kiosk/Register.tsx`, add the import immediately after the `Button` import line:

```
import { Button } from "../../components/ui/button";
```

becomes:

```
import { Button } from "../../components/ui/button";
import { Logo } from "../../components/brand/Logo";
```

Then change the opening of the outer container exactly from:

```
    <div className="flex min-h-screen flex-col items-center bg-background px-6 py-10">
      <div className="w-full max-w-sm sm:max-w-md lg:max-w-lg">
```

to:

```
    <div className="flex min-h-screen flex-col items-center bg-background px-6 py-10">
      <Logo className="mb-8 h-10 w-auto" />
      <div className="w-full max-w-sm sm:max-w-md lg:max-w-lg">
```

- [ ] **Step 3: `legal/DeleteAccount.tsx` — add `Logo` to both return branches**

In `packages/web/src/pages/legal/DeleteAccount.tsx`, add the import immediately after the `Button` import line:

```
import { Button } from "../../components/ui/button";
```

becomes:

```
import { Button } from "../../components/ui/button";
import { Logo } from "../../components/brand/Logo";
```

Then, in the `step === "done"` branch, change:

```
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 bg-background p-8 text-center">
        <h1 className="font-display text-2xl font-bold text-foreground">Account deleted</h1>
```

to:

```
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 bg-background p-8 text-center">
        <Logo className="h-10 w-auto" />
        <h1 className="font-display text-2xl font-bold text-foreground">Account deleted</h1>
```

Then, in the main return, change:

```
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 bg-background p-8">
      <div>
        <h1 className="font-display mb-2 text-2xl font-bold text-foreground">Delete your MadamGy account</h1>
```

to:

```
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 bg-background p-8">
      <Logo className="mx-auto h-10 w-auto" />
      <div>
        <h1 className="font-display mb-2 text-2xl font-bold text-foreground">Delete your MadamGy account</h1>
```

- [ ] **Step 4: `legal/PrivacyPolicy.tsx` — add `Logo` above the heading**

In `packages/web/src/pages/legal/PrivacyPolicy.tsx`, add an import as the new first line of the file (this file currently has no imports):

```
import { Logo } from "../../components/brand/Logo";
```

Then change:

```
    <div className="mx-auto max-w-2xl bg-background px-6 py-10 text-foreground">
      <h1 className="font-display mb-6 text-2xl font-bold text-foreground">Privacy policy</h1>
```

to:

```
    <div className="mx-auto max-w-2xl bg-background px-6 py-10 text-foreground">
      <Logo className="mb-8 h-10 w-auto" />
      <h1 className="font-display mb-6 text-2xl font-bold text-foreground">Privacy policy</h1>
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors.

- [ ] **Step 6: Commit**

```fish
git add packages/web/src/pages/Entry.tsx packages/web/src/pages/kiosk/Register.tsx packages/web/src/pages/legal/DeleteAccount.tsx packages/web/src/pages/legal/PrivacyPolicy.tsx
git commit -m "feat: place brand logo on entry, register and legal pages"
```
