# MadamGy Kiosk — Build Plan

## Project Name: madamgy

Rebuild of the legacy HealingGmaut platform (archived, see project history) as a monorepo with shared types, PostgreSQL/Prisma, and LiveKit for self-hosted video. Requirements source: `MadamGy Kiosk App – Requirement Sheet.docx` at repo root.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        Client                            │
│         React Web App (Vite + TypeScript)                │
│   Kiosk (patient) / Doctor / Admin — one app, role-gated  │
│   Runs in Android WebView/kiosk mode on the physical device│
└───────────────────────────┬───────────────────────────────┘
                            │ REST + WebSocket
┌───────────────────────────▼───────────────────────────────┐
│                   API Server (Node.js)                     │
│   Express + Socket.io                                       │
│   - Auth (JWT, phone+PIN / phone+password+OTP)              │
│   - Call queueing + auto doctor assignment (BullMQ)          │
│   - Chat / vitals sharing over sockets                       │
│   - LiveKit token generation                                  │
│   - Prescription submit → PDF render (BullMQ) → Health Folder │
│   - Doctor wallet / commission / withdrawal requests          │
└──────────┬─────────────────────┬─────────────────┬─────────┘
           │ Prisma ORM          │ LiveKit SDK       │ MinIO SDK
┌──────────▼──────┐   ┌──────────▼──────────┐  ┌─────▼──────┐
│   PostgreSQL     │   │   LiveKit Server     │  │   MinIO    │
│   (users, calls, │   │   (Docker, SFU)      │  │ (PDFs,     │
│    prescriptions,│   └──────────────────────┘  │  reports)  │
│    wallet, ...)  │                              └────────────┘
└──────────────────┘
```

---

## Current Status: core loop is built and verified working

Verified 2026-07-04 by driving a real registration → auto-assignment → LiveKit token exchange → chat → vitals → prescription submit → PDF render → Health Folder → wallet credit flow against a live dev server (real Postgres/Redis/MinIO, workers enabled, no mocks). All 8 steps completed and produced correct DB state. Full 47-test suite passes; all 3 workspaces typecheck clean.

### Done

- [x] Monorepo setup (npm workspaces: `server`, `web`, `api-client`)
- [x] `packages/server` — Express + Socket.io + Prisma + PostgreSQL + BullMQ + Redis
- [x] `packages/web` — Vite + React + TypeScript, all 3 panels (kiosk/doctor/admin)
- [x] Docker compose for Postgres + Redis + LiveKit + MinIO + Caddy
- [x] Patient auth: register (name/dob/phone/PIN), login (phone+PIN), Redis-backed lockout after 5 bad attempts
- [x] Doctor auth: self-register (pending admin approval), login via password + OTP (dev fixed code)
- [x] Admin auth: phone + password
- [x] Database schema: User/PatientProfile/DoctorProfile/CallSession/ChatMessage/Prescription/HealthFile/WalletTransaction
- [x] Consult button → `CallSession` (QUEUED) → BullMQ auto-assignment to an available, approved doctor → RINGING → doctor accept/reject
- [x] LiveKit token issuance to both patient and doctor on call accept; real `@livekit/components-react` video UI both sides
- [x] In-call text chat, bidirectional
- [x] Vitals sharing (weight/height/BP) from kiosk operator to doctor, delivered as a chat message type
- [x] Doctor prescription editor (tiptap) → submit → BullMQ PDF render (`@react-pdf/renderer`) → MinIO upload → `HealthFile` row → wallet commission credit → `CallSession` marked ENDED
- [x] Patient views/prints prescription via presigned MinIO URL + `react-to-print`
- [x] Doctor wallet balance + transaction history + withdrawal request submission
- [x] Admin: doctor approval queue, user list + disable/enable, stats dashboard, call history
- [x] Admin: withdrawal request approval/rejection (added — see below)
- [x] Admin: patient/doctor detail view for support & monitoring (added — see below)
- [x] Integration tests (vitest + supertest) against real DB — 47 tests, no mocking of Prisma
- [x] CI workflow present (`.github/workflows`)

### Known Gaps / Open Items (in priority order)

1. **No real OTP for patients.** Requirement doc says existing patients log in via phone+OTP; the actual implementation is phone+PIN only. OTP exists but is wired only to the doctor login path. Decide: either update the requirement doc to match (PIN is arguably fine for a kiosk with no SMS cost), or add OTP to patient login.
2. **Doctor "availability" is not real presence.** `DoctorProfile.isAvailable` is a plain boolean flipped from 5 different, uncoordinated code paths (assign, reject, end, manual toggle, socket disconnect). No heartbeat/reaper — if a doctor's browser crashes mid-call, the `CallSession` stays ACTIVE forever with no automatic recovery, and the patient is never notified. Needs a stale-call sweep (e.g. a periodic job that ends calls with no doctor heartbeat past N seconds).
3. **In-call image/document sharing has no UI.** The schema (`SendChatSchema` IMAGE variant) and server handler support it; `CallChatPanel.tsx` has no file input or send button for it. Needed per requirement §2.4 ("send documents, send pictures").
4. **Two independent "call end" paths can race.** `call:end` (socket) and the PDF-render worker both set `CallSession.status = ENDED` independently. A doctor navigating away immediately after submitting a prescription leaves a window where the DB is still ACTIVE until the async worker catches up.
5. **Wallet credit is coupled to prescription submission, not consult completion.** If a call ends via `call:end` without a prescription ever being submitted, the doctor earns nothing for that consult — there's no fallback commission path.
6. **Test coverage gap.** BullMQ workers are disabled under `NODE_ENV=test`, so the 47 passing tests validate the REST/auth/CRUD layer only — auto-assignment, the PDF/wallet pipeline, and the entire Socket.IO layer (call/chat/presence) have zero automated coverage. (The manual E2E run above exercises this path but isn't a repeatable test.)
7. **No franchise/multi-center modeling.** All doctors are one flat pool; if the business needs per-center routing or reporting later, this needs a schema addition.

---

## First-Time Setup (after clone or dependency changes)

These two steps are easy to forget and will cause spurious "Cannot find module" typecheck errors — they are not code bugs:

```bash
npm install
npm run build --workspace @madamgy/api-client
cd packages/server && npx prisma generate --schema src/prisma/schema.prisma
```

Then bring up infra and migrate:

```bash
docker compose up -d postgres redis minio livekit
cd packages/server && npx prisma migrate deploy --schema src/prisma/schema.prisma
DATABASE_URL=... ADMIN_PHONE=... ADMIN_PASSWORD=... npx tsx src/prisma/seed.ts
```

---

## Folder Structure (actual)

```
new/
├── docker-compose.yml
├── package.json                  (npm workspace root)
├── packages/
│   ├── server/
│   │   └── src/{routes,socket,services,workers,prisma,middleware,lib,components}
│   ├── web/
│   │   └── src/{pages/{kiosk,doctor,admin},components,hooks,store,lib}
│   └── api-client/
│       └── src/schemas/
└── livekit/livekit.yaml
```

---

## Status Tracking

- [x] Phase 1 — Foundation (auth, schema, monorepo)
- [x] Phase 2 — Consult flow (queue, assignment, chat, vitals)
- [x] Phase 3 — Video (LiveKit integration)
- [x] Phase 4 — Prescriptions (editor, PDF, Health Folder, print)
- [x] Phase 5 — Wallet (balance, transactions, withdrawal request + admin processing)
- [x] Phase 6 — Admin panel (doctors, users, stats, calls, withdrawals, user detail)
- [ ] Phase 7 — Close open items above (presence/reaper, image chat UI, patient OTP decision)
- [ ] Phase 8 — Hosting hardening (production LiveKit TURN/UDP, real MSG91 keys, secrets rotation)
