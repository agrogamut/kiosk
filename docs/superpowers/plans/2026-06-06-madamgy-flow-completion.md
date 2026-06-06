# MadamGy Flow Completion Plan

## Goal

Make every core flow testable end-to-end from the browser: patient registration/login, admin login, doctor registration/approval/login, doctor availability, patient consult, video call, prescription PDF, patient print, wallet credit, and health file management.

## Phase 1 - Runtime Blockers

- [x] Split worker startup from MinIO bucket checking in `packages/server/src/index.ts`.
- [x] Ensure `assign-doctor` and `render-pdf` workers start even when `MINIO_SKIP_BUCKET_CHECK=true`.
- [x] Keep MinIO bucket check skippable for local dev without disabling workers.
- [x] Add server startup logs for worker startup.
- [ ] Verify BullMQ queue counts move from `waiting` to `failed/completed`. Blocked: Docker API unavailable in current shell.
- [ ] Start LiveKit in local Docker and verify `ws://localhost:7880` is reachable. Blocked: Docker API unavailable in current shell.
- [x] Confirm `.env.example` matches Docker ports.

## Phase 2 - Admin Access Flow

- [x] Add `/admin/login` page.
- [x] Wire it to `POST /api/auth/admin/login`.
- [x] Store returned auth state and navigate to `/admin`.
- [x] Add logout button to admin dashboard.
- [x] Update route guards so unauthenticated admin access redirects to `/admin/login`.
- [ ] Verify admin can view stats, users, doctors, and calls.

## Phase 3 - Doctor Registration And Login Flow

- [x] Add `/doctor/register` page.
- [x] Wire it to `POST /api/auth/doctor/register`.
- [x] Add `/doctor/login` page with phone/password step.
- [x] Add OTP verification step wired to `/api/auth/doctor/login/verify`.
- [x] Use fixed doctor OTP `000000` when `NODE_ENV !== "production"` for local testing.
- [x] Keep production random OTP + MSG91 behavior.
- [x] After login, navigate approved doctors to `/doctor`.
- [x] Add logout button to doctor dashboard.
- [ ] Verify unapproved doctors cannot login.
- [ ] Verify approved doctors can login and toggle availability.

## Phase 4 - Doctor Approval Flow

- [ ] Confirm admin receives pending doctors through `/api/admin/doctors`.
- [ ] Keep approval action on admin doctors page.
- [ ] After approval, doctor login should succeed.
- [ ] Optionally listen for `doctor:approved` on doctor waiting screen.
- [ ] Verify DB `DoctorProfile.isApproved=true` after approval.

## Phase 5 - Patient Consult Flow

- [ ] Confirm patient `/consult` creates `CallSession` with `QUEUED`.
- [ ] Confirm `assign-doctor` worker assigns approved available doctor.
- [ ] Confirm call status changes to `RINGING`.
- [ ] Confirm doctor dashboard receives `call:incoming`.
- [ ] Confirm accept changes status to `ACTIVE`.
- [ ] Confirm both users receive LiveKit tokens.
- [ ] Confirm patient and doctor enter same LiveKit room.
- [x] Improve patient waiting UI to show `Finding doctor`, `Ringing doctor`, and timeout states.
- [x] Handle `409 Active call exists` by restoring or cancelling stale calls.

## Phase 6 - Prescription, PDF, Wallet Flow

- [ ] Verify doctor can submit prescription only during `ACTIVE` call.
- [ ] Verify `render-pdf` worker creates PDF in MinIO.
- [ ] Verify `HealthFile` is created for patient.
- [ ] Verify `WalletTransaction` credit is created.
- [ ] Verify doctor wallet balance increments.
- [ ] Verify call status becomes `ENDED`.
- [ ] Verify doctor availability resets to true after prescription.
- [ ] Verify patient receives `prescription:ready` and navigates to prescription screen.

## Phase 7 - Health Files Flow

- [x] Add patient lab report upload UI on dashboard.
- [x] Wire upload to `POST /api/health-files`.
- [x] Add delete button for lab reports only.
- [x] Keep prescriptions non-deletable.
- [ ] Verify list, fetch, open, print, upload, and delete flows.

## Phase 8 - In-Call Chat And Vitals

- [x] Add chat panel to patient call screen.
- [x] Add chat panel to doctor call screen.
- [x] Wire text messages to `chat:send`.
- [x] Render `chat:message` events on both sides.
- [x] Add vitals form send action using existing `VitalsForm`.
- [x] Defer image chat unless needed because upload path for chat images is not currently implemented.

## Phase 9 - Session And Socket Cleanup

- [x] Add shared logout helper that calls `/api/auth/logout`.
- [x] Disconnect socket on logout and idle timeout.
- [x] Clear call store on logout.
- [x] Make socket reconnect use the latest token.
- [ ] Verify patient idle logout does not leave doctor availability or calls stale.
- [ ] Verify doctor disconnect sets availability false.

## Phase 10 - Test And Verification

- [ ] Add server test for worker startup behavior if feasible.
- [ ] Add backend test for stale active call handling if changed.
- [x] Run `npm run typecheck`.
- [ ] Run `npm run test --workspace @madamgy/server`. Blocked: Docker API unavailable; DB/Redis/MinIO unreachable.
- [x] Run `npm run build`.
- [ ] Manual test: patient register/login.
- [ ] Manual test: admin login.
- [ ] Manual test: doctor register, admin approve, doctor login.
- [ ] Manual test: doctor available, patient consult, doctor accepts.
- [ ] Manual test: LiveKit room opens on both sides.
- [ ] Manual test: prescription submit, PDF appears, wallet credited.
- [ ] Manual test: lab report upload/delete.
