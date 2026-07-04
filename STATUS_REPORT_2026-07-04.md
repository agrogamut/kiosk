# MadamGy Status Report — 2026-07-04

## Summary

Docs rewritten to match actual implementation (were leftover "graveyard-chat" template content). Legacy `old/` directory backed up and removed. Full workspace typecheck + 47-test suite verified passing. A complete consult flow (register → auto-assign → LiveKit tokens → chat → vitals → prescription → PDF → Health Folder → wallet credit) was driven end-to-end against a live server with real Postgres/Redis/MinIO and no mocks. Two real admin panel gaps (withdrawal processing, patient/doctor detail view) were implemented and smoke-tested live.

## Work completed today

1. **Docs**: `SPEC.md`, `PLAN.md`, `README.md` rewritten to describe the actual MadamGy kiosk stack (were describing an unrelated "WhatsApp Clone / graveyard-chat" project — leftover template).
2. **`old/` removal**: tarred to `/home/ghoul/graveyard/backups/madamGy-old-backup-20260512.tar.gz` (348MB), then deleted.
3. **Build/typecheck fix**: fresh checkout had never run `npm run build --workspace @madamgy/api-client` nor `prisma generate` — caused spurious "Cannot find module" typecheck errors that looked like code bugs but weren't. Fixed by running both; documented as a standing gotcha in `PLAN.md`.
4. **Full test suite**: 47/47 tests pass against real Postgres (docker, port 55432) + Redis (port 56379).
5. **Live end-to-end verification**: booted the real dev server (workers enabled, `NODE_ENV=development`) and drove the complete consult flow via a script using real HTTP + socket.io-client — not the test harness, which disables BullMQ workers under `NODE_ENV=test`. Every step produced real DB rows (see prior turn's transcript for full JSON dumps): `CallSession` reached `ENDED`, `HealthFile` created, `WalletTransaction` CREDIT of ₹160 applied.
6. **Admin panel gaps filled** (backend + frontend, both smoke-tested live against the running server):
   - Withdrawal requests previously stuck at `PENDING` forever with no way to process them. Added `wallet.service.completeWithdrawal`/`rejectWithdrawal`, routes `GET/PUT /api/admin/wallet/withdrawals*`, and `Withdrawals.tsx`. Verified live: doctor wallet balance dropped 160→60 on approval, double-approval correctly rejected with 400.
   - Admin had no way to inspect a patient's or doctor's health folder / prescriptions / call history. Added `GET /api/admin/users/:id` and `UserDetail.tsx`, linked from the Users and Doctors list pages.

## Gaps found (carried into the plan files below)

- Patient login is PIN-only; requirement doc describes OTP for existing patients.
- Doctor "availability" is a plain boolean with no real presence/heartbeat and no reaper for a crashed doctor session — an `ACTIVE` call can hang forever.
- In-call image/document sharing has server + schema support but no frontend UI.
- Two independent code paths (`call:end` socket handler, PDF-render worker) can both end the same call, racing each other.
- Wallet commission credit only fires on prescription submission, not on general call completion — a consult that ends without a prescription pays the doctor nothing.
- BullMQ workers are disabled under `NODE_ENV=test`, so the 47 passing tests cover REST/auth/CRUD only — assignment, the PDF/wallet pipeline, and the entire Socket.IO layer have zero automated coverage (today's manual E2E run covered it once, but isn't repeatable).
- **`docker-compose.yml`'s `api` service points `env_file` at `.env.example`** — the literal template file with placeholder secrets (`JWT_ACCESS_SECRET=replace-with-64-char-random-string-aaa...`). A production deploy using this compose file as-is would run with placeholder JWT secrets. This is a concrete, production-blocking bug, not a style nit.
- `npm audit`: 11 vulnerabilities (1 critical — `vitest`'s dev-only UI-server file-read bug, not exploitable in production; 6 high — `ws` memory-exhaustion DoS via `socket.io`'s `engine.io` dependency chain, and `form-data` CRLF injection; 4 moderate — `esbuild`/`vite` dev-server request forwarding, `react-router` open redirect).
- No rate limiting/lockout on doctor or admin login (only patient PIN login has the Redis-backed lockout); OTP verification (`otp.service.verifyOtp`) has no attempt limit at all — a 6-digit OTP can be brute-forced within its 300s TTL with no throttling.
- No payment gateway anywhere in the new app (old app had Razorpay + PhonePe) — `CONSULTATION_FEE` is a flat backend constant used only for commission math; there is no patient-facing payment collection flow.
- No audit log of admin actions (approve doctor, disable user, process withdrawal).
- Doctor registration number (`regNumber`) is not verified against any external registry, and there's no document upload (ID/degree certificate) for the admin to review before approving — approval is currently a blind rubber stamp.
- No patient consent capture for teleconsultation (relevant under India's Telemedicine Practice Guidelines, 2020).
- No CI dependency-vulnerability gate, no CD/deploy pipeline, no automated database backups, no error tracking/monitoring beyond the bare `/api/health` liveness check.
- **No Android project exists at all.** The requirement doc's first line says "Android-based" kiosk app; the actual repo is a pure responsive web app with no native wrapper, no printer bridge, no kiosk-lockdown configuration.

## Decisions made this session (scope-setting for the plans below)

Asked and answered before planning:

| Question | Decision |
|---|---|
| Android delivery mechanism | **Native wrapper (Capacitor)** — real Android project, native printer bridge, camera/mic permission handling, kiosk lockdown |
| Patient consultation fee collection | **In-app gateway** (Razorpay) — patient pays through the app before a call is created |
| Doctor withdrawal payout | **Manual** (admin transfers via their own banking, clicks "Mark Paid" to record it) — current implementation is already correct, no change needed |
| Patient login method | **Add real OTP** — implement phone+OTP login matching the requirement doc literally, alongside (not replacing) the existing PIN path until the frontend cuts over |

## Plan files produced

- `docs/superpowers/plans/2026-07-04-backend-production-readiness.md` — the plan being executed now.
- `docs/superpowers/plans/2026-07-04-frontend-kiosk-client.md` — written for later reference only, **not being applied in this pass**. Its visual/design decisions are deliberately left blank, to be filled in a separate `frontend-design`-skill session.
