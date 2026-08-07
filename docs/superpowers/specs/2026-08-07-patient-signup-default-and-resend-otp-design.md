# Patient sign-up default + resend OTP

## Problem

Two gaps in the patient entry flow (`packages/web/src/pages/Entry.tsx`):

1. A brand-new patient landing on `/` (unlocked device — own phone/laptop, or
   a kiosk before it's locked) sees the **login** form first, with a small
   "New here? Create an account" link to `/register`. Most people walking up
   to this app for the first time are new patients; login-first makes the
   common case the extra click.
2. The OTP step (shared by patient and doctor login) has no way to get a new
   code if the SMS doesn't arrive — only "Change phone number", which restarts
   the whole flow instead of just resending.

## Scope

Frontend only, `packages/web`. No backend/API changes — the OTP resend reuses
the existing `/auth/patient/login/otp/initiate` and
`/auth/doctor/login/initiate` endpoints, which already rate-limit per
phone+IP (`checkAttemptLimit` in `auth.routes.ts`). No schema changes.

## Decisions

- **Locked kiosk screen is untouched.** When `useKioskStore().locked` is
  true, the patient branch of `Entry.tsx` renders exactly as it does today —
  login form first, `Link` to `/register` for new patients. This is the
  physical clinic kiosk's daily-return screen for already-registered
  patients; it must not default to signup on every session.
- **Doctor, Admin, Kiosk Owner flows are untouched** — role picker, long-press
  unlock, `/doctor/login`, `/admin/login` redirects, `RequireRole` fallbacks,
  all unaffected. Nothing about routing to `/` changes.
- **`/register` route stays** as a real, directly-linkable page (unchanged
  behavior) — some entry points (a QR code at a clinic, a bookmark) may still
  land there directly.
- Resend OTP applies to **both** patient and doctor login (same OTP-step UI,
  same code path today).
- Resend has a **30-second client-side cooldown** after each send
  (initial send or resend) — button reads "Resend code in 0:30", disabled,
  ticks down, then becomes "Resend OTP" and is clickable. The server's
  existing rate limiter is the real backstop; this is just UX, not security.

## Design

### A. Extract the registration form

`packages/web/src/pages/kiosk/Register.tsx` currently owns the entire
patient-registration form (name, phone, DOB, gender, email, consent, submit)
inline. Extract the `<form>` itself (everything inside the `CardContent`,
minus the `Card`/`Logo`/`<h1>` page chrome) into a new component:

`packages/web/src/components/patient/PatientRegisterForm.tsx`

```tsx
interface PatientRegisterFormProps {
  onSuccess: (response: { accessToken: string; user: { id: string; name: string; role: UserRole } }) => void;
  footer: ReactNode;
}
```

It owns its own form state (name/phone/dob/gender/email/consent) exactly as
`KioskRegister` does today, POSTs to `/auth/patient/register` on submit, and
calls `onSuccess(response.data)` instead of navigating directly — the caller
(page or inline usage) decides what happens next. The `footer` prop is
whatever the caller wants rendered below the submit button (a real page link,
or a local view-toggle button) — the form itself has no opinion on
navigation.

`KioskRegister.tsx` becomes a thin wrapper: `Logo` + heading + `Card` +
`<PatientRegisterForm onSuccess={(r) => { setAuth(r.accessToken, r.user); navigate("/dashboard"); }} footer={<p>Already have an account? <Link to="/">Log in</Link></p>} />`.
Route, behavior, and URL (`/register`) are unchanged.

### B. Entry.tsx — signup-first on unlocked patient tab

New local state: `patientView: "signup" | "login"`, default `"signup"`.
Reset to `"signup"` in `changeRole` (cosmetic tidiness, not load-bearing).

The existing patient branch (`displayRole === "PATIENT"`, when not showing
the OTP step or unlock chooser) splits on `locked`:

- **`locked === true`:** unchanged — exactly today's login form, exactly
  today's `<Link to="/register">Create an account</Link>` footer. (The
  phone-input login form's JSX is pulled into one small local render helper
  inside `Entry.tsx`, parameterized by a `footer: ReactNode` slot, so this
  branch and the one below share it instead of duplicating the `<form>`.)
- **`locked === false`:**
  - `patientView === "signup"` (default): render
    `<PatientRegisterForm onSuccess={(r) => { setAuth(r.accessToken, r.user); enterApp(r.user); }} footer={<p>Already have an account? <button type="button" onClick={() => setPatientView("login")}>Log in</button></p>} />`.
  - `patientView === "login"`: the same local login-form helper as the locked
    branch, but its footer is
    `<p>New here? <button type="button" onClick={() => setPatientView("signup")}>Create an account</button></p>`
    — a local view switch, not a route navigation, since both views already
    live on `/`.

No change to `sendPatientOtp`, `verifyPatientOtp`, doctor/admin logic, the
unlock chooser, or the OTP step's existing "Change phone number" link.

### C. Resend OTP

In the shared `step === "otp"` block:

- New state: `resendCooldown: number` (seconds remaining; `0` = ready).
- `sendPatientOtp` and `sendDoctorOtp` (existing functions, unchanged
  otherwise) set `resendCooldown = 30` right after the success toast, since
  both already run on initial send and will now also run on resend.
- A `useEffect` ticks `resendCooldown` down by 1 every second while
  `step === "otp"` and `resendCooldown > 0`; clears its interval on
  unmount/step change.
- `resendOtp()`: no-ops if `resendCooldown > 0` or `submitting`; otherwise
  calls `sendDoctorOtp(doctorForm.getValues())` or
  `sendPatientOtp(patientForm.getValues())` depending on `displayRole` —
  reusing the credentials already sitting in each `react-hook-form` instance
  (neither form is reset when moving to the OTP step today), so no new
  storage of phone/password is needed.
- New button in the OTP step, under the existing "Change phone number" link:
  `Resend code in 0:{cooldown}` while cooling down (disabled), `Resend OTP`
  once ready (calls `resendOtp`).

## Non-goals

- No change to `/register`'s URL or its standalone reachability.
- No change to locked-kiosk behavior.
- No change to doctor/admin/kiosk-owner login logic.
- No backend changes — resend is a frontend re-call of an existing endpoint.
- No persistent/localStorage cooldown across page reloads — resetting on
  reload is acceptable; the server-side rate limit still applies regardless.
