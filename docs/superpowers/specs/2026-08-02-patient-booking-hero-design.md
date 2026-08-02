# Patient Booking Hero — Design Spec

**Date:** 2026-08-02
**Status:** Approved by user, ready for implementation plan.
**Approach:** Restyle `packages/web/src/pages/patient/Appointments.tsx` (the `/dashboard` booking-home page) with a warm illustrated hero and upgraded avatars, using only existing brand primitives — no new backend, no new data model.

---

## Grounding: what already exists

- Patient booking home is `Appointments.tsx`, route `/dashboard`. Today: plain text welcome + one CTA button, an "Available now" horizontal-scroll row of doctors (initials-only `Avatar`/`AvatarFallback`), and a flat "Past consultations" list.
- `DoctorProfile` has **no photo field** in `schema.prisma` — only `degree`, `regNumber`, `specialization`, `isAvailable`, `isApproved`, `licenseDocKey` (a verification PDF, not a display photo). Confirmed via schema read. Real doctor photos would require a new upload feature — out of scope, user chose illustrated avatars instead.
- `PulseRing` (`components/brand/PulseRing.tsx`) already exists: three animated concentric rings in `border-primary`, built on `framer-motion`, respects `useReducedMotion`. Reused here instead of hand-drawn art — themes automatically via `hsl(var(--primary))`, so dark mode (`darkMode: ["class"]` in `tailwind.config.ts`) needs no separate handling.
- `lucide-react` and `framer-motion` are already dependencies — no new packages needed.
- Brand tokens: `--primary: 338 62% 63%` (rose/pink), `--secondary: 2 74% 74%` (coral) in `index.css`, wired through Tailwind's `primary`/`secondary` color families. `font-display` = Baloo 2 (rounded, friendly), `font-sans` = Manrope. Always reference via Tailwind classes (`bg-primary`, `text-primary`), never hardcoded hex.
- `GET /api/doctors/available` already returns `{ id, name, specialization }[]` — no shape change needed for the avatar work.

---

## Decisions made directly

1. **Hero is a composed graphic built from existing primitives (icons + `PulseRing` + gradient), not a hand-drawn illustration asset.** Avoids introducing new binary image assets or an external illustration library/CDN dependency, stays themeable through CSS vars, and reuses a component that already exists and is already battle-tested (reduced-motion handling included).
2. **Hero depicts a video-call scene**: a rounded "device frame" card containing a `Video` (lucide) icon, `PulseRing` animating behind/around it, 2-3 small floating accent icons (`Heart`, `Stethoscope`, `Plus`) at low opacity in the corners for texture. Chosen over a generic wellness scene because it makes the CTA self-explanatory — this is a video consult app.
3. **Greeting becomes time-of-day aware** ("Good morning/afternoon/evening, {name}") — pure client-side `Date` check, no API change, small extra warmth for near-zero cost.
4. **Doctor list layout is unchanged** (horizontal scroll, per user's explicit choice) — only the avatar content changes, from initials-on-flat-tint to an illustrated icon avatar.
5. **Doctor avatar = single friendly icon (`UserRound` from lucide) in a colored circle, tinted by one of 4 accent-color variants chosen by hashing `doctor.id`.** Gives visual variety across a doctor list with zero new data and no per-doctor styling to maintain. Variant palette pulls from existing tokens (`primary`, `secondary`, plus two accent shades already used elsewhere) — not new colors invented for this.
6. **Past consultations cards get a light refresh only**: a small `FileText` (lucide) icon in a tinted circle badge to the left of each card, softened shadow/radius (`rounded-2xl`) to match the new hero. List data/logic (query, filtering, navigation) untouched.
7. **No backend changes.** Every field used already exists; this is a pure frontend restyle.

---

## Frontend structure

**New files:**
- `packages/web/src/components/patient/HeroIllustration.tsx` — the composed hero graphic (device frame + `PulseRing` + `Video` icon + floating accent icons + gradient background). Self-contained, no props beyond optional `className`.
- `packages/web/src/components/patient/DoctorAvatar.tsx` — takes `{ id: string; name: string }`, renders the tinted `UserRound` circle. Color-variant selection (hash `id` → index into a 4-color array) lives here, isolated so it's swappable later if real doctor photos ever ship (same interface-preserving pattern already used for the initials avatar it replaces).

**Modified:**
- `packages/web/src/pages/patient/Appointments.tsx`:
  - Hero section: replace the plain `<h1>`/`<p>`/`<Button>` block with `HeroIllustration` + time-aware greeting + CTA layered on/below it.
  - Doctor list: swap `<Avatar><AvatarFallback>{initials(...)}</AvatarFallback></Avatar>` for `<DoctorAvatar id={doctor.id} name={doctor.name} />`.
  - Past consultations cards: add the `FileText` icon badge, bump card radius/shadow.
- No other files change. `Consult.tsx`, routing, and all data-fetching (`useQuery` calls) stay exactly as they are.

**Not touched:** `HealthLocker.tsx`, `Profile.tsx`, `PatientBottomNav.tsx`, backend routes, schema.

---

## Testing

- `tsc --noEmit` from `packages/web` after implementation.
- Manual check in dev server: `/dashboard` as a patient — hero renders, greeting matches current time of day, doctor avatars show distinct colors across multiple doctors, past-consultations cards show the new icon badge. Check both light and dark (toggle `dark` class) since the hero leans on theme tokens. Check `prefers-reduced-motion` still disables the `PulseRing` animation (existing behavior, must not regress).
