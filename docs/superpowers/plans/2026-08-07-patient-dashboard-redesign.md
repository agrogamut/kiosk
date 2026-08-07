# Patient Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the patient dashboard hero a real doctor photo and full re-layout, expand "Available now" to a responsive grid showing all doctors, and restyle "Past consultations" to match — all presentational, no data/route changes.

**Architecture:** Two files, two tasks. Task 1 touches only `HeroIllustration.tsx` (photo, framing, gradient). Task 2 touches only `Appointments.tsx` (doctor grid + past-consultations styling). No new components, no new dependencies.

**Tech Stack:** React + TypeScript, Tailwind CSS, Vite. No test framework in `packages/web` — verification is `tsc --noEmit` plus manual visual check via `npm run dev` in browser at fixed viewport widths.

## Global Constraints

- Presentational only — do not touch `/consult`, `/prescription/:id` navigation, query keys, or the `AvailableDoctor` / `HealthFile` shapes. (spec: Scope)
- `DoctorAvatar.tsx` stays unchanged — illustrated bust remains the doctor-card visual, real `photoUrl` still overrides it when present. (spec: Decisions)
- Keep the existing centered-column container pattern (`mx-auto max-w-md sm:max-w-lg lg:max-w-2xl`) — it already scales phone-to-desktop. (spec: Responsive verification)
- Verify manually at 360px, 768px, 1024px, 1440px: hero photo framing, grid column transitions, CTA never overlapping the fixed bottom nav. (spec: Responsive verification)

---

### Task 1: Hero card — real doctor photo, full re-layout polish

**Files:**
- Modify: `packages/web/src/components/patient/HeroIllustration.tsx`

**Interfaces:**
- Consumes: nothing new — same props (`name`, `greeting`, `availableCount`, `onConsult`, `className`).
- Produces: nothing new — visual-only change, no prop/behavior change for `Appointments.tsx` to consume.

Current file state (already has the center avatar/video-badge removed by an earlier commit; this task only swaps the background photo and tunes framing/legibility):

```tsx
// packages/web/src/components/patient/HeroIllustration.tsx (current, lines 12-26)
  return (
    <div
      className={cn(
        "relative flex min-h-72 flex-col justify-between gap-5 overflow-hidden rounded-3xl bg-gradient-to-br from-primary/15 via-secondary/10 to-tertiary/10 p-6",
        className,
      )}
    >
      <img
        src="https://images.unsplash.com/photo-1758691462743-f9fc9e430d39?q=80&w=1200&auto=format&fit=crop"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 size-full object-cover"
      />
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-primary/75 via-primary/25 to-primary/70" />
```

- [ ] **Step 1: Swap the background photo and tune object-position**

Replace the generic Unsplash URL with a verified-reachable doctor portrait (friendly male doctor, blue scrubs, light-gray background, smiling — good even lighting for legible white text over it). Add `object-top` so the face stays framed when the card is short/wide, not cropped to shoulders only.

```tsx
      <img
        src="https://images.unsplash.com/photo-1622253692010-333f2da6031d?q=80&w=1200&auto=format&fit=crop"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 size-full object-cover object-top"
      />
```

- [ ] **Step 2: Retune the gradient scrim and card min-height**

Give the photo more presence (taller card) and strengthen the scrim at top/bottom (where text sits) while keeping the middle lighter (where the photo reads best), so the greeting text and CTA button both stay legible against the new photo at every width.

```tsx
    <div
      className={cn(
        "relative flex min-h-80 flex-col justify-between gap-5 overflow-hidden rounded-3xl bg-gradient-to-br from-primary/15 via-secondary/10 to-tertiary/10 p-6 sm:min-h-96",
        className,
      )}
    >
      <img
        src="https://images.unsplash.com/photo-1622253692010-333f2da6031d?q=80&w=1200&auto=format&fit=crop"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 size-full object-cover object-top"
      />
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-primary/70 via-primary/15 to-primary/80" />
```

Leave the botanical `<svg>` accent and the two blurred glow `<div>`s (lines 30-43 in the current file) untouched — they stay as-is, no repositioning needed since the photo's subject is roughly centered and doesn't clash with the top-left/bottom-left accent placement. Leave the greeting/pill block and the `<Button>` (lines 45-69) untouched — layout logic (top row, bottom-pinned CTA) already matches the target design.

- [ ] **Step 3: Typecheck**

Run: `cd packages/web && npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Visual check**

Run: `cd packages/web && npm run dev`, open the patient dashboard route in a browser.
Resize to 360px, 768px, 1024px, 1440px. Confirm: doctor's face stays in frame (not cropped to just a shoulder/torso), greeting text and "N available" pill are readable against the photo, CTA button text is readable against the photo at the bottom edge.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/patient/HeroIllustration.tsx
git commit -m "style: give patient dashboard hero a real doctor photo"
```

---

### Task 2: Appointments page — full doctor grid + past-consultations restyle

**Files:**
- Modify: `packages/web/src/pages/patient/Appointments.tsx:72-93` (Available now grid)
- Modify: `packages/web/src/pages/patient/Appointments.tsx:98-130` (Past consultations)

**Interfaces:**
- Consumes: `HeroIllustration` from Task 1 (props unchanged, no interface change to adapt to).
- Produces: nothing consumed elsewhere — this is the leaf page component.

- [ ] **Step 1: Show all available doctors in a responsive grid**

Current code (`packages/web/src/pages/patient/Appointments.tsx:72-93`):

```tsx
              {doctorsQuery.data && doctorsQuery.data.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  {doctorsQuery.data.slice(0, 3).map((doctor) => (
                    <button
                      key={doctor.id}
                      type="button"
                      onClick={() => navigate("/consult")}
                      className="flex flex-col items-center gap-2 rounded-2xl bg-card p-4 text-center shadow-sm shadow-foreground/5"
                    >
                      <DoctorAvatar
                        id={doctor.id}
                        name={doctor.name}
                        photoUrl={doctor.photoUrl}
                        showStatus
                        className="size-14"
                      />
                      <p className="line-clamp-1 text-sm font-medium text-foreground">{doctor.name}</p>
                      <p className="line-clamp-1 text-xs text-muted-foreground">{doctor.specialization ?? "General"}</p>
                    </button>
                  ))}
                </div>
              )}
```

Replace with (drop the `.slice(0, 3)` cap, widen the grid to 2/3/4 columns by breakpoint, add a hover shadow for polish):

```tsx
              {doctorsQuery.data && doctorsQuery.data.length > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {doctorsQuery.data.map((doctor) => (
                    <button
                      key={doctor.id}
                      type="button"
                      onClick={() => navigate("/consult")}
                      className="flex flex-col items-center gap-2 rounded-2xl bg-card p-4 text-center shadow-sm shadow-foreground/5 transition-shadow hover:shadow-md"
                    >
                      <DoctorAvatar
                        id={doctor.id}
                        name={doctor.name}
                        photoUrl={doctor.photoUrl}
                        showStatus
                        className="size-14"
                      />
                      <p className="line-clamp-1 text-sm font-medium text-foreground">{doctor.name}</p>
                      <p className="line-clamp-1 text-xs text-muted-foreground">{doctor.specialization ?? "General"}</p>
                    </button>
                  ))}
                </div>
              )}
```

- [ ] **Step 2: Restyle past consultations cards**

Current code (`packages/web/src/pages/patient/Appointments.tsx:107-129`):

```tsx
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
            </div>
          )}
```

Replace with (same data/logic, larger icon tile to match the doctor-card visual language, hover shadow to match the new grid cards, consistent gap):

```tsx
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
                  className="flex items-center gap-4 rounded-2xl bg-card p-5 text-left shadow-sm shadow-foreground/5 transition-shadow hover:shadow-md"
                >
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <FileText className="size-5" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{file.name}</p>
                    <p className="text-sm text-muted-foreground">{format(new Date(file.createdAt), "dd MMM yyyy")}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
```

- [ ] **Step 3: Typecheck**

Run: `cd packages/web && npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Visual check**

With `npm run dev` still running, reload the patient dashboard. Resize to 360px, 768px, 1024px, 1440px. Confirm: doctor grid shows 2 columns at 360px, 3 at 768px, 4 at 1024px+; with more than 3 doctors in fixture/seed data, all render (no silent cap); past-consultation cards have consistent spacing/hover with the doctor grid; nothing overlaps the fixed bottom nav at any width.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/pages/patient/Appointments.tsx
git commit -m "style: full doctor grid and past-consultations restyle on patient dashboard"
```
