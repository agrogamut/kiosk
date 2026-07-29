# Feature Batch Planning — 2026-07-29

**Status:** In progress. Brainstorming stage, not yet an implementation plan. Covers 6 requests raised in one batch, split into 5 independent subsystems since they don't share dependencies with each other (except where noted). Each subsystem still needs its own design doc + implementation plan before code gets touched, per the usual spec -> plan -> build cycle used on this project.

This file exists so nothing raised in the batch gets lost between now and when each subsystem gets its full spec written. It records: the original ask, what was found already built in the codebase (so we don't rebuild what exists), decisions locked in via clarifying questions, and what's still open.

---

## 0. Current-state audit (why this matters)

Before assuming anything below is greenfield, a codebase check turned up a lot already built from the 2026-07-15 roles/wallet/revenue spec and the 2026-07-20 admin-kiosk-dashboard plan:

- **Kiosk device attribution already exists.** `Kiosk` model (deviceId <-> adminId), `POST /api/admin/kiosk-devices` registration, automatic `assistingAdminId` resolution on booking, three-way revenue split (doctor 65 / admin 25 / super-admin 10), wallet credit on call completion. All implemented and confirmed via code inspection 2026-07-21.
- **ADMIN role already has its own dashboard + wallet.** `/admin/devices`, `/admin/wallet`, `/admin/patients` pages exist, gated to `ADMIN` role via `RequireRole`. Admin logs in with phone+password (`POST /auth/admin/login`), not OTP.
- **Razorpay is already fully wired end to end on the backend.** `payment.service.ts` creates the order (`createPaymentOrder`), verifies webhook signatures, marks payments paid, handles refunds. `Consult.tsx` on the frontend already calls `POST /payments/order` and opens Razorpay's own checkout modal (`window.Razorpay(...).open()`) before the call is created.
- **Health file storage already exists on the backend.** `health-files.routes.ts`, doctor-side viewing via `PatientHistoryPanel.tsx`, PDF rendering worker. What's missing is patient-facing upload/browse UI and the bottom-nav entry point to it.
- **No bottom nav anywhere in the repo.** Confirmed by grep — this is genuinely new.
- **No contact-us / report-an-issue form anywhere in the repo.** Genuinely new.
- **Play Store compliance (2026-07-21, approved and implemented) locked in "anonymize on delete, never hard-delete"** for user accounts — FK constraints from CallSession/Prescription/Payment/WalletTransaction/HealthFile block hard-delete anyway, and it would destroy the other party's legitimate medical/financial records. This is directly relevant to item 3 below and was checked against before locking in that item's design.

Net effect: several of the 6 asks are smaller than they first read, because the hard backend plumbing already exists. The real gaps are mostly frontend (bottom nav, health locker UI, kiosk-lock UI, contact form) plus two backend additions (manual user creation, hard-delete... decided against, see below).

---

## Reprioritization, 2026-07-29 (after the audit above)

Since items 1, 2/5, and 4 already have their backend done, the user redirected: build the **frontend** for those three first, since that's the actual remaining work, and hold items 3 (superadmin CRUD) and 6 (contact-us) — both still need real backend additions — for after. Standing visual direction for all of this frontend work: **stylish but minimal.** Concretely: generous whitespace, one accent color doing the work (the existing brand rose `#DB6591`) rather than color everywhere, soft depth (the glass nav, subtle shadows) instead of hard borders/boxes, and a small number of clear elements per screen rather than dense stacked cards — "lively/filled" (item 2's ask) means purposeful content (doctor photos, a top-doctors row) presented cleanly, not visual clutter.

Remaining open questions from below were resolved as calls rather than further back-and-forth, per this user's standing preference to decide architecture/UX defaults directly and flag them once:
- **Health locker doctor-access scope → permanent, not call-only.** A doctor who has ever treated a patient keeps read access to their locker afterward, matching how `PatientHistoryPanel.tsx` already treats prescriptions/history — a consistent "your treating doctors can see your medical record" model reads more correctly than access vanishing the moment a call ends.
- **"Top doctors" ranking → currently-available doctors first, no fabricated ranking.** No ratings/review system exists today, so "top" becoming a real ranking would need one built first (out of scope right now) — "available now" is honest and immediately useful instead.
- **Bottom nav → patient-facing only.** Doctors already have their own dashboard/nav pattern (`/doctor`, `/doctor/wallet`, `/doctor/history`, `/doctor/prescriptions`); this subsystem doesn't touch that.
- **Profile tab → personal details editing plus a link out to the existing `/delete-account` page.** No new settings surface (language/notifications/payment methods) invented for this pass — nothing in the original ask calls for it.
- **Razorpay item 4 → build the custom pre-payment screen**, not just rely on the existing default popup. A branded summary (doctor name/specialty, consult fee, a single clear "Pay now") appearing before Razorpay's own checkout opens is what "a payment gateway page that shows up" was actually asking for.

---

## 1. Kiosk login layer

**Original ask:** "kiosk login like a doctor login with a specific login code or registration code and then the kiosk can book for the customers through the kiosk login so basically when kiosk login happens that gets a wallet thing and its own thing as well so the kiosk gets its own dashboard and stuff... it acts as a layer on top of the customer booking things."

**Conflict flagged and resolved:** the approved 2026-07-15 spec explicitly dropped an earlier "admin books on behalf of patient" actor-model in favor of device-based attribution (patient still books themself; the device they're on determines which admin gets credited). The wording of this ask sounded like that dropped model coming back. Clarifying question asked and answered — it is NOT that. Confirmed intent:

**Locked design:**
- Kiosk login is a **lock/gate layer on top of the existing shared `Entry.tsx` screen**, not a new booking actor. Nothing about who books, who pays, or how attribution/wallet-crediting works changes — that machinery is already built and stays as-is.
- Today `Entry.tsx` shows one screen with a role dropdown (Patient / Doctor / Admin) — anyone at a physical terminal can flip roles and attempt any login. That's the actual gap.
- New behavior: an admin logs in once on the physical device using the **existing** phone+password admin login (`/auth/admin/login`, already built, no new credential system needed). On success, if this is the first login on that device: automatically call the existing kiosk-device registration (`POST /api/admin/kiosk-devices`) to bind `deviceId` to that admin, AND set a **device-local** persisted flag (e.g. Capacitor Preferences) marking the terminal "locked."
- While locked: `Entry.tsx` hides the role dropdown entirely and shows only the patient phone/OTP login form. A customer walking up to the terminal only ever sees the patient flow.
- **Unlock mechanism (decided):** a hidden, unobtrusive re-login gate stays reachable on the locked screen (e.g. a small icon or a long-press on the logo — exact placement is a visual-design decision for later, not a product decision). Tapping it re-prompts for the admin phone+password. On success it temporarily reveals the full role-picker/dashboard, so the kiosk owner can check their existing wallet/dashboard on the same physical terminal. Re-locks on next app open (session-scoped unlock, not permanent).
- The "wallet thing and its own dashboard" part of the original ask is **already satisfied** by the existing ADMIN role's `/admin/wallet`, `/admin/devices`, `/admin/patients` pages — no new dashboard needs building, just needs to stay reachable through the unlock gate above.

**Scope for this subsystem's eventual plan:** frontend-only. Add a locked/unlocked state to the app shell, gate `Entry.tsx`'s role picker behind it, wire the hidden unlock affordance, reuse existing admin login + kiosk-registration endpoints as-is. No schema or backend route changes anticipated.

**Still open (visual, not product):** exact placement/style of the hidden unlock affordance — candidate for the visual companion when this subsystem's own brainstorm happens.

---

## 2 & 5. Patient app shell — bottom nav, health locker, profile, and a livelier landing page

These two original asks are the same subsystem (patient-facing app shell) and are treated as one.

**Original ask (item 2):** floating bottom navbar, 3 icons — Appointments, Health Locker (upload PDFs/images/files, visible to a connected doctor), Profile. Translucent glass background, reddish tint on the selected icon. Also: the whole patient experience should feel more "filled" and lively — doctor photos, not sparse.

**Original ask (item 5):** patient's post-login landing page needs content to fill it out — "something like top doctors and stuff."

**Current-state relevant to this:** health file storage/backend already exists (`health-files.routes.ts`, `PatientHistoryPanel.tsx` on the doctor side). No bottom nav exists anywhere yet. No dedicated patient landing/home page with doctor listings was found under `packages/web/src/pages` — the patient's current post-login destination is `/dashboard` (`KioskDashboard` — note: files under `pages/kiosk/` are legacy-named patient-facing pages from before the app pivoted from kiosk-hardware to phone-app, they are NOT related to the admin/kiosk-device concept in item 1; worth a rename pass at some point to stop the name collision but out of scope here).

**Locked so far:**
- 3-icon bottom nav: Appointments / Health Locker / Profile. Glass/translucent background, reddish tint on selected icon — visual spec, to be nailed down with the visual companion when this subsystem gets its own brainstorm session (this is a genuinely visual decision, better shown than described).
- Health Locker: patient uploads PDFs/images/other files; when a doctor is connected to that patient, the doctor can see everything in it. This should mostly be new UI over the existing health-files backend, not a new backend.

**Still open (not yet asked):**
- Does "connected to a doctor" mean only during an active call, or does a doctor retain access to a patient's locker after the call ends too (i.e. any doctor who has ever treated them can always see it later, vs access is scoped to the live call only)? `PatientHistoryPanel.tsx` may already answer this for prescriptions/history — needs checking against health files specifically before assuming.
- "Top doctors" on the landing page — ranked by what (rating, availability, speciality, most-booked)? Is there a ratings/review system at all today, or does "top" just mean "currently available / featured"?
- Does the bottom nav apply to patients only, or also to doctors (doctors have their own dashboard already, `/doctor`, `/doctor/wallet`, `/doctor/history`, `/doctor/prescriptions` — likely their own nav pattern already, needs checking)?
- Profile tab scope — just editable personal details, or also settings (language, notifications, linked payment methods, delete-account entry point which currently lives at `/delete-account` as a separate public page)?

**Recommendation:** this subsystem is the best candidate for the visual companion (glass nav, tint states, "lively" landing layout, doctor photo treatment are all things better shown than described) — offer it when this subsystem's dedicated brainstorm starts.

---

## 3. Superadmin — more CRUD power over users

**Original ask:** "superadmin needs to have more power it can crud users and have more power."

**Conflict checked and resolved:** the approved Play Store compliance plan (2026-07-21) locked in anonymize-on-delete for all users, specifically because hard-deleting would break FK-linked medical/financial records (CallSession, Prescription, Payment, WalletTransaction, HealthFile) belonging to the *other* party in those records (e.g. hard-deleting a patient would corrupt a doctor's legitimate consult history). Clarifying question asked and answered.

**Locked design:**
- **Delete stays anonymize-only.** No hard-delete capability being added. Superadmin's existing disable/enable + the existing anonymization deletion flow (built for Play Store compliance) remain the only "D" in this CRUD.
- **New capability: superadmin can manually create a user account of any role (including PATIENT), bypassing OTP entirely.** Use case explicitly given: OTP/SMS delivery problems blocking a real customer from onboarding themselves. This extends the existing `POST /api/super-admin/staff` pattern (already creates DOCTOR/ADMIN with a system-generated temp credential, phone pre-verified, skips OTP) to also cover PATIENT.
- **"More power" beyond that** likely means fuller edit access to any user's profile fields (not just enable/disable + role assignment, which already exist) — this needs to be enumerated field-by-field when this subsystem gets its own design pass, rather than guessed at here.

**Scope for this subsystem's eventual plan:** mostly backend (extend staff-creation endpoint or add a parallel one for manual PATIENT creation; audit-log it same as `staff.create`) plus an admin-portal UI for it and for full profile editing.

---

## 4. Razorpay payment gateway before doctor connect

**Original ask:** "we need to have a razorpay payment gateway page that shows up just before someone wants to consult a doctor and before the doctor connects the payment needs to go through."

**Current-state finding — this is largely already built.** `Consult.tsx` already calls `POST /payments/order`, receives a Razorpay order, and opens Razorpay's own checkout modal (`window.Razorpay(...).open()`) before `createCallWithPayment` runs and the call is created — i.e. payment already gates doctor connection today. Backend order-creation, webhook signature verification, and payment-status marking are all implemented in `payment.service.ts` / `payments.routes.ts`.

**Still open (not yet asked) — the real question for this subsystem:** is the existing flow (Razorpay's own default checkout popup) what's wanted, or does "a payment gateway page that shows up" mean a **custom-branded pre-payment summary screen** (consult fee, doctor name/specialty, order summary, a "Pay now" call-to-action styled to match the app) that appears first, with Razorpay's checkout opening only after that screen is confirmed? This is a UI/UX decision, not a plumbing one — the backend doesn't need to change either way, just needs to be asked directly when this subsystem's brainstorm happens.

**Scope for this subsystem's eventual plan:** almost certainly frontend-only, likely small — a new pre-payment screen component, no new backend logic, unless the answer to the open question above reveals something not yet built.

---

## 6. Contact-us / report-an-issue form

**Original ask:** "we need to have a section like contact us form which reports an issue which might be causing a problem and you can check that directly from the admin portal and it needs to be descriptive."

**Current-state finding:** nothing like this exists anywhere in the repo today (genuinely new — no schema, no route, no page).

**Locked design (clarifying question asked and answered):**
- **Read-only descriptive list on the admin side** — no ticket-workflow (no status/assignee/internal-notes system). Admin portal just lists and filters submissions, can mark read/unread.
- Form itself should be "descriptive" — capture category, free-text description, attachment (screenshot/file), and submitter's account + device info automatically (not manually typed) so admin has full context without back-and-forth.

**Scope for this subsystem's eventual plan:** new `IssueReport` (or similar) model, a submission route (any authenticated role — patient/doctor/admin — should probably be able to file one, needs confirming whether non-authenticated/pre-login users can too), a submission form page, and a superadmin/admin list-view page. Small, fully independent subsystem, no dependency on the other four.

---

## 7. Video call polish, end to end

**Original ask:** polish the video-call experience properly, end to end. Raised as its own separate task, not bundled with the frontend-app-shell pass above.

**Current-state finding:** a working LiveKit-based call flow already exists on both sides — patient (`KioskCallView.tsx`, driven from `Consult.tsx`), doctor (`DoctorCallView.tsx`, driven from `pages/doctor/Call.tsx`), shared state in `useCall.ts` / `call.store.ts`, backend room/token issuance in `livekit.service.ts`, socket signaling in `call.handler.ts`. This is a polish pass on an existing working feature, not new plumbing — same category as items 1/2/4 above (frontend-heavy, backend likely mostly untouched), but explicitly kept as its own separate task rather than folded into the app-shell pass, per the user's instruction.

**Clarifying question asked and answered — scope confirmed as all three:**
- **Visual/UI:** call-screen layout, controls (mic/camera/end-call), self-view placement, connection-quality indicator, styling consistent with the app's "stylish but minimal" direction.
- **Reliability:** reconnect-on-drop handling, degraded-network behavior, clearer connecting/waiting/ended states.
- **New features:** explicitly including whatever's needed to hit the reference model below.

**Reference model given by the user: "work like how Uber Connect / Uber discovery works."** Reads as: replace today's connect experience with an Uber-style *matching/searching* moment — a live "finding your doctor" state (animated searching/radar-style UI, not a static spinner) between the patient requesting a consult and a doctor actually picking up, which then transitions smoothly into the live call once matched. This implies:
- A real waiting/matching screen doesn't fully exist yet in this form — needs checking against what `Consult.tsx` currently shows between payment success and the doctor joining (today's behavior needs auditing before assuming this is 100% new).
- **Checked — backend doctor-matching already exists as a real pool/queue system, not 1:1 pre-assignment.** `calls.routes.ts` pushes onto `assignDoctorQueue` (BullMQ), processed by `packages/server/src/workers/assign-doctor.worker.ts` — and it was recently touched (git history shows a "robust doctor matching" commit). So the "discovery" half of the Uber reference is largely already backend-supported; this item is likely **frontend-heavy after all** — building the Uber-style live searching/matching screen on top of the existing queue/worker, not inventing matching logic from scratch. Still needs the worker's actual behavior read in detail (timeout/retry/fallback rules) before assuming the frontend can just subscribe to it as-is with no backend change.

**This item is still broad enough (three polish dimensions plus a UX metaphor change) to need its own full brainstorming session before a design can be written** — not resolved by one question. What's confirmed: visual+reliability+features all in scope, Uber-style matching-screen metaphor wanted, backend matching engine already exists so this leans frontend. What's still open: exact behavior of `assign-doctor.worker.ts` (needs reading), and the specific reconnect/error states to design for.

**Scope for this subsystem's eventual plan:** likely frontend-heavy (matching/searching screen, call-screen UI polish, reconnect/error handling) — full read of the existing worker needed before ruling out backend changes entirely.

---

## Build order (updated 2026-07-29 — frontend-first pass)

**Now — frontend-only, backend already done for all three:**
1. **Kiosk login layer** (item 1) — lock/gate on `Entry.tsx`, hidden unlock affordance. All product questions resolved, ready for a formal spec first.
2. **Patient app shell** (items 2 + 5) — bottom nav (glass, 3 icons, reddish tint on selected), Health Locker upload/browse UI, Profile tab, landing page fill (available-doctors row + general liveliness pass with doctor photos). All product questions resolved above; visual specifics (glass treatment, tint values, layout) go through the visual companion when this subsystem's own brainstorm starts.
3. **Razorpay pre-payment screen** (item 4) — new branded summary screen in front of the existing checkout popup. Backend untouched.

**Later — needs real backend work first, held per this reprioritization:**
4. Superadmin CRUD power-up (item 3)
5. Contact-us / report-an-issue (item 6)

**Separate track, kept independent per the user's instruction — not bundled into the frontend-shell pass above:**
6. Video call polish, end to end (item 7) — still needs its own scoping pass before a design can be written; too broad as stated.

## Next steps

Each of the three frontend-pass subsystems above still needs its own brainstorming pass (any remaining specifics, design presented and approved) followed by its own written spec (`docs/superpowers/specs/`) and implementation plan (`docs/superpowers/plans/`), per the process already used for every other feature on this project. This file is the intake record, not a substitute for that. Start with subsystem 1 (kiosk login layer) — its design is fully resolved and it's the smallest, so it can move straight to a formal spec; subsystem 2 (patient app shell) is the one to run through the visual companion given how much of it is genuinely visual.
