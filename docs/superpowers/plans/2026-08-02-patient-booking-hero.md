# Patient Booking Hero Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the patient booking home page (`/dashboard`, `Appointments.tsx`) with a warm illustrated hero and upgraded doctor avatars, per `docs/superpowers/specs/2026-08-02-patient-booking-hero-design.md`.

**Architecture:** Two new small, self-contained components (`HeroIllustration`, `DoctorAvatar`) built entirely from already-installed `lucide-react` icons, the existing `PulseRing` brand component, and existing Tailwind color tokens — then wired into `Appointments.tsx` in place of its current plain hero and initials-avatar doctor row. No new packages, no backend/schema changes.

**Tech Stack:** React + TypeScript, Tailwind CSS (CSS-variable-based theme tokens), `lucide-react` icons, `framer-motion` (via the existing `PulseRing`).

## Global Constraints

- No new npm packages — use only `lucide-react` (already a dependency) and existing UI primitives.
- No backend or Prisma schema changes anywhere in this feature.
- No hardcoded hex colors — every color must come through a Tailwind class backed by an existing CSS var token (`primary`, `secondary`, `accent`, `muted`, `card`, `background`, `foreground` families). Do not invent new CSS vars.
- Must respect `prefers-reduced-motion` — this is already handled inside `PulseRing` itself; do not wrap or duplicate that logic, just compose `PulseRing` as-is.
- Must render correctly in both light and dark mode (`darkMode: ["class"]` in `tailwind.config.ts`) — token-based colors handle this automatically as long as no hex/RGB literals are introduced.
- Verify with `tsc --noEmit` from `packages/web` after every task (this workspace has no component test suite — `packages/web` has zero `*.test.tsx` files and no testing-library/vitest dependency, so typecheck is the mechanical gate here; do not add new test tooling, that is out of scope).
- Doctor photos are explicitly out of scope — `DoctorProfile` has no photo field in the schema. Avatars are illustrated icons, not images.

---

### Task 1: HeroIllustration component

**Files:**
- Create: `packages/web/src/components/patient/HeroIllustration.tsx`

**Interfaces:**
- Consumes: `PulseRing` from `packages/web/src/components/brand/PulseRing.tsx` (`PulseRing({ size?: "sm" | "lg" })`, named export). `cn` from `packages/web/src/lib/utils` (already used throughout the codebase for `clsx`/`tailwind-merge` class joining — check this import path resolves the same way other components under `components/` use it, e.g. `components/ui/avatar.tsx` imports it as `import { cn } from "@/lib/utils"`).
- Produces: `HeroIllustration({ className?: string })`, a named export, default-exportable JSX with no required props. Task 3 imports it as `import { HeroIllustration } from "../../components/patient/HeroIllustration";` from `pages/patient/Appointments.tsx`.

- [ ] **Step 1: Write the component**

```tsx
import { Heart, Plus, Stethoscope, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import { PulseRing } from "../brand/PulseRing";

interface HeroIllustrationProps {
  className?: string;
}

export function HeroIllustration({ className }: HeroIllustrationProps) {
  return (
    <div
      className={cn(
        "relative flex h-40 items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br from-primary/20 via-secondary/15 to-primary/10",
        className,
      )}
    >
      <Heart className="absolute left-6 top-6 size-5 text-primary/40" aria-hidden="true" />
      <Stethoscope className="absolute right-8 top-7 size-6 text-secondary-foreground/30" aria-hidden="true" />
      <Plus className="absolute bottom-7 right-7 size-5 text-primary/30" aria-hidden="true" />

      <div className="relative flex size-24 items-center justify-center">
        <div className="absolute inset-0 flex items-center justify-center">
          <PulseRing size="lg" />
        </div>
        <div className="relative z-10 flex size-16 items-center justify-center rounded-2xl bg-card shadow-md">
          <Video className="size-7 text-primary" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/patient/HeroIllustration.tsx
git commit -m "feat: add patient booking hero illustration component"
```

---

### Task 2: DoctorAvatar component

**Files:**
- Create: `packages/web/src/components/patient/DoctorAvatar.tsx`

**Interfaces:**
- Consumes: `cn` from `packages/web/src/lib/utils`. `UserRound` from `lucide-react`. No dependency on `Task 1`.
- Produces: `DoctorAvatar({ id: string; name: string; className?: string })`, a named export. Task 3 imports it as `import { DoctorAvatar } from "../../components/patient/DoctorAvatar";` from `pages/patient/Appointments.tsx`, called as `<DoctorAvatar id={doctor.id} name={doctor.name} />` where `doctor` is an `AvailableDoctor` (`{ id: string; name: string; specialization: string | null }`, already defined in `Appointments.tsx`).

**Note on color variants:** the codebase's real, already-used brand hues are only `primary` (rose, `--primary: 338 62% 63%`) and `secondary`/`accent` (coral, both `--secondary`/`--accent: 2 74% 74%` — same hue, two names). There is no third or fourth distinct brand hue anywhere in `index.css` (checked: only `primary`, `secondary`, `muted`, `accent`, `destructive` exist, and `destructive` is an error-red, wrong tone for a friendly doctor avatar). Do not invent new hues. Get 4 visually distinct variants from alpha/shade combinations of the two real hues instead — see the code below.

- [ ] **Step 1: Write the component**

```tsx
import { UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

interface DoctorAvatarProps {
  id: string;
  name: string;
  className?: string;
}

const VARIANTS = [
  "bg-primary/15 text-primary",
  "bg-secondary/25 text-secondary-foreground",
  "bg-primary/25 text-primary",
  "bg-secondary/15 text-secondary-foreground",
];

function variantForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return VARIANTS[hash % VARIANTS.length];
}

export function DoctorAvatar({ id, name, className }: DoctorAvatarProps) {
  return (
    <div
      role="img"
      aria-label={name}
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full",
        variantForId(id),
        className,
      )}
    >
      <UserRound className="size-5" aria-hidden="true" />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/patient/DoctorAvatar.tsx
git commit -m "feat: add illustrated doctor avatar component"
```

---

### Task 3: Wire hero and avatars into Appointments.tsx

**Files:**
- Modify: `packages/web/src/pages/patient/Appointments.tsx` (full current content below — this is the complete file as it exists today, 127 lines)

**Interfaces:**
- Consumes: `HeroIllustration` from Task 1 (`packages/web/src/components/patient/HeroIllustration.tsx`), `DoctorAvatar` from Task 2 (`packages/web/src/components/patient/DoctorAvatar.tsx`). `FileText` from `lucide-react` (new import in this file).
- Produces: nothing consumed by later tasks — this is the last task.

**Current file content (for exact context — match this precisely when editing):**

```tsx
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
                    <button
                      key={doctor.id}
                      type="button"
                      onClick={() => navigate("/consult")}
                      className="flex w-28 shrink-0 flex-col items-center gap-2 text-center"
                    >
                      <Avatar size="lg" className="bg-primary/10">
                        <AvatarFallback className="bg-primary/10 text-primary">{initials(doctor.name)}</AvatarFallback>
                      </Avatar>
                      <p className="text-sm font-medium text-foreground">{doctor.name}</p>
                      <p className="text-xs text-muted-foreground">{doctor.specialization ?? "General"}</p>
                    </button>
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

- [ ] **Step 1: Add the time-of-day greeting helper**

Add this function next to `initials` (same file, top-level, after the `initials` function):

```tsx
function timeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
```

- [ ] **Step 2: Update imports**

Replace:

```tsx
import { Avatar, AvatarFallback } from "../../components/ui/avatar";
import { Button } from "../../components/ui/button";
import { KioskHeader } from "../../components/layout/KioskHeader";
import { ErrorState } from "../../components/common/ErrorState";
import { SkeletonRows } from "../../components/common/SkeletonRows";
```

With:

```tsx
import { FileText } from "lucide-react";
import { Button } from "../../components/ui/button";
import { KioskHeader } from "../../components/layout/KioskHeader";
import { ErrorState } from "../../components/common/ErrorState";
import { SkeletonRows } from "../../components/common/SkeletonRows";
import { HeroIllustration } from "../../components/patient/HeroIllustration";
import { DoctorAvatar } from "../../components/patient/DoctorAvatar";
```

(`Avatar`/`AvatarFallback` and the `initials` helper are no longer used anywhere in this file once Step 4 below lands — remove the now-dead `initials` function too, in Step 4.)

- [ ] **Step 3: Replace the hero block**

Replace:

```tsx
        <div className="mb-10 flex flex-col gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Welcome back, {user?.name}</h1>
            <p className="text-muted-foreground">How are you feeling today?</p>
          </div>
          <Button onClick={() => navigate("/consult")} className="w-full rounded-full text-lg">
            Consult a doctor
          </Button>
        </div>
```

With:

```tsx
        <div className="mb-10 flex flex-col gap-4">
          <HeroIllustration />
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">
              {timeOfDayGreeting()}, {user?.name}
            </h1>
            <p className="text-muted-foreground">How are you feeling today?</p>
          </div>
          <Button onClick={() => navigate("/consult")} className="w-full rounded-full text-lg">
            Consult a doctor
          </Button>
        </div>
```

- [ ] **Step 4: Replace the doctor-list avatar and remove the dead `initials` helper**

Replace:

```tsx
                      <Avatar size="lg" className="bg-primary/10">
                        <AvatarFallback className="bg-primary/10 text-primary">{initials(doctor.name)}</AvatarFallback>
                      </Avatar>
```

With:

```tsx
                      <DoctorAvatar id={doctor.id} name={doctor.name} className="size-14" />
```

Then delete the now-unused `initials` function entirely (the whole block):

```tsx
function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
```

- [ ] **Step 5: Add the icon badge and soften the past-consultations cards**

Replace:

```tsx
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
```

With:

```tsx
              {pastConsultations.map((file) => (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => navigate(`/prescription/${file.id}`)}
                  className="flex items-center gap-4 rounded-2xl bg-card p-5 text-left shadow-sm shadow-foreground/5"
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <FileText className="size-5" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{file.name}</p>
                    <p className="text-sm text-muted-foreground">{format(new Date(file.createdAt), "dd MMM yyyy")}</p>
                  </div>
                </button>
              ))}
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors. In particular confirm no leftover reference to `Avatar`, `AvatarFallback`, or `initials` remains (they must be fully removed, not just unused-but-present — an unused import would fail this typecheck under this project's `tsconfig` `noUnusedLocals`-style settings if enabled; if it is not enabled, still remove them per the "no dead code" expectation).

- [ ] **Step 7: Manual visual check (documented, not automated)**

Start the dev server (`npm run dev --workspace @madamgy/web` from the repo root, or the monorepo's usual `npm run dev`), log in as a patient, and open `/dashboard`. Confirm:
- Hero renders with the pulse-ring/video-icon graphic and floating accent icons, no layout overflow at mobile width (`max-w-md`).
- Greeting text matches the current time of day.
- Each doctor in "Available now" shows a distinct-looking tinted avatar (not identical colors for every doctor, assuming more than one doctor is seeded).
- "Past consultations" cards show the new file icon badge and rounded corners.
- Toggle the `dark` class on `<html>` (or however this project's dark mode is normally exercised) and confirm no washed-out or invisible text/icons.

This step cannot be run by an agent without a live browser session — the implementer/reviewer should note in their report whether they were able to perform it, and if not, that this remains a documented manual follow-up rather than a claimed-verified step.

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/pages/patient/Appointments.tsx
git commit -m "feat: warm hero and illustrated avatars on patient booking page"
```

---

## Self-Review Notes

- **Spec coverage:** Hero (Task 1 + Task 3 Step 3) ✓, time-of-day greeting (Task 3 Step 1/3) ✓, doctor avatar illustration + color variants (Task 2 + Task 3 Step 4) ✓, doctor-list layout unchanged (Task 3 Step 4 only swaps the avatar, not the surrounding `button`/scroll container) ✓, past-consultations light refresh (Task 3 Step 5) ✓, no backend changes (none in any task) ✓.
- **Placeholder scan:** no TBD/TODO; every step has literal code.
- **Type consistency:** `DoctorAvatar` props (`id: string; name: string; className?: string`) match the call site in Task 3 Step 4 (`<DoctorAvatar id={doctor.id} name={doctor.name} className="size-14" />` — `doctor.id`/`doctor.name` are both `string` per the existing `AvailableDoctor` interface). `HeroIllustration` takes only `className?: string`, called with no props in Task 3 Step 3, consistent.
