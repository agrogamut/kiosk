# Patient Booking Hero — Design Spec

**Date:** 2026-08-02
**Status:** Approved by user, ready for implementation plan.
**Approach:** Restyle `packages/web/src/pages/patient/Appointments.tsx` (the `/dashboard` booking-home page) with a warm illustrated hero and upgraded avatars, using only existing brand primitives — no new backend, no new data model.

---

## Grounding: what already exists

- Patient booking home is `Appointments.tsx`, route `/dashboard`. Today: plain text welcome + one CTA button, an "Available now" horizontal-scroll row of doctors (initials-only `Avatar`/`AvatarFallback`), and a flat "Past consultations" list.
- `DoctorProfile` has **no photo field** in `schema.prisma` — only `degree`, `regNumber`, `specialization`, `isAvailable`, `isApproved`, `licenseDocKey` (a verification PDF, not a display photo). Confirmed via schema read. Real doctor photos would require a new upload feature — out of scope, user chose illustrated avatars instead.
- `PulseRing` (`components/brand/PulseRing.tsx`) already exists: three animated concentric rings in `border-primary`, built on `framer-motion`, respects `useReducedMotion`. Originally considered for reuse here instead of hand-drawn art, but the final hero uses a bespoke breathing-glow animation instead, to avoid overloading `PulseRing`'s existing meaning as the app's "call is ringing" indicator — see the "Design revision" section below for the full rationale. The hero still themes automatically via CSS-var tokens, so dark mode (`darkMode: ["class"]` in `tailwind.config.ts`) needs no separate handling.
- `lucide-react` and `framer-motion` are already dependencies — no new packages needed.
- Brand tokens: `--primary: 338 62% 63%` (rose/pink), `--secondary: 2 74% 74%` (coral) in `index.css`, wired through Tailwind's `primary`/`secondary` color families. `font-display` = Baloo 2 (rounded, friendly), `font-sans` = Manrope. Always reference via Tailwind classes (`bg-primary`, `text-primary`), never hardcoded hex.
- `GET /api/doctors/available` already returns `{ id, name, specialization }[]` — no shape change needed for the avatar work.

---

## Decisions made directly

1. **Hero is a composed graphic built from existing primitives (icons + `PulseRing` + gradient), not a hand-drawn illustration asset.** Avoids introducing new binary image assets or an external illustration library/CDN dependency, stays themeable through CSS vars, and reuses a component that already exists and is already battle-tested (reduced-motion handling included).
2. **Hero depicts a video-call scene**: a rounded "device frame" card containing a `Video` (lucide) icon, with a slow breathing glow behind it, and a live "N doctors available now" badge in the corner. Chosen over a generic wellness scene because it makes the CTA self-explanatory — this is a video consult app. *(Revised post-implementation — see "Design revision" below.)*
3. **Greeting becomes time-of-day aware** ("Good morning/afternoon/evening, {name}") — pure client-side `Date` check, no API change, small extra warmth for near-zero cost.
4. **Doctor list layout is unchanged** (horizontal scroll, per user's explicit choice) — only the avatar content changes, from initials-on-flat-tint to an illustrated icon avatar.
5. **Doctor avatar = single friendly icon (`UserRound` from lucide) in a colored circle, tinted by one of 4 accent-color variants chosen by hashing `doctor.id`.** Gives visual variety across a doctor list with zero new data and no per-doctor styling to maintain. Variant palette is 4 alpha/shade variants built from the app's two real brand hues (`primary`, `secondary`) only — not additional hues, since no others exist in the codebase's token set.
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

## Design revision (post-implementation design review)

The first build of the hero (device chip + `PulseRing` behind it + `Heart`/`Stethoscope`/`Plus` floating at low opacity) shipped correctly to the original spec, but a design-lead review of that result caught two real problems, not just polish:

1. **Semantic clash.** `PulseRing` already has an established meaning elsewhere in the app — it's the "ringing / waiting for a doctor to pick up" indicator on the call screens. Reusing the identical animation in a static, nothing-is-happening dashboard hero muddies that signal: a returning patient who's used the call-waiting screen would see the same animation doing something unrelated.
2. **Decoration with no informational content.** The three floating medical icons (`Heart`, `Stethoscope`, `Plus`) were pure texture — they don't say anything true about the page. This is the generic "medical icon soup" every health-app hero reaches for by default.

**Revised hero:**
- Drop `PulseRing` from the hero entirely — it stays exclusive to the ringing/waiting screens. In its place, a bespoke, slower "breathing glow" (a blurred circle at `bg-primary/25` on Tailwind's built-in `animate-pulse`, gated behind `motion-safe:`) sits behind the video-chip icon. Visually still reads as "alive," but is a different-enough animation that it can't be mistaken for "a call is ringing."
- Drop the three floating decorative icons entirely.
- Add a small "● N doctors available now" badge in the hero's corner, driven by the real `doctorsQuery.data.length` already fetched on this page — only rendered when the count is greater than zero (never shows a discouraging "0 available"). This ties the hero's one bold element directly to the actual product mechanic — real doctors, reachable right now — instead of ornament, and doubles as the reason the CTA below is worth pressing.
- `HeroIllustration`'s prop signature changes from `{ className?: string }` to `{ availableCount: number; className?: string }` — the caller in `Appointments.tsx` passes `doctorsQuery.data?.length ?? 0`.

Everything else in the original spec (doctor avatars, past-consultations refresh, no backend changes, token-only colors, dark mode via CSS vars) is unchanged.

---

## Testing

- `tsc --noEmit` from `packages/web` after implementation.
- Manual check in dev server: `/dashboard` as a patient — hero renders, greeting matches current time of day, doctor avatars show distinct colors across multiple doctors, past-consultations cards show the new icon badge. Check both light and dark (toggle `dark` class) since the hero leans on theme tokens. Check `prefers-reduced-motion` disables the hero's breathing-glow and live-badge animations (via `motion-safe:`/`motion-reduce:` Tailwind variants) — `PulseRing` is no longer part of this component.
