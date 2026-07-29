# Patient App Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single `KioskDashboard` page with a 3-tab patient app shell (Appointments / Health Locker / Profile) behind a floating glass bottom nav, and back the new "available doctors" row with one small real endpoint.

**Architecture:** One new small backend route (read-only, no schema change) plus a nested React Router layout (`PatientShell` + `Outlet`, mirroring the existing `DoctorShell`/`AdminShell` pattern) wrapping three new tab pages that split apart `KioskDashboard`'s current responsibilities.

**Tech Stack:** Existing stack, no new dependencies — React Router nested routes, `@tanstack/react-query`, `lucide-react` (already installed, unused so far), Tailwind + the existing `primary` design token, Prisma (existing models only).

## Global Constraints

- No Prisma schema changes — every field the new endpoint reads (`DoctorProfile.isApproved`, `isAvailable`, `specialization`, `User.name`) already exists.
- No new npm dependencies in either package — `lucide-react`, `@tanstack/react-query`, `date-fns`, and every `components/ui/*` primitive used below are already installed.
- `packages/web` has no automated test runner — verification is `tsc --noEmit` plus manual dev-server checks, same as the kiosk-lock-layer plan.
- Brand accent color is the existing `primary` Tailwind token (`--primary: 338 62% 63%` in `index.css`) — never a hardcoded hex.
- Match existing patterns exactly: shell components take a `children: ReactNode` prop (not an implicit `Outlet` render) — see `DoctorShell.tsx` — and route-active-state uses `useLocation()` + a plain `Link`, not a router `NavLink`.
- `/consult` and `/prescription/:id` stay outside the new shell — full-screen flows, not tab content.

---

### Task 1: Backend — available-doctors endpoint

**Files:**
- Create: `packages/server/src/routes/doctors.routes.ts`
- Modify: `packages/server/src/index.ts` (mount the new router)

**Interfaces:**
- Produces: `GET /api/doctors/available` → `{ id: string; name: string; specialization: string | null }[]`, `PATIENT`-only.

- [ ] **Step 1: Create the route file**

```ts
// packages/server/src/routes/doctors.routes.ts
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.middleware.js";

export const doctorsRouter = Router();

doctorsRouter.get("/available", requireAuth("PATIENT"), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const doctors = await prisma.doctorProfile.findMany({
      where: { isApproved: true, isAvailable: true },
      select: {
        specialization: true,
        user: { select: { id: true, name: true } },
      },
      orderBy: { user: { name: "asc" } },
    });

    res.json(
      doctors.map((doctor) => ({
        id: doctor.user.id,
        name: doctor.user.name,
        specialization: doctor.specialization,
      })),
    );
  } catch (error) {
    next(error);
  }
});
```

- [ ] **Step 2: Mount the router**

In `packages/server/src/index.ts`, add the import next to the other route imports:

```ts
import { doctorsRouter } from "./routes/doctors.routes.js";
```

And mount it next to the other `/api/*` mounts (near `app.use("/api/doctor", doctorRouter);`):

```ts
app.use("/api/doctors", doctorsRouter);
```

Note this is deliberately `/api/doctors` (plural, public-facing listing) — distinct from the existing `/api/doctor` (singular, the authenticated doctor's own dashboard routes). Do not merge these two routers; they have different auth roles and different purposes.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck --workspace @madamgy/server`
Expected: passes with no errors.

- [ ] **Step 4: Manual verification against the running dev stack**

With the docker-compose stack and `npm run dev` running (postgres/redis/minio seeded, per the kiosk-lock-layer task reports — same environment):
1. Log in as a seeded patient, grab the access token (or reuse the existing test accounts from the kiosk-lock-layer task reports if still present).
2. `curl -H "Authorization: Bearer <patient-token>" http://localhost:3000/api/doctors/available` → expect a JSON array. If no doctor in the seed data has both `isApproved: true` and `isAvailable: true`, expect `[]` — not an error.
3. Confirm a non-patient token (e.g. the doctor test token) gets `403` from this same endpoint, confirming `requireAuth("PATIENT")` is enforced.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/routes/doctors.routes.ts packages/server/src/index.ts
git commit -m "feat: add available-doctors endpoint for the patient landing tab"
```

---

### Task 2: Patient bottom nav and shell

**Files:**
- Create: `packages/web/src/components/layout/PatientBottomNav.tsx`
- Create: `packages/web/src/components/layout/PatientShell.tsx`

**Interfaces:**
- Produces: `PatientShell` — a component taking `{ children: ReactNode }`, rendering its children plus the floating bottom nav. Task 6 wraps the three new tab routes in it, exactly like `DoctorShell`/`AdminShell` wrap their routes today.
- Consumes: nothing from earlier tasks. `PatientBottomNav` assumes routes `/dashboard`, `/dashboard/locker`, `/dashboard/profile` exist (they don't yet until Task 6 — this is a known, accepted gap, see Step 3 below).

- [ ] **Step 1: Create the bottom nav**

```tsx
// packages/web/src/components/layout/PatientBottomNav.tsx
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
```

- [ ] **Step 2: Create the shell**

```tsx
// packages/web/src/components/layout/PatientShell.tsx
import type { ReactNode } from "react";
import { PatientBottomNav } from "./PatientBottomNav";

export function PatientShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background pb-28">
      {children}
      <PatientBottomNav />
    </div>
  );
}
```

The `pb-28` on the wrapper keeps page content from sitting underneath the floating nav — matches the nav's own height plus its bottom safe-area padding with room to spare.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: passes with no errors. Note: this file has no route consumer yet (Task 6 wires it up), so this only proves syntax/type correctness — same accepted gap as the kiosk-lock-layer plan's Task 1 (`kiosk.store.ts` had no consumer until later tasks either). Full visual verification of the glass nav and the reddish selected-tint happens in Task 6's manual click-through, once real routes exist to navigate between.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/layout/PatientBottomNav.tsx packages/web/src/components/layout/PatientShell.tsx
git commit -m "feat: add floating glass bottom nav and patient shell"
```

---

### Task 3: Appointments tab (landing page)

**Files:**
- Create: `packages/web/src/pages/patient/Appointments.tsx`

**Interfaces:**
- Consumes: `GET /api/doctors/available` (Task 1) → `{ id: string; name: string; specialization: string | null }[]`. `GET /api/health-files` (existing, unchanged) → `HealthFile[]` from `@madamgy/api-client`, each with `type: "PRESCRIPTION" | "LAB_REPORT" | "OTHER"`.
- Produces: default export `Appointments`, the component Task 6 mounts at `/dashboard`.

- [ ] **Step 1: Create the page**

```tsx
// packages/web/src/pages/patient/Appointments.tsx
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import type { HealthFile } from "@madamgy/api-client";
import { Avatar, AvatarFallback } from "../../components/ui/avatar";
import { Button } from "../../components/ui/button";
import { KioskHeader } from "../../components/layout/KioskHeader";
import { ErrorState } from "../../components/common/ErrorState";
import { SkeletonRows } from "../../components/common/SkeletonRows";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";
import { useAuthStore } from "../../store/auth.store";

interface AvailableDoctor {
  id: string;
  name: string;
  specialization: string | null;
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default function Appointments() {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();

  const doctorsQuery = useQuery({
    queryKey: ["doctors-available"],
    queryFn: () => api.get<AvailableDoctor[]>("/doctors/available").then((response) => response.data),
  });

  const filesQuery = useQuery({
    queryKey: ["health-files"],
    queryFn: () => api.get<HealthFile[]>("/health-files").then((response) => response.data),
  });

  const pastConsultations = (filesQuery.data ?? []).filter((file) => file.type === "PRESCRIPTION");

  return (
    <div>
      <KioskHeader />
      <div className="mx-auto max-w-md px-6 py-10 sm:max-w-lg lg:max-w-2xl">
        <div className="mb-10 flex flex-col gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Welcome back, {user?.name}</h1>
            <p className="text-muted-foreground">How are you feeling today?</p>
          </div>
          <Button onClick={() => navigate("/consult")} className="w-full rounded-full text-lg">
            Consult a doctor
          </Button>
        </div>

        <section className="mb-10">
          <h2 className="mb-4 font-display text-lg font-semibold text-foreground">Available now</h2>
          {doctorsQuery.isLoading && <SkeletonRows />}
          {doctorsQuery.isError && (
            <ErrorState
              message={getApiErrorMessage(doctorsQuery.error, "We couldn't load available doctors.")}
              onRetry={() => void doctorsQuery.refetch()}
            />
          )}
          {!doctorsQuery.isLoading && !doctorsQuery.isError && (
            <>
              {doctorsQuery.data?.length === 0 && (
                <p className="text-sm text-muted-foreground">No doctors available right now — check back soon.</p>
              )}
              {doctorsQuery.data && doctorsQuery.data.length > 0 && (
                <div className="flex gap-4 overflow-x-auto pb-2">
                  {doctorsQuery.data.map((doctor) => (
                    <div key={doctor.id} className="flex w-28 shrink-0 flex-col items-center gap-2 text-center">
                      <Avatar size="lg" className="bg-primary/10">
                        <AvatarFallback className="bg-primary/10 text-primary">{initials(doctor.name)}</AvatarFallback>
                      </Avatar>
                      <p className="text-sm font-medium text-foreground">{doctor.name}</p>
                      <p className="text-xs text-muted-foreground">{doctor.specialization ?? "General"}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        <section>
          <h2 className="mb-4 font-display text-lg font-semibold text-foreground">Past consultations</h2>
          {filesQuery.isLoading && <SkeletonRows />}
          {filesQuery.isError && (
            <ErrorState
              message={getApiErrorMessage(filesQuery.error, "We couldn't load your consultation history.")}
              onRetry={() => void filesQuery.refetch()}
            />
          )}
          {!filesQuery.isLoading && !filesQuery.isError && (
            <div className="flex flex-col gap-3">
              {pastConsultations.length === 0 && (
                <p className="py-8 text-center text-muted-foreground">No files yet. Start a consultation.</p>
              )}
              {pastConsultations.map((file) => (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => navigate(`/prescription/${file.id}`)}
                  className="rounded-lg bg-card p-5 text-left shadow-sm"
                >
                  <p className="font-semibold text-foreground">{file.name}</p>
                  <p className="text-sm text-muted-foreground">{format(new Date(file.createdAt), "dd MMM yyyy")}</p>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: passes with no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/pages/patient/Appointments.tsx
git commit -m "feat: add patient Appointments landing tab"
```

---

### Task 4: Health Locker tab

**Files:**
- Create: `packages/web/src/pages/patient/HealthLocker.tsx`

**Interfaces:**
- Consumes: `GET /api/health-files`, `POST /api/health-files` (multipart), `DELETE /api/health-files/:id` — all existing, unchanged.
- Produces: default export `HealthLocker`, the component Task 6 mounts at `/dashboard/locker`.

- [ ] **Step 1: Create the page**

This extracts `KioskDashboard`'s existing upload/list logic verbatim, filtered to non-prescription files and relabeled generically (per the design spec's decision to keep the server-side `type` hardcoded and only change display copy).

```tsx
// packages/web/src/pages/patient/HealthLocker.tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import toast from "react-hot-toast";
import type { HealthFile } from "@madamgy/api-client";
import { KioskHeader } from "../../components/layout/KioskHeader";
import { ErrorState } from "../../components/common/ErrorState";
import { SkeletonRows } from "../../components/common/SkeletonRows";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";

export default function HealthLocker() {
  const [uploading, setUploading] = useState(false);
  const { data: files, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["health-files"],
    queryFn: () => api.get<HealthFile[]>("/health-files").then((response) => response.data),
  });

  const lockerFiles = (files ?? []).filter((file) => file.type !== "PRESCRIPTION");

  async function uploadFile(file: File): Promise<void> {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await api.post("/health-files", formData, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Health file uploaded");
      await refetch();
    } catch (uploadError) {
      toast.error(getApiErrorMessage(uploadError, "We couldn't upload that file. Try again."));
    } finally {
      setUploading(false);
    }
  }

  async function deleteFile(id: string): Promise<void> {
    try {
      await api.delete(`/health-files/${id}`);
      toast.success("Health file deleted");
      await refetch();
    } catch (deleteError) {
      toast.error(getApiErrorMessage(deleteError, "We couldn't delete that file. Try again."));
    }
  }

  return (
    <div>
      <KioskHeader />
      <div className="mx-auto max-w-md px-6 py-10 sm:max-w-lg lg:max-w-2xl">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-bold text-foreground">Health Locker</h1>
          <p className="text-muted-foreground">Files your doctors can see when you consult them</p>
        </div>

        <label className="mb-6 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-input bg-card p-6 text-center">
          <span className="font-semibold text-primary">{uploading ? "Uploading..." : "Upload a health file"}</span>
          <span className="mt-1 text-sm text-muted-foreground">PDF or image, up to 10MB</span>
          <input
            type="file"
            disabled={uploading}
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) {
                void uploadFile(file);
              }
            }}
          />
        </label>

        {isLoading && <SkeletonRows />}
        {isError && (
          <ErrorState message={getApiErrorMessage(error, "We couldn't load your health locker.")} onRetry={() => void refetch()} />
        )}
        {!isLoading && !isError && (
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-4">
            {lockerFiles.length === 0 && (
              <p className="py-12 text-center text-muted-foreground lg:col-span-2">No files yet. Upload one above.</p>
            )}
            {lockerFiles.map((file) => (
              <div key={file.id} className="rounded-lg bg-card p-5 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-foreground">{file.name}</p>
                    <p className="text-sm text-muted-foreground">{format(new Date(file.createdAt), "dd MMM yyyy")}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void deleteFile(file.id)}
                    className="flex h-11 items-center rounded-full bg-destructive/10 px-4 text-sm font-semibold text-destructive"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: passes with no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/pages/patient/HealthLocker.tsx
git commit -m "feat: add patient Health Locker tab"
```

---

### Task 5: Profile tab

**Files:**
- Create: `packages/web/src/pages/patient/Profile.tsx`

**Interfaces:**
- Consumes: `GET /api/users/me` (existing, returns `User & { patientProfile: PatientProfile | null }`), `PUT /api/users/me` (existing, body validated server-side by `UpdateProfileSchema`: `{ name?: string; heightCm?: number; weightKg?: number; bloodType?: string; dob?: string }`, `dob` in `DD/MM/YYYY` string format per `DateOfBirthSchema`).
- Produces: default export `Profile`, the component Task 6 mounts at `/dashboard/profile`.

- [ ] **Step 1: Create the page**

```tsx
// packages/web/src/pages/patient/Profile.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { KioskHeader } from "../../components/layout/KioskHeader";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";
import { logout } from "../../lib/logout";

interface PatientProfileResponse {
  phone: string;
  name: string;
  patientProfile: {
    heightCm: number | null;
    weightKg: number | null;
    bloodType: string | null;
    dob: string | null;
  } | null;
}

interface FormState {
  name: string;
  heightCm: string;
  weightKg: string;
  bloodType: string;
  dob: string;
}

const EMPTY_FORM: FormState = { name: "", heightCm: "", weightKg: "", bloodType: "", dob: "" };

export default function Profile() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get<PatientProfileResponse>("/users/me")
      .then((response) => {
        const { data } = response;
        setPhone(data.phone);
        setForm({
          name: data.name,
          heightCm: data.patientProfile?.heightCm?.toString() ?? "",
          weightKg: data.patientProfile?.weightKg?.toString() ?? "",
          bloodType: data.patientProfile?.bloodType ?? "",
          dob: data.patientProfile?.dob ?? "",
        });
      })
      .catch((error) => toast.error(getApiErrorMessage(error, "We couldn't load your profile.")))
      .finally(() => setLoading(false));
  }, []);

  async function save(): Promise<void> {
    setSaving(true);
    try {
      await api.put("/users/me", {
        name: form.name || undefined,
        heightCm: form.heightCm ? Number(form.heightCm) : undefined,
        weightKg: form.weightKg ? Number(form.weightKg) : undefined,
        bloodType: form.bloodType || undefined,
        dob: form.dob || undefined,
      });
      toast.success("Profile updated");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "We couldn't save your profile. Try again."));
    } finally {
      setSaving(false);
    }
  }

  async function signOut(): Promise<void> {
    await logout();
    navigate("/");
  }

  if (loading) {
    return (
      <div>
        <KioskHeader />
        <div className="mx-auto max-w-md px-6 py-10 text-center text-muted-foreground">Loading your profile...</div>
      </div>
    );
  }

  return (
    <div>
      <KioskHeader />
      <div className="mx-auto max-w-md px-6 py-10 sm:max-w-lg">
        <h1 className="mb-8 font-display text-2xl font-bold text-foreground">Profile</h1>

        <div className="flex flex-col gap-5">
          <div>
            <Label>Phone number</Label>
            <Input value={phone} disabled className="mt-1.5" />
          </div>
          <div>
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1.5" />
          </div>
          <div>
            <Label>Date of birth (DD/MM/YYYY)</Label>
            <Input
              value={form.dob}
              placeholder="DD/MM/YYYY"
              onChange={(e) => setForm({ ...form, dob: e.target.value })}
              className="mt-1.5"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Height (cm)</Label>
              <Input
                type="number"
                value={form.heightCm}
                onChange={(e) => setForm({ ...form, heightCm: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Weight (kg)</Label>
              <Input
                type="number"
                value={form.weightKg}
                onChange={(e) => setForm({ ...form, weightKg: e.target.value })}
                className="mt-1.5"
              />
            </div>
          </div>
          <div>
            <Label>Blood type</Label>
            <Input value={form.bloodType} onChange={(e) => setForm({ ...form, bloodType: e.target.value })} className="mt-1.5" />
          </div>

          <Button onClick={() => void save()} disabled={saving} className="mt-2 w-full rounded-full">
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>

        <div className="mt-10 flex flex-col items-center gap-3 border-t border-input pt-6">
          <Button variant="outline" onClick={() => void signOut()} className="w-full">
            Log out
          </Button>
          <button type="button" onClick={() => navigate("/delete-account")} className="text-sm text-destructive underline">
            Delete my account
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: passes with no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/pages/patient/Profile.tsx
git commit -m "feat: add patient Profile tab"
```

---

### Task 6: Wire the shell into routing and retire the old dashboard

**Files:**
- Modify: `packages/web/src/App.tsx`
- Delete: `packages/web/src/pages/kiosk/Dashboard.tsx`

**Interfaces:**
- Consumes: `PatientShell` (Task 2), `Appointments`/`HealthLocker`/`Profile` (Tasks 3-5).

- [ ] **Step 1: Update imports in `App.tsx`**

Replace this line:

```ts
import KioskDashboard from "./pages/kiosk/Dashboard";
```

with:

```ts
import Appointments from "./pages/patient/Appointments";
import HealthLocker from "./pages/patient/HealthLocker";
import Profile from "./pages/patient/Profile";
```

And add the shell import next to the other shell imports:

```ts
import { PatientShell } from "./components/layout/PatientShell";
```

- [ ] **Step 2: Replace the `/dashboard` route with a nested layout block**

Replace this single line:

```tsx
<Route path="/dashboard" element={<RequireRole role="PATIENT"><KioskDashboard /></RequireRole>} />
```

with this block (same shape as the existing `DoctorShell`/`AdminShell` blocks elsewhere in this file):

```tsx
<Route
  element={
    <RequireRole role="PATIENT">
      <PatientShell>
        <Outlet />
      </PatientShell>
    </RequireRole>
  }
>
  <Route path="/dashboard" element={<Appointments />} />
  <Route path="/dashboard/locker" element={<HealthLocker />} />
  <Route path="/dashboard/profile" element={<Profile />} />
</Route>
```

Leave `/consult` and `/prescription/:id` exactly as they are today — both stay outside this block, unchanged.

- [ ] **Step 3: Delete the old dashboard file**

```bash
git rm packages/web/src/pages/kiosk/Dashboard.tsx
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: passes with no errors. This also confirms nothing else in the codebase still imports the deleted `KioskDashboard`.

- [ ] **Step 5: Manual verification against the running dev stack**

1. Log in as a patient. Confirm you land on `/dashboard` and see the Appointments tab (greeting, consult CTA, available-doctors row, past consultations) with the floating glass nav at the bottom, "Appointments" shown with the reddish selected tint.
2. Tap "Health Locker" in the nav — confirm navigation to `/dashboard/locker`, the tab highlights correctly, and the same files from Task 1's health-files data show up (minus any `PRESCRIPTION`-type ones). Upload a test file, confirm it appears; delete it, confirm it's removed.
3. Tap "Profile" — confirm `/dashboard/profile` loads real data from `GET /users/me`, phone is shown but not editable, edit the name field and Save, reload the page and confirm the change persisted via `PUT /users/me`.
4. Confirm the bottom nav does **not** appear on `/consult` or on a `/prescription/:id` page.
5. Confirm "Log out" on the Profile tab logs out and returns to `/`, and "Delete my account" navigates to the existing `/delete-account` page.
6. If the seed data has no doctor with `isAvailable: true`, temporarily flip one via the DB or the doctor's own toggle (whatever mechanism `call-completion.service.ts` or the doctor dashboard already uses) and confirm the Appointments tab's "Available now" row picks it up on next load.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/App.tsx
git commit -m "feat: wire patient app shell into routing, retire single-page dashboard"
```
