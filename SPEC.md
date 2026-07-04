# Language & Technology Spec Sheet

## Project: MadamGy Kiosk

Android kiosk-based telemedicine platform. Three panels — Patient (kiosk), Doctor, Admin — built around instant video consultation, PDF prescriptions, and a Health Folder per patient. See `MadamGy Kiosk App – Requirement Sheet.docx` at repo root for the source requirements.

---

## Language Choices

| Layer          | Language      | Reason                                                      |
|----------------|---------------|-------------------------------------------------------------|
| Backend        | TypeScript    | Type safety, matches frontend, large ecosystem              |
| Web frontend   | TypeScript    | Catches prop/API mismatches at compile time; also serves as the kiosk UI (loaded in Android WebView/Chrome kiosk mode) |
| Config/Infra   | YAML / Shell  | Docker compose, LiveKit config, CI scripts                  |
| Database DSL   | Prisma Schema | Co-located with migrations, auto-generates TS types         |

Runtime: **Node.js 20 LTS**
Package manager: **npm workspaces** (monorepo root `package.json`)

There is no native mobile app in this repo. The Android kiosk device runs the web app (`packages/web`) in kiosk/WebView mode.

---

## Backend — `packages/server`

### Core

| Library              | Purpose                                    |
|----------------------|--------------------------------------------|
| `express`            | HTTP server, routing                       |
| `socket.io`          | Real-time bidirectional events (call/chat/presence) |
| `prisma` / `@prisma/client` | ORM + migrations, generated client   |
| `bullmq` + `ioredis`  | Job queues: doctor auto-assignment, PDF rendering |
| `typescript` / `tsx` | Type checking / dev execution              |

### Auth

| Library              | Purpose                                    |
|----------------------|---------------------------------------------|
| `jsonwebtoken`       | JWT access + refresh token signing         |
| `bcryptjs`           | PIN (patient) / password (doctor, admin) hashing |
| `zod`                | Request body validation, shared with frontend via `@madamgy/api-client` |

Patients authenticate with **phone + 4-digit PIN** (no OTP — despite the requirement doc mentioning OTP for existing patients, the implementation is PIN-only; see PLAN.md open items). Doctors authenticate with **phone + password + OTP** (dev OTP code is fixed at `000000` outside `NODE_ENV=production`). Admin authenticates with phone + password.

### Media / Storage

| Library                    | Purpose                              |
|----------------------------|---------------------------------------|
| `livekit-server-sdk`       | LiveKit access token generation for video calls |
| `minio`                    | S3-compatible object storage for prescription PDFs and lab report uploads |
| `@react-pdf/renderer`      | Server-side PDF rendering of doctor's prescription |

### Dev Tools

| Library              | Purpose                                    |
|----------------------|---------------------------------------------|
| `vitest` + `supertest` | Integration tests against a real Postgres/Redis (no mocking) |

---

## Web Frontend — `packages/web`

### Core

| Library                  | Purpose                                       |
|--------------------------|-----------------------------------------------|
| `react` / `react-dom`    | UI rendering                                  |
| `vite`                   | Build tool / dev server                       |
| `typescript`             | Type checking                                 |

### Routing & State

| Library                  | Purpose                                       |
|--------------------------|-----------------------------------------------|
| `react-router-dom`       | Client-side routing, role-gated routes (`RequireRole`) |
| `zustand`                | Auth state                                    |
| `@tanstack/react-query`  | Server state, caching, mutations              |

### Real-time & Calls

| Library                    | Purpose                                     |
|----------------------------|-----------------------------------------------|
| `socket.io-client`         | WebSocket connection to server (call/chat/presence events) |
| `@livekit/components-react` / `livekit-client` | Video/audio call UI + WebRTC SDK  |

### UI

| Library                    | Purpose                                     |
|----------------------------|-----------------------------------------------|
| `tailwindcss`              | Utility-first CSS                           |
| `@tiptap/react` + starter-kit | Rich text prescription editor            |
| `react-to-print`           | Kiosk printer integration for prescriptions |
| `react-hook-form` + `@hookform/resolvers` | Form validation against shared zod schemas |
| `lucide-react`, `react-hot-toast`, `date-fns`, `recharts` | Icons, toasts, dates, admin stat charts |

---

## Shared Package — `packages/api-client`

Zod schemas + inferred TypeScript types for every request/response and socket payload, imported by both `server` and `web`. Must be built (`npm run build --workspace @madamgy/api-client`) before `server`/`web` typecheck or run, since they import its compiled `dist/`. **This build step is easy to forget after a fresh clone or dependency change** — if you see `Cannot find module '@madamgy/api-client'`, rebuild it and re-run `prisma generate` (see PLAN.md "First-time setup").

---

## Infrastructure

### Self-hosted Services (docker-compose.yml)

| Service           | Purpose                               |
|-------------------|----------------------------------------|
| PostgreSQL 16     | Primary database                       |
| Redis 7           | BullMQ queues, OTP storage, PIN lockout counters |
| LiveKit Server    | WebRTC SFU for video calls             |
| MinIO             | Object storage for PDFs / lab reports  |
| Caddy             | Reverse proxy + HTTPS (production)     |

### Ports

| Port Range       | Protocol | Service                         |
|------------------|----------|---------------------------------|
| 80, 443          | TCP      | Caddy (HTTP + HTTPS)            |
| 7880 / 7881      | TCP      | LiveKit HTTP/gRPC + RTC fallback |
| 40000–49999      | UDP      | LiveKit WebRTC media streams    |
| 55432, 56379, 19000/19001 | TCP | Local dev: Postgres, Redis, MinIO (mapped off default ports to avoid clashes) |

---

## Data Model (Prisma, actual schema)

Enums: `UserRole` (PATIENT/DOCTOR/ADMIN), `CallStatus` (QUEUED/RINGING/ACTIVE/ENDED/MISSED/REJECTED/NO_DOCTOR), `MsgType` (TEXT/IMAGE/VITALS), `FileType` (PRESCRIPTION/LAB_REPORT/OTHER), `TxnType` (CREDIT/DEBIT), `TxnStatus` (PENDING/COMPLETED/FAILED).

Models: `User`, `PatientProfile`, `DoctorProfile` (includes `isAvailable`, `isApproved`, `walletBalance`, `commissionRate`), `CallSession`, `ChatMessage`, `Prescription`, `HealthFile`, `WalletTransaction`.

See `packages/server/src/prisma/schema.prisma` for the source of truth — do not hand-copy this section elsewhere, it will drift.

---

## REST API (actual routes)

```
POST /api/auth/patient/register     { phone, name, dob, pin }
POST /api/auth/patient/login        { phone, pin }
POST /api/auth/doctor/register      { phone, name, password, degree, regNumber, specialization? }
POST /api/auth/doctor/login/initiate { phone, password }
POST /api/auth/doctor/login/verify  { phone, otp }
POST /api/auth/admin/login          { phone, password }
POST /api/auth/refresh
POST /api/auth/logout

GET  /api/calls/history
POST /api/calls                     (patient creates a call, triggers auto-assignment)

POST /api/prescriptions             { callSessionId, content }  (doctor only)
GET  /api/prescriptions/:id

GET  /api/health-files/:id

GET  /api/doctor/wallet
GET  /api/doctor/wallet/transactions
POST /api/doctor/wallet/withdraw    { amount, bankName, accountNumber, ifsc, holderName }

GET  /api/admin/doctors
PUT  /api/admin/doctors/:id/approve
GET  /api/admin/users
PUT  /api/admin/users/:id/disable
GET  /api/admin/users/:id           (patient/doctor detail: profile, health files, prescriptions, call history)
GET  /api/admin/stats
GET  /api/admin/calls
GET  /api/admin/wallet/withdrawals            (pending withdrawal requests)
PUT  /api/admin/wallet/withdrawals/:id/complete
PUT  /api/admin/wallet/withdrawals/:id/reject
```

## Socket.IO Events (actual)

### Client → Server
| Event                     | Payload                                     |
|----------------------------|---------------------------------------------|
| `call:accept`             | `{ callSessionId }`                          |
| `call:reject`             | `{ callSessionId }`                          |
| `call:end`                | `{ callSessionId }`                          |
| `doctor:toggle_available` | `{ isAvailable }`                             |
| `chat:send`               | `{ type: "TEXT", callSessionId, content }` \| `{ type: "IMAGE", callSessionId, imageKey }` \| `{ type: "VITALS", callSessionId, vitals }` |
| `presence:ping`           | (stub — echoes `presence:pong`, not wired to real presence) |

### Server → Client
| Event                       | Payload                              |
|------------------------------|---------------------------------------|
| `call:ringing`               | `{ callSession }` (to patient)        |
| `call:incoming`              | `{ callSession, patient }` (to doctor) |
| `call:accepted`              | `{ callSessionId, livekitToken }`      |
| `call:rejected`               | `{ callSessionId }`                   |
| `call:ended`                  | `{ callSessionId }`                   |
| `call:no_doctor_available`   | `{ callSessionId }`                    |
| `chat:message`                | `ChatMessage` object                  |
| `doctor:approved`              | (to newly approved doctor)            |
| `doctor:new_registration`     | (to admins room)                      |
| `prescription:ready`          | (emitted alongside `call:ended` once PDF is rendered) |

Note: doctor "availability" (`DoctorProfile.isAvailable`) is a plain boolean mutated from four different code paths (assignment, reject, end, manual toggle, disconnect) — there is no real presence/heartbeat system. A doctor's crashed tab does not clean up an in-progress `CallSession`. See PLAN.md open items.

---

## Environment Variables

See `.env.example` at repo root — kept up to date there, not duplicated here.

---

## Coding Conventions

- All async functions use `async/await`, no `.then()` chains
- Errors thrown from route handlers are caught by a single Express error middleware
- All DB queries go through `prisma` — no raw SQL
- Zod validates all inputs at the boundary (routes + socket events), schemas live in `@madamgy/api-client` and are shared
- File naming: `kebab-case.ts` everywhere; components: `PascalCase.tsx`

---

## Known Scope Gaps (see PLAN.md for detail)

- No real OTP for patient login (PIN only)
- In-call image/document sharing has server + schema support but no client UI
- Doctor availability is not real presence — no reaper for crashed/disconnected doctor sessions mid-call
- Wallet commission credit fires only on prescription submission, not on call completion generally
- No franchise/multi-center modeling (single flat doctor pool)
