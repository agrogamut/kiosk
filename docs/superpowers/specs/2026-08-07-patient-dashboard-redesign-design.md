# Patient dashboard redesign

## Problem

Patient home page (`packages/web/src/pages/patient/Appointments.tsx` +
`packages/web/src/components/patient/HeroIllustration.tsx`) has a hero card with
a dead-center illustrated avatar + video-call badge that serves no purpose (it's
not clickable, duplicates the CTA button below it). The page overall reads as
placeholder-ish: illustrated busts everywhere, generic Unsplash background,
doctor grid capped at 3 cards regardless of how many doctors are actually
available. Page needs a full visual pass so it looks finished and reads as a
real product, while staying responsive from narrow phone widths through wide
desktop.

## Scope

Presentational only. No new endpoints, no schema/query changes, no changes to
`/consult`, `/prescription/:id` navigation targets. Three files touched:

- `packages/web/src/components/patient/HeroIllustration.tsx`
- `packages/web/src/pages/patient/Appointments.tsx`
- (styling touch-ups only, no logic change, in the same file — no new components needed)

`DoctorAvatar.tsx` is unchanged — illustrated bust stays as the doctor-card
visual per decision below.

## Decisions

- **Doctor photos**: real stock photo only in the hero banner. Doctor cards in
  "Available now" keep the existing illustrated `DoctorAvatar` bust (unchanged
  component/logic) — real `photoUrl` from the API still overrides the bust when
  present, same as today.
- **Hero**: full re-layout, not a minimal icon removal. Center avatar+video
  badge is deleted outright (it wasn't a functioning control).
- **Available now**: becomes a full responsive grid showing all available
  doctors (previously hard-capped to the first 3 via `.slice(0, 3)`).
- **Past consultations**: restyled (spacing/card treatment) to match the new
  look, no logic change.

## Hero card design

- Real doctor photo replaces the current generic Unsplash background:
  `https://images.unsplash.com/photo-1622253692010-333f2da6031d` — verified
  reachable (HTTP 200), friendly male doctor in blue scrubs, arms crossed,
  light-gray background, smiling. Chosen over other reviewed candidates
  (surgical/dark tones, pure-product shots, an unrelated dog photo that shared
  a similar-looking ID) for warmth and even lighting that keeps white overlay
  text legible.
- Gradient scrim over the photo (existing primary-hued gradient, retuned
  opacity) so greeting text and CTA stay readable against the photo at every
  width.
- Layout, top to bottom: greeting + "N available" pill (existing), photo fills
  the remaining card body, CTA button pinned at the bottom edge.
- Center avatar/video-badge block is removed entirely — no replacement element
  in that space; the photo itself occupies it.
- Existing botanical line-art SVG accent and the two blurred color-glow circles
  stay (they're the page's one recurring aesthetic signature); reposition only
  if they visually clash with the new photo framing.
- `object-position` on the photo tuned so the doctor's face stays in frame at
  narrow widths (~320-360px), not cropped to shoulders/badge only.

## Available now — grid

- Remove `doctorsQuery.data?.slice(0, 3)` cap — render the full list.
- Grid: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`.
- Card content unchanged (`DoctorAvatar`, name, specialization line) — refresh
  padding/shadow/hover state to match the hero's new polish.
- Loading/error/empty states: same components (`SkeletonRows`, `ErrorState`,
  existing empty-state copy), just re-styled to sit inside the new grid
  spacing.

## Past consultations

- Same data (`filesQuery`, filtered to `PRESCRIPTION` type), same navigation
  (`/prescription/:id`). Only spacing/card/icon styling refreshed to match.

## Responsive verification

Existing centered-column container pattern stays
(`max-w-md sm:max-w-lg lg:max-w-2xl`, `mx-auto`) — already phone-to-desktop
scaling, no structural change needed there. Manually verify no regressions at:

- 360px (small phone)
- 768px (tablet / kiosk portrait)
- 1024px (tablet landscape / small desktop)
- 1440px (desktop)

Check specifically: hero photo framing (face not cropped out), doctor grid
column count transitions cleanly, CTA button never overlaps the fixed bottom
nav.

## Non-goals

- No change to `DoctorAvatar` component or its illustrated-bust logic.
- No change to API/query layer, routes, or auth.
- No stock photos added to doctor cards (explicitly decided against).
