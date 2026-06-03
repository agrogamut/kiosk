# MadamGy Kiosk App — Design Spec

**Date:** 2026-06-03
**Status:** Approved
**Approach:** Vertical slice — core consultation loop first

---

## Overview

Android-based medical kiosk app. Runs as a PWA in Chrome kiosk mode on a tablet at franchise centers. Patients walk up, register or log in, initiate a video consultation with a doctor at a remote consultation center, receive a prescription that auto-saves as PDF and can be printed directly from the kiosk.

Three panels, role-gated by JWT claim:
- **Patient** — kiosk touchscreen UI (large targets, idle auto-logout)
- **Doctor** — desktop browser dashboard (video + tiptap prescription editor)
- **Admin** — desktop browser management panel

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Monorepo | pnpm workspaces | Already scaffolded |
| Server | Express + Socket.io | Per SPEC.md, no framework overhead |
| ORM | Prisma + PostgreSQL 16 | Type-safe, migrations, Decimal support |
| Real-time | Socket.io v4 | In-call chat, presence, call signaling |
| Video/Audio | LiveKit (self-hosted) | Free, unlimited minutes, SFU |
| PDF | @react-pdf/renderer | React component → PDF, Node.js |
| PDF queue | BullMQ + Redis | Off-loads CPU-bound work off event loop |
| Doctor queue | BullMQ + Redis | Atomic doctor assignment |
| OTP | Redis (getdel) + MSG91 | Atomic consume, 5-min TTL, no DB table |
| File storage | MinIO (self-hosted S3) | Prescriptions, lab reports, chat images |
| UI | React 18 + shadcn/ui + Tailwind | Accessible, kiosk-touch-friendly |
| Prescription editor | tiptap | Headless rich text, outputs JSON |
| Printing | react-to-print + CUPS | Browser print dialog, zero backend |
| State | zustand + @tanstack/react-query | Per SPEC.md |
| Forms | react-hook-form + zod | Shared zod schemas via api-client |
| Charts | recharts | Admin analytics |
| Tables | @tanstack/react-table | Doctor/admin data views |
| Animations | framer-motion | Kiosk screen transitions |
| Proxy | Caddy | Auto HTTPS, Let's Encrypt |
| Hosting | Hetzner CX22 (~$4/mo) | 2vCPU 4GB RAM, all services one VPS |
| CI | GitHub Actions | Build + lint on push |

---

## Packages

```
graveyard-chat/
├── packages/server/        Express + Socket.io + Prisma + BullMQ workers
├── packages/web/           React + Vite — kiosk, doctor, admin UIs
├── packages/api-client/    Shared Zod schemas (exists, expand)
├── livekit/livekit.yaml
└── docker-compose.yml      postgres + redis + livekit + minio + caddy
```

---

## Database Schema (Prisma)

```prisma
model User {
  id           String   @id @default(cuid())
  phone        String   @unique
  name         String
  role         UserRole @default(PATIENT)
  pinHash      String?        // patients only — bcrypt(pin, 12)
  passwordHash String?        // doctors + admins — bcrypt(password, 12)
  disabled     Boolean  @default(false)
  createdAt    DateTime @default(now())

  patientProfile    PatientProfile?
  doctorProfile     DoctorProfile?
  healthFiles       HealthFile[]
  prescriptions     Prescription[]     @relation("patient_prescriptions")
  doctorRx          Prescription[]     @relation("doctor_prescriptions")
  callsAsPatient    CallSession[]      @relation("patient_calls")
  callsAsDoctor     CallSession[]      @relation("doctor_calls")
  walletTxns        WalletTransaction[]
  chatMessages      ChatMessage[]
}

enum UserRole { PATIENT DOCTOR ADMIN }

model PatientProfile {
  id        String    @id @default(cuid())
  userId    String    @unique
  heightCm  Float?
  weightKg  Float?
  bloodType String?
  dob       DateTime? // DOB not age — age changes over time

  user User @relation(fields: [userId], references: [id])
}

model DoctorProfile {
  id             String   @id @default(cuid())
  userId         String   @unique
  degree         String
  regNumber      String   @unique
  specialization String?
  isAvailable    Boolean  @default(false)
  isApproved     Boolean  @default(false)
  approvedAt     DateTime?
  approvedById   String?
  walletBalance  Decimal  @default(0)  @db.Decimal(12,2)
  commissionRate Decimal  @default(0.80) @db.Decimal(4,2)

  user User @relation(fields: [userId], references: [id])

  @@index([isAvailable])
}

model CallSession {
  id          String     @id @default(cuid())
  patientId   String
  doctorId    String?                   // null while status=QUEUED
  status      CallStatus @default(QUEUED)
  livekitRoom String     @unique
  queuedAt    DateTime   @default(now())
  startedAt   DateTime?
  endedAt     DateTime?
  createdAt   DateTime   @default(now())

  patient      User          @relation("patient_calls",  fields: [patientId], references: [id])
  doctor       User?         @relation("doctor_calls",   fields: [doctorId],  references: [id])
  prescription Prescription?
  messages     ChatMessage[]

  @@index([patientId])
  @@index([status])
}

enum CallStatus { QUEUED RINGING ACTIVE ENDED MISSED REJECTED NO_DOCTOR }

model ChatMessage {
  id            String   @id @default(cuid())
  callSessionId String
  senderId      String
  content       String?
  imageKey      String?  // MinIO object key — presigned at request time
  vitals        Json?    // Zod-validated: { weightKg?, heightCm?, bp?, spo2?, temp? }
  type          MsgType  @default(TEXT)
  createdAt     DateTime @default(now())

  callSession CallSession @relation(fields: [callSessionId], references: [id])
  sender      User        @relation(fields: [senderId],      references: [id])

  @@index([callSessionId])
}

enum MsgType { TEXT IMAGE VITALS }

model Prescription {
  id            String   @id @default(cuid())
  callSessionId String   @unique
  patientId     String
  doctorId      String
  content       Json     // tiptap JSON output
  objectKey     String?  // MinIO key — null until render-pdf worker completes
  pdfReady      Boolean  @default(false)
  createdAt     DateTime @default(now())

  callSession CallSession @relation(fields: [callSessionId], references: [id])
  patient     User        @relation("patient_prescriptions", fields: [patientId], references: [id])
  doctor      User        @relation("doctor_prescriptions",  fields: [doctorId],  references: [id])
  healthFile  HealthFile?
}

model HealthFile {
  id             String   @id @default(cuid())
  userId         String
  prescriptionId String?  @unique
  name           String
  type           FileType
  objectKey      String   // MinIO object key — presigned at request time, never stored as URL
  sizeBytes      Int
  createdAt      DateTime @default(now())

  user         User          @relation(fields: [userId],         references: [id])
  prescription Prescription? @relation(fields: [prescriptionId], references: [id])

  @@index([userId, createdAt])
}

enum FileType { PRESCRIPTION LAB_REPORT OTHER }

model WalletTransaction {
  id            String    @id @default(cuid())
  doctorId      String
  callSessionId String?   // audit trail — which call generated this transaction
  amount        Decimal   @db.Decimal(10,2)
  type          TxnType
  status        TxnStatus @default(PENDING)
  description   String?
  createdAt     DateTime  @default(now())

  doctor User @relation(fields: [doctorId], references: [id])

  @@index([doctorId, createdAt])
}

enum TxnType   { CREDIT DEBIT }
enum TxnStatus { PENDING COMPLETED FAILED }
```

**No OtpCode model** — OTPs stored in Redis only.
```
Key:   otp:{phone}
Value: 6-digit code
TTL:   300s (5 minutes)
Consume: redis.getdel(`otp:{phone}`)  // atomic get+delete, prevents replay
```

---

## Auth Flows

### Patient (kiosk)

**Registration:**
1. Input: name, phone, DOB, gender, 4-digit PIN (confirmed twice)
2. Server validates phone unique, PIN format
3. `bcrypt.hash(pin, 12)` → `User.pinHash`
4. Create `User` (role: PATIENT) + `PatientProfile`
5. Return JWT access (15min) + refresh cookie (30d)

**Login:**
1. Enter phone number
2. Server checks Redis `pin_attempts:{phone}` — if ≥ 5: return 429, locked 15min
3. Enter 4-digit PIN on large kiosk keypad
4. `bcrypt.compare(pin, user.pinHash)`
   - Fail → `INCR pin_attempts:{phone}`, set TTL 15min → 401
   - Pass → `DEL pin_attempts:{phone}` → return JWT
5. Kiosk auto-logout after 5min idle (frontend timer)

### Doctor (desktop)

**Registration:**
1. Input: name, phone, password, degree, regNumber, specialization
2. `bcrypt.hash(password, 12)` → `User.passwordHash`
3. Create `User` (role: DOCTOR) + `DoctorProfile` (`isApproved: false`, `isAvailable: false`)
4. Admin notified via socket event
5. Response: "Registration submitted, awaiting admin approval"
6. Doctor cannot log in until `isApproved = true`

**Login (2-step):**
1. POST `/api/auth/doctor/login/initiate` — phone + password
2. Server: `bcrypt.compare` + check `isApproved` (403 if false)
3. Generate 6-digit OTP → `redis.set(otp:{phone}, code, 'EX', 300)` → send SMS via MSG91
4. POST `/api/auth/doctor/login/verify` — phone + OTP
5. `redis.getdel(otp:{phone})` — atomic, prevents replay
6. Mismatch or expired → 401. Match → JWT access + refresh cookie

### Admin (desktop)

**Login:**
1. POST `/api/auth/admin/login` — phone + password
2. `bcrypt.compare` + check `role === ADMIN`
3. Return JWT

**Seed:** One admin created via `pnpm seed` from `ADMIN_PHONE` + `ADMIN_PASSWORD` env vars on first boot.

### JWT Strategy (all roles)

- Access token: 15min, stateless, signed HS256
- Refresh token: 30d, httpOnly cookie
- Middleware checks `user.disabled` on every request even with valid JWT
- Payload: `{ sub: userId, role: UserRole }`

---

## Consultation Flow

### Phase 1 — Queue

1. Patient taps "Consult Doctor" → optionally prefills vitals from `PatientProfile`
2. `POST /api/calls` → server creates `CallSession` (`status: QUEUED`, `livekitRoom: cuid()`)
3. BullMQ job `assign-doctor` added (options: `attempts: 3, backoff: fixed 30s`)
4. Patient sees spinner: "Finding available doctor..."

**BullMQ worker — assign-doctor:**
```typescript
// Atomic doctor claim — prevents race condition
const doctor = await prisma.$transaction(async (tx) => {
  const d = await tx.doctorProfile.findFirst({
    where: { isAvailable: true, isApproved: true },
  });
  if (!d) throw new Error('no_doctor');
  await tx.doctorProfile.update({
    where: { id: d.id, isAvailable: true }, // double-check in update
    data:  { isAvailable: false },
  });
  return d;
});
```
- Found → assign `doctorId`, `status: RINGING`, emit `call:incoming` to doctor socket room
- Not found → job fails, BullMQ retries after 30s
- After 3 failures (90s total) → `status: NO_DOCTOR`, emit `call:no_doctor_available` to patient

### Phase 2 — Video Call

1. Doctor's dashboard shows incoming call (name, photo)
2. Doctor accepts → server generates LiveKit tokens for both users:
   ```typescript
   const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { identity: userId });
   token.addGrant({ room: livekitRoom, roomJoin: true, canPublish: true, canSubscribe: true });
   ```
3. `CallSession.status = ACTIVE`, `startedAt = now()`
4. Socket.io `call:accepted` → both receive their token
5. `<LiveKitRoom token={token}>` from `@livekit/components-react` handles all WebRTC
6. Doctor rejects → socket handler sets `isAvailable = true` for that doctor, adds a new `assign-doctor` BullMQ job with `attempts: 1` (no further retry) to find a different doctor. If none found → `NO_DOCTOR`. The original 3-attempt retry is only for "no doctors available" — not for rejections.

**In-call chat (socket.io, parallel to video):**
- `chat:send` → save `ChatMessage` → broadcast `chat:message` to both
- Text, image (upload to MinIO → `imageKey`), vitals (Zod-validated JSON)

### Phase 3 — Prescription + PDF

1. Doctor writes prescription in tiptap editor (alongside video)
2. Clicks "Submit" → `POST /api/prescriptions`
3. Server saves `Prescription.content` (tiptap JSON), adds BullMQ `render-pdf` job, returns 202

**BullMQ worker — render-pdf:**
1. Load Prescription + Patient + Doctor from DB
2. `@react-pdf/renderer` renders `<PrescriptionDoc>` → Buffer (CPU-bound, off event loop)
3. Upload to MinIO: `prescriptions/{userId}/{callSessionId}.pdf`
4. Update `Prescription.objectKey`, `pdfReady = true`
5. Create `HealthFile` (type: PRESCRIPTION) linked to patient
6. Prisma transaction: `WalletTransaction` CREDIT + update `DoctorProfile.walletBalance` (Decimal)
7. `CallSession.status = ENDED`, `endedAt = now()`
8. `DoctorProfile.isAvailable = true`
9. Emit `prescription:ready` to patient, `call:ended` to both

### Phase 4 — Print

- Patient taps "Print" → frontend calls `GET /api/health-files/:id`
- Server generates presigned MinIO URL (1hr TTL) — never stored in DB
- `react-to-print` triggers browser print dialog → CUPS → kiosk thermal/laser printer
- No custom printer driver, no backend printing code

---

## Socket.io Events

### Client → Server

| Event | Payload |
|---|---|
| `call:accept` | `{ callSessionId }` |
| `call:reject` | `{ callSessionId }` |
| `call:end` | `{ callSessionId }` |
| `chat:send` | `{ callSessionId, content?, imageKey?, vitals?, type }` |
| `doctor:toggle_available` | `{ isAvailable }` |
| `presence:ping` | (heartbeat every 30s) |

### Server → Client

| Event | Payload |
|---|---|
| `call:incoming` | `{ callSession, patient }` |
| `call:accepted` | `{ callSessionId, livekitToken }` |
| `call:rejected` | `{ callSessionId }` |
| `call:ended` | `{ callSessionId }` |
| `call:no_doctor_available` | `{ callSessionId }` |
| `chat:message` | `ChatMessage` object |
| `prescription:ready` | `{ callSessionId, healthFileId }` |
| `doctor:new_registration` | `{ doctorId, name }` (admin only) |

---

## API Routes

### Auth
```
POST /api/auth/patient/register
POST /api/auth/patient/login
POST /api/auth/doctor/register
POST /api/auth/doctor/login/initiate    (phone + password → sends OTP)
POST /api/auth/doctor/login/verify      (phone + OTP → JWT)
POST /api/auth/admin/login
POST /api/auth/refresh
POST /api/auth/logout
```

### Users
```
GET  /api/users/me
PUT  /api/users/me                      (update PatientProfile vitals)
```

### Calls
```
POST /api/calls                         (patient initiates)
GET  /api/calls/history                 (paginated)
```

### Prescriptions
```
POST /api/prescriptions                 (doctor submits)
GET  /api/prescriptions/:id
```

### Health Files
```
GET  /api/health-files                  (patient's folder, returns presigned URLs)
POST /api/health-files                  (upload lab report)
DELETE /api/health-files/:id
```

### Admin
```
GET  /api/admin/doctors                 (pending approval list)
PUT  /api/admin/doctors/:id/approve
PUT  /api/admin/users/:id/disable
GET  /api/admin/stats
GET  /api/admin/calls                   (all call history)
```

### Doctor
```
GET  /api/doctor/wallet
GET  /api/doctor/wallet/transactions    (paginated)
POST /api/doctor/wallet/withdraw        (request withdrawal)
```

---

## Folder Structure

### `packages/server/src/`

```
routes/
  auth.routes.ts
  calls.routes.ts
  prescriptions.routes.ts
  health-files.routes.ts
  users.routes.ts
  admin.routes.ts
  doctor.routes.ts
socket/
  call.handler.ts         (accept/reject/end + doctor availability)
  chat.handler.ts         (in-call messages)
  presence.handler.ts     (heartbeat, online tracking)
services/
  auth.service.ts         (← port from old/HealingGmautServer/src/auth)
  otp.service.ts          (← port from old/HealingGmautServer/src/utils/sms.utils)
  call-queue.service.ts   (BullMQ assign-doctor worker)
  pdf.service.ts          (BullMQ render-pdf worker)
  livekit.service.ts      (token generation)
  storage.service.ts      (MinIO presign, upload, delete)
  wallet.service.ts       (← port from old/HealingGmautServer/src/wallets)
prisma/
  schema.prisma
  seed.ts                 (creates admin user from .env)
middleware/
  auth.middleware.ts      (JWT verify + disabled check)
  error.middleware.ts     (centralised error handler)
index.ts
```

### `packages/web/src/`

```
pages/
  kiosk/                  (patient — large touch targets)
    Home.tsx              (fullscreen landing: Register / Login)
    Register.tsx
    Login.tsx             (phone + PIN keypad)
    Dashboard.tsx         (health folder — list HealthFiles)
    Consult.tsx           (waiting room + LiveKit video + in-call chat)
    Prescription.tsx      (view + print)
  doctor/
    Dashboard.tsx         (availability toggle + incoming calls)
    Call.tsx              (LiveKit video + tiptap editor + chat)
    Wallet.tsx
    History.tsx
  admin/
    Dashboard.tsx
    Doctors.tsx           (approval queue)
    Users.tsx
    Stats.tsx
components/
  kiosk/
    NumPad.tsx            (large PIN keypad)
    VitalsForm.tsx
    IdleGuard.tsx         (5min idle → auto logout)
  video/
    KioskCallView.tsx     (patient side — minimal controls)
    DoctorCallView.tsx    (split: video + editor)
  prescription/
    PrescriptionDoc.tsx   (@react-pdf/renderer document)
    PrescriptionViewer.tsx
    PrintButton.tsx       (react-to-print)
store/
  auth.store.ts           (zustand)
  call.store.ts
hooks/
  useSocket.ts
  useCall.ts
```

---

## Infrastructure (Docker Compose)

```yaml
services:
  postgres:
    image: postgres:16
    volumes: [pgdata:/var/lib/postgresql/data]

  redis:
    image: redis:7-alpine

  livekit:
    image: livekit/livekit-server:latest
    ports: ["7880:7880", "7881:7881", "40000-49999:40000-49999/udp"]
    volumes: [./livekit/livekit.yaml:/etc/livekit.yaml]

  minio:
    image: minio/minio
    command: server /data --console-address :9001
    ports: ["9000:9000", "9001:9001"]
    volumes: [minidata:/data]

  api:
    build: ./packages/server
    depends_on: [postgres, redis, livekit, minio]
    env_file: .env

  web:
    build: ./packages/web

  caddy:
    image: caddy:2
    ports: ["80:80", "443:443"]
    volumes: [./Caddyfile:/etc/caddy/Caddyfile]
```

**VPS:** Hetzner CX22 — 2vCPU, 4GB RAM, 40GB SSD, ~$4/mo.
Upgrade to CX32 ($7/mo) if concurrent video calls exceed 5.

---

## Build Phases (Vertical Slice)

### Week 1 — Server + DB + Auth
- Docker Compose up (postgres, redis, livekit, minio)
- Prisma schema + migrations + seed
- All auth routes (patient PIN, doctor 2-step, admin)
- JWT middleware + disabled check
- `packages/web` scaffold + routing + auth pages

### Week 2 — Consultation + Video
- `POST /api/calls` + BullMQ assign-doctor worker (atomic)
- LiveKit token generation service
- Socket.io call handlers (accept/reject/end)
- Queue timeout → NO_DOCTOR flow
- In-call chat (text + image + vitals)
- Kiosk Consult page + Doctor Call page with `@livekit/components-react`

### Week 3 — Prescription + PDF + Print
- tiptap editor in doctor call view
- `POST /api/prescriptions` + BullMQ render-pdf worker
- `@react-pdf/renderer` PrescriptionDoc component
- MinIO upload + HealthFile creation
- Doctor wallet credit (atomic Prisma tx, Decimal)
- Patient prescription view + `react-to-print`
- Kiosk health folder (Dashboard.tsx)

### Week 4 — Admin + Doctor Wallet
- Admin approval workflow
- Admin stats + user management
- Doctor wallet page + withdrawal request

### Week 5 — Hosting + CI
- Dockerize server + web
- Caddy + HTTPS
- GitHub Actions build + lint
- Deploy to Hetzner

---

## Ports to Reuse from `old/HealingGmautServer`

| Old module | New file | What to port |
|---|---|---|
| `src/auth/auth.service.ts` | `services/auth.service.ts` | OTP send logic, JWT signing pattern |
| `src/utils/sms.utils.ts` | `services/otp.service.ts` | MSG91 integration |
| `src/wallets/wallets.service.ts` | `services/wallet.service.ts` | Balance update, transaction creation |
| `src/appointment-calls/` | `socket/call.handler.ts` | callStarted/callEnded patterns |
| `src/prescription/` | `services/pdf.service.ts` | Prescription data model logic |
| `src/e-locker/` | routes + storage service | File CRUD patterns |
| `src/bank-account/` | `routes/doctor.routes.ts` | Bank account model for withdrawals |

---

## Environment Variables

```env
# Server
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://user:pass@localhost:5432/madamgy
REDIS_URL=redis://localhost:6379

JWT_ACCESS_SECRET=<64-char random>
JWT_REFRESH_SECRET=<64-char random>
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=30d

LIVEKIT_HOST=wss://your-domain.com
LIVEKIT_API_KEY=<from livekit.yaml>
LIVEKIT_API_SECRET=<from livekit.yaml>

MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=<key>
MINIO_SECRET_KEY=<secret>
MINIO_BUCKET=madamgy

MSG91_AUTH_KEY=<key>
MSG91_SENDER_ID=MADAMG
MSG91_TEMPLATE_ID=<otp template id>

CONSULTATION_FEE=200        # INR per consultation
ADMIN_PHONE=<phone>
ADMIN_PASSWORD=<password>

# Web (Vite)
VITE_API_URL=https://your-domain.com/api
VITE_SOCKET_URL=https://your-domain.com
VITE_LIVEKIT_URL=wss://your-domain.com
```

---

## Security Notes

- PIN brute force: Redis lockout after 5 attempts, 15min TTL (`pin_attempts:{phone}`)
- OTP replay: `redis.getdel` atomic consume — code deleted on first use
- Doctor approval gate: `isApproved` checked at login, not just registration
- Disabled user: checked on every request in JWT middleware even with valid token
- MinIO URLs: never stored — generated presigned (1hr TTL) per request
- Money: all stored as `Decimal @db.Decimal` — no Float anywhere
- Doctor availability: claimed inside Prisma transaction — no race condition
- PDF generation: BullMQ worker — never blocks Express event loop
