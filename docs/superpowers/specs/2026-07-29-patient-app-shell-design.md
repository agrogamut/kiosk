# Patient App Shell — Design Spec

**Date:** 2026-07-29
**Status:** Approved by user (build order + product decisions locked in the 2026-07-29 reprioritization), grounded against current code same day. Proceeding straight to implementation plan per user's explicit instruction, with remaining architecture calls made directly and recorded here rather than looped back as questions.
**Approach:** Restructure the existing single `KioskDashboard` page into a 3-tab shell (Appointments / Health Locker / Profile) behind a floating glass bottom nav, mirroring the existing `DoctorShell`/`AdminShell` nested-route pattern. Almost entirely frontend — one small new backend endpoint is added (read-only, no schema change).

---

## Grounding: what already exists

- Today, all patient-facing content after login lives in one file, `packages/web/src/pages/kiosk/Dashboard.tsx` (`KioskDashboard`, route `/dashboard`): a welcome header, a "Consult doctor" button, an upload dropzone, a flat list of health files (prescriptions and lab reports mixed together, `file.type === "PRESCRIPTION"` decides the label), and a delete-account dialog at the bottom.
- `GET /api/health-files` and `POST /api/health-files` (multipart) and `DELETE /api/health-files/:id` already fully exist and are already consumed by `KioskDashboard`. Upload always hardcodes `type: "LAB_REPORT"` server-side — the client never sends a type today.
- Doctor access to a patient's health files is **already permanent, not call-scoped**: `doctor.routes.ts`'s `GET /patients/:patientId/records` only checks `prisma.callSession.findFirst({ where: { doctorId, patientId } })` — any call ever, no status filter. This confirms the "permanent access" decision already recorded in the reprioritization section above; no backend change needed for it.
- `GET /api/users/me` and `PUT /api/users/me` already exist and are fully wired: the PUT already updates `name` plus `PatientProfile` (`heightCm`, `weightKg`, `bloodType`, `dob`). `GET /users/me` is already consumed by the doctor dashboard for the same pattern — no patient-facing consumer exists yet. **No backend change needed for the Profile tab.**
- There is **no endpoint today that lists doctors to a patient**. Booking is queue-based auto-assign (`POST /calls` → `assignDoctorQueue`) — a patient never picks a specific doctor. `DoctorProfile` has `isAvailable` (already toggled by `call-completion.service.ts`) and `isApproved`, but nothing exposes this list outside the super-admin `/admin/doctors` view. This is the one real gap — see "New backend: available-doctors endpoint" below.
- No profile-photo upload exists anywhere in the system for doctors (only `licenseDocKey`, a verification PDF, not a display photo). "Doctor photos" in the original ask has no backing data to show yet.
- Design tokens: brand rose already lives at `--primary: 338 62% 63%` in `index.css`, wired through Tailwind's `primary` color family — use `bg-primary`/`text-primary`/`ring-primary` etc., never a hardcoded hex, consistent with the rest of the app.
- Icons: `lucide-react` is already a dependency, unused for this yet. `Avatar`/`Card`/`Sheet`/`Button` primitives already exist in `components/ui/`.

---

## Decisions made directly (per standing instruction to decide architecture calls and state them once)

1. **Route-based tabs, not client-side view-switching state.** New nested layout route (mirroring `DoctorShell`/`AdminShell`): `/dashboard` (Appointments, the default/home tab), `/dashboard/locker` (Health Locker), `/dashboard/profile` (Profile), all wrapped by a new `PatientShell` that renders `<Outlet/>` plus the floating bottom nav. Reason: real URLs give back-button and reload behavior that a local `useState` tab switch doesn't, it matches the existing shell pattern exactly (same file shape a future maintainer already knows how to read), and it lets each tab be its own small file per the file-structure guidance (one clear responsibility each) instead of one large `KioskDashboard.tsx` growing a fourth concern.
2. **"Top doctors" is a real `GET /api/doctors/available` endpoint, not fabricated data.** Returns currently-available, approved doctors (`isApproved: true, isAvailable: true`), ordered by name. This is a genuinely new, small, read-only backend route — unavoidable, since no other source of truth for "who's actually available right now" exists. Kept intentionally tiny: one route, one query, no new model, no pagination (doctor counts on this kind of platform are small; add pagination later if that stops being true).
3. **No doctor photos — initials avatar instead, styled with the brand accent.** Since no photo-upload feature exists anywhere for doctors and building one wasn't asked for, the "doctor photos" part of the original ask is satisfied with `Avatar` initials on a `bg-primary/10` tile — a real, non-placeholder visual that doesn't invent a feature nobody asked to build. If a future ask adds doctor profile photos, this component swaps its image source with no interface change.
4. **Health Locker keeps the existing hardcoded `type: "LAB_REPORT"` server-side — no backend change.** Rather than teaching the client to send a file `type` (which would need a small schema/route change), the Health Locker tab just relabels the section generically as "health files" instead of "lab reports" in the UI copy. This keeps the subsystem's backend footprint to exactly one new endpoint (#2 above) and nothing else, matching the intake doc's framing of this subsystem as "mostly new UI over the existing backend."
5. **Appointments tab reuses the existing `GET /health-files` response, filtered client-side.** There is no separate "appointment/consultation history" endpoint and none is needed: every completed consult already produces a `HealthFile` row with `type: "PRESCRIPTION"`. The Appointments tab filters the same data `KioskDashboard` already fetches down to `type === "PRESCRIPTION"` for the "past consultations" list; Health Locker filters the same data down to everything else. One query (`useQuery(["health-files"], ...)`), read once, shared by both tabs via React Query's cache — not two separate fetches of the same endpoint.
6. **`/consult` and `/prescription/:id` stay outside the shell**, exactly like `/doctor/call/:id` stays outside `DoctorShell` today. These are full-screen flows (an active booking/payment flow, a single prescription detail view), not tab content — putting a persistent bottom nav around them would be visually wrong (a nav bar floating over an active video-call booking flow) and isn't what either original ask asked for.
7. **Bottom nav visible only on the three shell routes**, not globally. It doesn't need to persist across `/consult` — nothing in the ask calls for that, and doing so would need extra state (mid-booking navigation guards) with no product benefit.

---

## New backend: available-doctors endpoint

**New file** `packages/server/src/routes/doctors.routes.ts`, mounted at `/api/doctors` in `index.ts`:

```ts
doctorsRouter.get("/available", requireAuth("PATIENT"), async (req, res, next) => {
  try {
    const doctors = await prisma.doctorProfile.findMany({
      where: { isApproved: true, isAvailable: true },
      select: {
        specialization: true,
        user: { select: { id: true, name: true } },
      },
      orderBy: { user: { name: "asc" } },
    });
    res.json(doctors.map((d) => ({ id: d.user.id, name: d.user.name, specialization: d.specialization })));
  } catch (error) {
    next(error);
  }
});
```

No schema change (every field already exists), no write path, `PATIENT`-only (same gating pattern as every other patient route). Response shape: `{ id: string; name: string; specialization: string | null }[]`.

---

## Frontend structure

**New files:**
- `packages/web/src/components/layout/PatientShell.tsx` — renders `<Outlet/>` plus the floating bottom nav. Structurally the counterpart to `DoctorShell`/`AdminShell`.
- `packages/web/src/components/layout/PatientBottomNav.tsx` — the 3-icon floating glass nav itself (own file, since it's the most visually iterated-on piece and shouldn't be tangled into the shell's routing logic).
- `packages/web/src/pages/patient/Appointments.tsx` — new home tab: consult CTA, available-doctors row, past-consultations list. Replaces `KioskDashboard`'s role as the `/dashboard` route.
- `packages/web/src/pages/patient/HealthLocker.tsx` — upload + browse, extracted from `KioskDashboard`'s existing upload/list logic.
- `packages/web/src/pages/patient/Profile.tsx` — new: consumes `GET`/`PUT /users/me`, phone shown read-only, editable name/height/weight/bloodType/dob, logout button, link to existing `/delete-account` page (the delete-account **dialog** currently inline in `KioskDashboard` moves to living entirely on the existing standalone `/delete-account` route it was designed for, rather than duplicated inline — one source of truth for that flow).

**Modified:**
- `packages/web/src/App.tsx` — replace the single `/dashboard` route with the nested-layout block (same shape as the `DoctorShell`/`AdminShell` blocks already there), add `/dashboard/locker` and `/dashboard/profile`.
- `packages/web/src/pages/kiosk/Consult.tsx` — no functional change; confirm it still renders full-screen outside the new shell (it already lives outside any shell wrapper today).

**Deleted:**
- `packages/web/src/pages/kiosk/Dashboard.tsx` — its logic is fully absorbed into `Appointments.tsx` + `HealthLocker.tsx` + `Profile.tsx`.

---

## Visual design — bottom nav

Floating pill-shaped bar, fixed to the bottom of the viewport with safe-area padding (`env(safe-area-inset-bottom)`, since this ships inside the Capacitor Android wrapper), horizontally centered with margin on both sides (not edge-to-edge) so it visually "floats" rather than docks.

- **Background:** translucent glass — `bg-card/70 backdrop-blur-lg`, a soft `shadow-lg` and a hairline `border border-border/50` for definition against busy backgrounds, matching the "soft depth over hard borders" direction.
- **Selected icon:** reddish tint using the existing `primary` token — icon and label render in `text-primary`, sitting on a soft `bg-primary/10` rounded pill behind just that icon (not the whole bar), so the tint reads as a highlight, not a full repaint.
- **Unselected icons:** `text-muted-foreground`, no background.
- **Icons (lucide-react):** `CalendarCheck` (Appointments), `FolderHeart` (Health Locker), `User` (Profile) — closest semantic matches already available in the installed icon set, no new dependency.
- **Active-state detection:** via `useLocation()` matching the current pathname against each tab's route (`/dashboard` exact, others by prefix) — same technique `NavLink`-style active states use elsewhere, kept as plain `Link` + computed class rather than pulling in a new pattern.

---

## Visual design — Appointments (landing) tab

Top-to-bottom: a warm greeting header ("Welcome back, {name}"), a single prominent "Consult a doctor" CTA button in `primary`, then a horizontally-scrolling "Available now" row of doctor cards (avatar-initials tile, name, specialization, a small `bg-primary/10` "Available" badge), then a vertical list of past consultations (date, doctor name if present, tap-through to `/prescription/:id` — same interaction `KioskDashboard` already has). Generous vertical spacing between these three sections, no boxed-in cards competing for attention — matches "stylish but minimal": a few clear sections, one accent color, whitespace doing the separation instead of borders.

Empty states: no available doctors right now → the row is replaced by a single quiet line ("No doctors available right now — check back soon"), not hidden entirely (matches this app's existing `ErrorState`/empty-state conventions elsewhere). No past consultations yet → same treatment `KioskDashboard` already uses ("No files yet. Start a consultation.") reworded for this tab.

## Visual design — Health Locker tab

Upload dropzone (unchanged behavior from today, relabeled "Upload a health file"), followed by the file list filtered to non-prescription files, same per-file card treatment as today (name, date, delete button for non-prescription files) minus the prescription-labeling logic (moved to Appointments).

## Visual design — Profile tab

Simple stacked form: read-only phone (shown, not editable — phone is the account identity, changing it isn't in scope), editable name/height/weight/blood type/date of birth, a single "Save" button, then a divider, then "Log out" and a text link "Delete my account" that navigates to the existing `/delete-account` route. No new settings invented beyond what's already asked (no language/notifications/payment-method sections).

---

## Testing

No automated test runner exists in `packages/web` (confirmed during the kiosk-lock-layer plan; unchanged). Verification is `tsc --noEmit` plus manual dev-server checks per tab:

- `/dashboard` loads the Appointments tab by default post-login, shows the consult CTA, an available-doctors row reflecting real `DoctorProfile.isAvailable` state, and past consultations pulled from real `HealthFile` rows of type `PRESCRIPTION`.
- `/dashboard/locker` shows upload + the same patient's non-prescription files; upload and delete both round-trip against the real `/api/health-files` endpoints unchanged.
- `/dashboard/profile` loads real `GET /users/me` data, edits save via `PUT /users/me` and are reflected on reload, phone is visibly non-editable, logout and delete-account links both navigate correctly.
- Bottom nav: correct tab highlights (reddish tint) for each of the three routes; nav does not render on `/consult` or `/prescription/:id`.
- `GET /api/doctors/available` returns only doctors with `isApproved: true, isAvailable: true`; toggling a doctor's availability (existing mechanism) changes what the Appointments tab shows on next load.
- Fresh patient with zero health files and zero available doctors: both empty states render without errors.

---

## Out of scope

- Bottom nav for doctors — doctors keep their existing `DoctorShell` nav pattern, untouched.
- Any doctor-selection booking flow — booking stays queue-based auto-assign; the available-doctors row is informational, tapping a doctor card does not pre-select them for booking (tapping it, or the main CTA, both just go to `/consult` as today).
- A ratings/reviews system — "top doctors" means "available now," not a ranked list; building ratings is a separate, unasked-for feature.
- Doctor profile photo upload — out of scope; initials-avatar placeholder used instead (see decision #3).
- Any new Profile settings beyond personal details (language, notification preferences, payment methods) — nothing in the original ask calls for these.
- Advance/scheduled appointments — this app only supports instant queue-based consults today; "Appointments" here means consultation history, not a calendar/scheduling feature.
