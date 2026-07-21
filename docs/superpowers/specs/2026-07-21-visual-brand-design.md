# MadamGy — Visual & Brand Design (Task 14 execution)

**Status:** approved by user 2026-07-21, ready for implementation planning.
**Scope:** full patient flow (kiosk/*), doctor flow (doctor/*), admin panel (admin/*), and shared components. Legal pages (legal/*) included since they're public-facing. Localization/multi-language (Task 12) explicitly out of scope — far-future, not blocking this pass.

## Why this exists

Every screen in `packages/web` currently renders in raw default Tailwind (`blue-600`, `gray-50`, system font) because the implementation plan (`2026-07-04-frontend-kiosk-client.md`) deliberately deferred all visual design to a dedicated Task 14 pass — functional wiring first, design second. That pass is this spec. Brand color tokens were already sampled and approved from the MadamGy marketing Figma file on 2026-07-21 (colors only — the marketing site's layout/typography/components are explicitly out of scope, per that plan's "Design decisions" section).

## Icon policy (added 2026-07-21, doctor-flow pass)

User's explicit call: keep icon usage minimal — favor color/text/badges to convey status over decorative iconography, and don't introduce new custom SVG icon graphics (illustrations, decorative marks) into the app going forward. This does not extend to the small functional glyphs already baked into the vendored shadcn primitives themselves (Select's chevron, Checkbox's check, etc. — from `lucide-react`) — those are load-bearing interaction affordances, not decoration, and stripping them would hurt usability for no visual gain. Net effect for new work: no new `lucide-react` imports in hand-written page/feature code unless a control is genuinely ambiguous without one; prefer `Badge` (color + text) over an icon+label pairing for status displays (call status, doctor online/offline, wallet state, etc.).

## Token system

### Color

Locked from the Figma sampling, no changes:

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#FEF8F8` | page background (cream, not pure white) |
| `--surface` | `#FFFFFF` | cards, tiles, sheets |
| `--primary` (rose) | `#DB6591` | primary CTAs, active nav state, logo mark |
| `--accent` (coral) | `#EE908D` | secondary emphasis, highlighted stat numbers, ghost-button borders |
| `--accent-light` | `#F9A8A5` | gradient stop (hero washes, splash) |
| `--accent-deep` | `#E28A86` | gradient stop (hero washes, splash) |
| `--heading` | `#4A4A4A` | headline/title text (charcoal, not black) |
| `--body` | `#A8A6A6` | paragraph/secondary text |
| `--placeholder` | `#A6A6A6` | avatar placeholder fill, disabled states |

Admin reuses the identical token set at higher density (smaller type scale, real `Table` rows, tighter spacing) rather than a separate gray dashboard theme — this was an explicit user decision (same brand, toned down, not a neutral admin theme).

### Typography

Two faces, both self-hosted (bundled, not CDN-loaded — this is a native app shell via Capacitor, it should not depend on network access for its own chrome):

- **Baloo 2** — display face. Headings, button labels, OTP digit boxes, nav/tab labels, the app wordmark. Rounded, friendly, matches the "warm & friendly" personality decision. Bonus (not a current requirement): shares its design language with Devanagari/Tamil/Bengali Baloo siblings, so if Task 12 localization ever happens, the brand voice doesn't have to fall back to a generic system font — not a driver for picking it now, just a property that ages well.
- **Manrope** — body face. Paragraph copy, form labels, table cell data, timestamps. Baloo 2's chunky rounded letterforms lose legibility below ~16px, so body text needs a plainer face.

Weights: Baloo 2 at 600/700 for headings and buttons; Manrope at 400/500 for body, 600 for emphasis/labels.

### Shape & elevation

- `--radius-card`: 24px (large, soft — cards visually "float")
- `--radius-input`: 16px
- `--radius-full`: pill buttons (primary and secondary actions both fully rounded)
- Shadows: single soft shadow tier (`0 8px 24px -8px rgba(219,101,145,0.15)` — tinted with brand rose rather than neutral black, so elevation reads as "warm" not "generic Material")

## Layout concept: "blush canvas, floating white cards"

Cream (`--bg`) stays visible as a margin/gutter around content; content itself lives on white `--surface` cards with `--radius-card`, not edge-to-edge white screens. This is what makes the cream token actually visible in the finished app rather than being a background color nobody sees.

- Single column throughout (patient + doctor surfaces — this is a phone app, not a responsive website; see the existing "phone-app feel" requirement in the frontend plan).
- Primary CTA pinned in the thumb zone (bottom third of viewport), pill-shaped, filled rose.
- Secondary actions: coral-bordered ghost buttons, same pill shape.
- Admin (desktop-web, exempt from phone-app rules) keeps the card language but arranges cards in a grid/dashboard layout with real data tables instead of single-column stacks.

## Signature element: the Pulse

A soft ECG-style ripple — concentric rings expanding from a center point, rose-colored at low opacity, easing out — replaces the generic spinner everywhere a loading/waiting state currently exists. One motif, reused at exactly three moments so it reads as a deliberate signature rather than decoration:

1. **Splash screen** (cold start, before the React app mounts / during the brief native splash shown by `@capacitor/splash-screen`)
2. **OTP send/verify loading state** (`Login.tsx` patient + doctor, `Register.tsx`)
3. **"Connecting you to a doctor" wait screen** (`Consult.tsx`, between patient tapping "start consult" and the call actually connecting)

Implementation: a single `<PulseRing>` component (`packages/web/src/components/brand/PulseRing.tsx`), CSS/`framer-motion`-driven (framer-motion is already a dependency), respecting `prefers-reduced-motion` (falls back to a static ring, no animation). Not used for every minor loading spot (e.g. a button's inline disabled-state spinner stays a plain small spinner) — reserving it for these three moments is what keeps it a signature instead of noise.

## shadcn/ui as the primitive layer

Project is Vite + Tailwind v3 (`tailwindcss ^3.4.0`), not Next.js/Tailwind v4 — `shadcn init` will detect this and configure via `tailwind.config.ts` + CSS custom properties in `:root`, not the v4 `@theme inline` block.

- **Init:** `npx shadcn@latest init -d --base radix` from `packages/web/`, style `new-york`.
- **Token override:** immediately after init, replace the generated CSS variables in `src/index.css` with the palette above (`--primary`→`#DB6591`, `--accent`→`#EE908D`, `--background`→`#FEF8F8`, `--card`→`#FFFFFF`, `--foreground`→`#4A4A4A`, `--muted-foreground`→`#A8A6A6`) and set `--radius` to `1.25rem`. This deliberately overrides shadcn's own default dark-dashboard/zinc bias — that default doesn't fit a warm health app, and the brief (this spec) pins down the direction explicitly.
- **Components to add:** `input`, `label` (the clean field style that prompted this — floating/inline label, clear focus ring in rose), `button`, `card`, `alert` (error states — patient-facing copy per the writing guidance below), `badge` (call status, doctor online/offline), `table` + `dropdown-menu` (admin), `sheet` (mobile filter panels, admin), `dialog` + `alert-dialog` (destructive confirms — `alert-dialog` specifically for anything irreversible: delete account, end call), `skeleton` (loading placeholders), `avatar` (doctor/patient photos — gray-circle placeholder already confirmed as intentional, not final).
- Existing hand-rolled components (`NumPad.tsx`, `VitalsForm.tsx`) are restyled with the new tokens, not replaced — they're kiosk-specific interaction patterns shadcn doesn't have equivalents for.

## Entry & auth consolidation

**Problem:** the current app has four disconnected entry points — `Home.tsx` (a button grid: New Patient / Returning Patient / Doctor Login / Admin Login), `kiosk/Login.tsx` (phone→OTP, no password), `doctor/Login.tsx` (phone+password→OTP), `admin/Login.tsx` (phone+password, no OTP, react-hook-form) — each independently styled with no shared shell. First contact with the app is a decision (which button?) followed by a visually unrelated page. This is the single most important screen to fix since it's the one every user sees first, every time.

**Decision:** collapse all three login flows into one `Entry` screen at `/`, replacing `Home.tsx` entirely.

- A role selector (`<Select>`, shadcn) labeled "I am a", options Patient / Doctor / Admin, defaulting to **Patient** — the default costs a patient zero extra taps (no button-grid decision, no reading four labels to find the right one), while doctor/admin (low-volume, higher-trust users who know to look for the switcher) get one dropdown tap.
- Below the selector, one shared shell (`Card`, consistent step transition, consistent button placement) whose fields change by role, not its container or interaction rhythm:
  - **Patient:** phone → "Send OTP" → 6-digit OTP (reusing `NumPad.tsx`) → "Log in" → `/dashboard`. Below the form: "New here? Create an account" → `/register`.
  - **Doctor:** phone + password → "Send OTP" → 6-digit OTP → "Verify and log in" → `/doctor`. Below the form: "Need approval? Register" → `/doctor/register`.
  - **Admin:** phone + password → "Sign in" (no OTP step — matches the existing backend contract, admin accounts are individually provisioned, not self-registered) → `/admin`.
- `/doctor/login` and `/admin/login` become redirects to `/?role=doctor` and `/?role=admin` (not deleted outright) in case anything external links to them.
- `/register` (patient signup) and `/doctor/register` (doctor approval request) are unchanged, separate routes — they're signup flows, not login, and don't belong inside the role switcher.
- Backend contract is unchanged (`/auth/patient/login/otp/*`, `/auth/doctor/login/*`, `/auth/admin/login` — same three endpoints, same request/response shapes); this is purely a frontend consolidation of three page components into one parameterized component (`pages/Entry.tsx`, sharing role-specific step logic extracted into small hooks or inline switches).

## Content/copy pass

Per the frontend-design writing guidance: rewrite the placeholder-y bits found in the current wiring-only pages —
- Empty/loading/error states get real designed treatment (using `Alert`/`Skeleton`, not blank divs or raw `toast.error(...)` strings with generic text).
- Errors describe what happened and how to fix it, in the app's voice, not technical messages (e.g. current `getApiErrorMessage` fallbacks like "Failed to send OTP" stay, but should read as help, not system noise).
- Buttons keep consistent verbs through a flow (e.g. "Send OTP" → toast "OTP sent", not "OTP dispatched" or similar drift).

## Page/component inventory in scope

**Entry (new, replaces `kiosk/Home.tsx`, `kiosk/Login.tsx`, `doctor/Login.tsx`, `admin/Login.tsx`):** `pages/Entry.tsx` at `/` — see "Entry & auth consolidation" above.

**Kiosk (patient), single-column phone screens:** `Register.tsx`, `Dashboard.tsx`, `Consult.tsx`, `Prescription.tsx`, `components/kiosk/NumPad.tsx`, `components/kiosk/VitalsForm.tsx`, `components/kiosk/IdleGuard.tsx`, `components/video/KioskCallView.tsx`, `components/prescription/*`.

**Doctor, single-column phone screens:** `Register.tsx`, `Dashboard.tsx`, `Call.tsx`, `Wallet.tsx`, `History.tsx`, `components/video/DoctorCallView.tsx`, `components/call/*`, `components/wallet/WalletPanel.tsx`.

**Admin, desktop dashboard layout:** `Dashboard.tsx`, `Doctors.tsx`, `Users.tsx`, `UserDetail.tsx`, `Stats.tsx`, `Calls.tsx`, `Withdrawals.tsx`, `Devices.tsx`, `Wallet.tsx`, `Patients.tsx`, `AuditLog.tsx`.

**Legal (public, unauthenticated):** `DeleteAccount.tsx`, `PrivacyPolicy.tsx` — same token system, simple single-column readable layout, no app-shell chrome (these render outside a logged-in session and need to look trustworthy/legitimate to Play Store reviewers and end users deleting their data).

**App shell:** splash asset (coordinate with the existing Task 4 native-shell splash config), app icon.

## Testing / verification

No automated visual regression tooling in this project — verification is manual:
- Run `npm run dev` (web) and click through each page in the inventory above at a phone viewport width (375–430px) plus the admin pages at desktop width.
- Confirm touch targets stay ≥44×44px after restyling (an easy regression when tightening padding for "clean" look).
- Confirm `prefers-reduced-motion` disables the Pulse animation (toggle in browser devtools rendering tab).
- Contrast check the token pairs actually used for text-on-background (`--heading`/`--body` on `--bg` and `--surface`) against WCAG AA — flag now: `--body` (`#A8A6A6`) on `--bg` (`#FEF8F8`) is a light-gray-on-cream pairing that may fail AA for body text at small sizes; if the contrast checker fails it, darken `--body` slightly for actual paragraph text while keeping the lighter tone for true secondary/caption use — resolve this during implementation, not deferred.
- No new automated tests needed — this is a styling pass over already-tested wiring; existing `vitest` suites should still pass unchanged since no component logic/props change, only markup/className.
