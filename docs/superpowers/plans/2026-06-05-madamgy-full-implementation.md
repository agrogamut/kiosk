# MadamGy Kiosk App — Full Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-ready Android PWA kiosk + doctor dashboard + admin panel for telemedicine consultations with video, prescription PDF, and doctor wallet.

**Architecture:** Express + Socket.io server in `packages/server`, React 18 SPA in `packages/web`, shared Zod schemas in `packages/api-client`. BullMQ workers handle atomic doctor assignment and CPU-bound PDF rendering off the event loop. LiveKit SFU handles WebRTC. MinIO stores files server-side; presigned URLs expose them to clients.

**Tech Stack:** Express 4, Socket.io 4, Prisma 5 + PostgreSQL 16, BullMQ + Redis 7, LiveKit SDK, @react-pdf/renderer, MinIO (`minio` npm), React 18, Vite 5, shadcn/ui, Tailwind 3, tiptap, zustand, @tanstack/react-query, react-to-print, framer-motion, vitest + supertest.

**All commands run from `new/` unless stated otherwise.**

---

## File Map

### Created (server)
- `packages/server/package.json`
- `packages/server/tsconfig.json`
- `packages/server/src/index.ts` — Express + Socket.io bootstrap
- `packages/server/src/types/express.d.ts` — req.user augmentation
- `packages/server/src/prisma/schema.prisma`
- `packages/server/src/prisma/seed.ts`
- `packages/server/src/middleware/auth.middleware.ts`
- `packages/server/src/middleware/error.middleware.ts`
- `packages/server/src/services/auth.service.ts`
- `packages/server/src/services/otp.service.ts`
- `packages/server/src/services/livekit.service.ts`
- `packages/server/src/services/storage.service.ts`
- `packages/server/src/services/wallet.service.ts`
- `packages/server/src/workers/assign-doctor.worker.ts`
- `packages/server/src/workers/render-pdf.worker.ts`
- `packages/server/src/socket/index.ts`
- `packages/server/src/socket/call.handler.ts`
- `packages/server/src/socket/chat.handler.ts`
- `packages/server/src/socket/presence.handler.ts`
- `packages/server/src/routes/auth.routes.ts`
- `packages/server/src/routes/users.routes.ts`
- `packages/server/src/routes/calls.routes.ts`
- `packages/server/src/routes/prescriptions.routes.ts`
- `packages/server/src/routes/health-files.routes.ts`
- `packages/server/src/routes/admin.routes.ts`
- `packages/server/src/routes/doctor.routes.ts`
- `packages/server/src/__tests__/auth.test.ts`
- `packages/server/src/__tests__/calls.test.ts`
- `packages/server/src/__tests__/prescriptions.test.ts`

### Created (web)
- `packages/web/package.json`
- `packages/web/tsconfig.json`
- `packages/web/vite.config.ts`
- `packages/web/index.html`
- `packages/web/tailwind.config.ts`
- `packages/web/postcss.config.js`
- `packages/web/src/main.tsx`
- `packages/web/src/App.tsx` — router + role guards
- `packages/web/src/lib/api.ts` — axios instance + interceptors
- `packages/web/src/lib/queryClient.ts`
- `packages/web/src/lib/socket.ts` — socket.io-client singleton
- `packages/web/src/store/auth.store.ts`
- `packages/web/src/store/call.store.ts`
- `packages/web/src/hooks/useSocket.ts`
- `packages/web/src/hooks/useCall.ts`
- `packages/web/src/hooks/useIdleTimer.ts`
- `packages/web/src/components/kiosk/NumPad.tsx`
- `packages/web/src/components/kiosk/VitalsForm.tsx`
- `packages/web/src/components/kiosk/IdleGuard.tsx`
- `packages/web/src/components/video/KioskCallView.tsx`
- `packages/web/src/components/video/DoctorCallView.tsx`
- `packages/web/src/components/prescription/PrescriptionDoc.tsx`
- `packages/web/src/components/prescription/PrescriptionViewer.tsx`
- `packages/web/src/components/prescription/PrintButton.tsx`
- `packages/web/src/pages/kiosk/Home.tsx`
- `packages/web/src/pages/kiosk/Register.tsx`
- `packages/web/src/pages/kiosk/Login.tsx`
- `packages/web/src/pages/kiosk/Dashboard.tsx`
- `packages/web/src/pages/kiosk/Consult.tsx`
- `packages/web/src/pages/kiosk/Prescription.tsx`
- `packages/web/src/pages/doctor/Dashboard.tsx`
- `packages/web/src/pages/doctor/Call.tsx`
- `packages/web/src/pages/doctor/Wallet.tsx`
- `packages/web/src/pages/doctor/History.tsx`
- `packages/web/src/pages/admin/Dashboard.tsx`
- `packages/web/src/pages/admin/Doctors.tsx`
- `packages/web/src/pages/admin/Users.tsx`
- `packages/web/src/pages/admin/Stats.tsx`

### Modified (api-client)
- `packages/api-client/src/schemas/user.schema.ts` — rewrite to match Prisma model
- `packages/api-client/src/schemas/call.schema.ts` — new
- `packages/api-client/src/schemas/prescription.schema.ts` — new
- `packages/api-client/src/schemas/health-file.schema.ts` — new
- `packages/api-client/src/schemas/chat.schema.ts` — new
- `packages/api-client/src/schemas/wallet.schema.ts` — new
- `packages/api-client/src/index.ts` — barrel export

### Created (infra)
- `docker-compose.yml`
- `livekit/livekit.yaml`
- `.env.example` — full replacement
- `.env` — local dev (not committed)
- `Caddyfile`
- `.github/workflows/ci.yml`

---

## Phase 1 — Foundation (DB + Auth)

### Task 1: Docker Compose + infra boot

**Files:**
- Create: `docker-compose.yml`
- Create: `livekit/livekit.yaml`
- Create: `.env.example`
- Create: `.env` (local, gitignored)

- [ ] **Step 1: Write docker-compose.yml**

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: madamgy
      POSTGRES_PASSWORD: madamgy
      POSTGRES_DB: madamgy
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  livekit:
    image: livekit/livekit-server:latest
    ports:
      - "7880:7880"
      - "7881:7881"
      - "40000-49999:40000-49999/udp"
    volumes:
      - ./livekit/livekit.yaml:/etc/livekit.yaml
    command: --config /etc/livekit.yaml

  minio:
    image: minio/minio
    command: server /data --console-address :9001
    environment:
      MINIO_ROOT_USER: madamgy
      MINIO_ROOT_PASSWORD: madamgy123
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minidata:/data

volumes:
  pgdata:
  minidata:
```

- [ ] **Step 2: Write livekit/livekit.yaml**

```yaml
# livekit/livekit.yaml
port: 7880
rtc:
  tcp_port: 7881
  port_range_start: 40000
  port_range_end: 49999
  use_external_ip: false
keys:
  devkey: devsecret
logging:
  level: warn
```

- [ ] **Step 3: Write .env.example**

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://madamgy:madamgy@localhost:5432/madamgy

REDIS_URL=redis://localhost:6379

JWT_ACCESS_SECRET=replace-with-64-char-random-string-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
JWT_REFRESH_SECRET=replace-with-64-char-random-string-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=30d

LIVEKIT_HOST=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=devsecret

MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=madamgy
MINIO_SECRET_KEY=madamgy123
MINIO_BUCKET=madamgy
MINIO_USE_SSL=false

MSG91_AUTH_KEY=your-msg91-auth-key
MSG91_SENDER_ID=MADAMG
MSG91_TEMPLATE_ID=your-otp-template-id

CONSULTATION_FEE=200
ADMIN_PHONE=9000000000
ADMIN_PASSWORD=admin123

VITE_API_URL=http://localhost:3000/api
VITE_SOCKET_URL=http://localhost:3000
VITE_LIVEKIT_URL=ws://localhost:7880
```

- [ ] **Step 4: Copy .env.example to .env for local dev**

```bash
cp .env.example .env
```

- [ ] **Step 5: Ensure .gitignore excludes .env**

Open `.gitignore`, confirm `.env` is present (not `.env.example`).

- [ ] **Step 6: Start infra**

```bash
docker compose up -d postgres redis minio livekit
```

Expected: all 4 containers up. Verify:
```bash
docker compose ps
```
Expected: `postgres`, `redis`, `minio`, `livekit` all show `running`.

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml livekit/ .env.example .gitignore
git commit -m "infra: add docker-compose with postgres, redis, minio, livekit"
```

---

### Task 2: packages/server scaffold

**Files:**
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `packages/server/src/index.ts`
- Create: `packages/server/src/types/express.d.ts`
- Create: `packages/server/src/middleware/error.middleware.ts`

- [ ] **Step 1: Write packages/server/package.json**

```json
{
  "name": "@madamgy/server",
  "version": "0.0.1",
  "private": true,
  "type": "commonjs",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "prisma generate --schema src/prisma/schema.prisma",
    "db:migrate": "prisma migrate dev --schema src/prisma/schema.prisma",
    "db:migrate:deploy": "prisma migrate deploy --schema src/prisma/schema.prisma",
    "db:seed": "tsx src/prisma/seed.ts",
    "db:studio": "prisma studio --schema src/prisma/schema.prisma"
  },
  "dependencies": {
    "@prisma/client": "^5.14.0",
    "@react-pdf/renderer": "^3.4.0",
    "axios": "^1.7.0",
    "bcryptjs": "^2.4.3",
    "bullmq": "^5.12.0",
    "cookie-parser": "^1.4.6",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "ioredis": "^5.3.2",
    "jsonwebtoken": "^9.0.2",
    "livekit-server-sdk": "^2.6.0",
    "minio": "^8.0.1",
    "morgan": "^1.10.0",
    "react": "^18.3.1",
    "socket.io": "^4.7.5",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/cookie-parser": "^1.4.7",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.6",
    "@types/morgan": "^1.9.9",
    "@types/node": "^20.14.0",
    "@types/supertest": "^6.0.2",
    "express": "^4.19.2",
    "prisma": "^5.14.0",
    "supertest": "^7.0.0",
    "tsx": "^4.15.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Write packages/server/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "outDir": "./dist",
    "rootDir": "./src",
    "lib": ["ES2022"],
    "types": ["node"]
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Write src/types/express.d.ts**

```typescript
// packages/server/src/types/express.d.ts
import { UserRole } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: {
        sub: string;
        role: UserRole;
      };
    }
  }
}
```

- [ ] **Step 4: Write src/middleware/error.middleware.ts**

```typescript
// packages/server/src/middleware/error.middleware.ts
import { NextFunction, Request, Response } from "express";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export function errorMiddleware(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ message: err.message });
  }
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
}
```

- [ ] **Step 5: Write src/index.ts (skeleton — routes added per phase)**

```typescript
// packages/server/src/index.ts
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { createServer } from "http";
import morgan from "morgan";
import { Server } from "socket.io";
import { errorMiddleware } from "./middleware/error.middleware";

export const app = express();
export const httpServer = createServer(app);
export const io = new Server(httpServer, {
  cors: { origin: process.env.WEB_URL || "*", credentials: true },
});

app.use(helmet());
app.use(cors({ origin: process.env.WEB_URL || "*", credentials: true }));
app.use(express.json());
app.use(cookieParser());
if (process.env.NODE_ENV !== "test") app.use(morgan("dev"));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use(errorMiddleware);

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== "test") {
  httpServer.listen(PORT, () => console.log(`Server on :${PORT}`));
}
```

- [ ] **Step 6: Install server dependencies**

```bash
cd packages/server && pnpm install
```

Expected: no errors, `node_modules` created.

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd packages/server && pnpm typecheck 2>&1 | head -20
```

Expected: no errors (add `"typecheck": "tsc --noEmit"` to scripts if missing).

- [ ] **Step 8: Commit**

```bash
git add packages/server/
git commit -m "feat: scaffold packages/server with express + socket.io"
```

---

### Task 3: Prisma schema + migrations

**Files:**
- Create: `packages/server/src/prisma/schema.prisma`

- [ ] **Step 1: Write schema.prisma**

```prisma
// packages/server/src/prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserRole {
  PATIENT
  DOCTOR
  ADMIN
}

enum CallStatus {
  QUEUED
  RINGING
  ACTIVE
  ENDED
  MISSED
  REJECTED
  NO_DOCTOR
}

enum MsgType {
  TEXT
  IMAGE
  VITALS
}

enum FileType {
  PRESCRIPTION
  LAB_REPORT
  OTHER
}

enum TxnType {
  CREDIT
  DEBIT
}

enum TxnStatus {
  PENDING
  COMPLETED
  FAILED
}

model User {
  id           String   @id @default(cuid())
  phone        String   @unique
  name         String
  role         UserRole @default(PATIENT)
  pinHash      String?
  passwordHash String?
  disabled     Boolean  @default(false)
  createdAt    DateTime @default(now())

  patientProfile PatientProfile?
  doctorProfile  DoctorProfile?
  healthFiles    HealthFile[]
  prescriptions  Prescription[]      @relation("patient_prescriptions")
  doctorRx       Prescription[]      @relation("doctor_prescriptions")
  callsAsPatient CallSession[]       @relation("patient_calls")
  callsAsDoctor  CallSession[]       @relation("doctor_calls")
  walletTxns     WalletTransaction[]
  chatMessages   ChatMessage[]
}

model PatientProfile {
  id        String    @id @default(cuid())
  userId    String    @unique
  heightCm  Float?
  weightKg  Float?
  bloodType String?
  dob       DateTime?

  user User @relation(fields: [userId], references: [id])
}

model DoctorProfile {
  id             String    @id @default(cuid())
  userId         String    @unique
  degree         String
  regNumber      String    @unique
  specialization String?
  isAvailable    Boolean   @default(false)
  isApproved     Boolean   @default(false)
  approvedAt     DateTime?
  approvedById   String?
  walletBalance  Decimal   @default(0) @db.Decimal(12, 2)
  commissionRate Decimal   @default(0.80) @db.Decimal(4, 2)

  user User @relation(fields: [userId], references: [id])

  @@index([isAvailable])
}

model CallSession {
  id          String     @id @default(cuid())
  patientId   String
  doctorId    String?
  status      CallStatus @default(QUEUED)
  livekitRoom String     @unique
  queuedAt    DateTime   @default(now())
  startedAt   DateTime?
  endedAt     DateTime?
  createdAt   DateTime   @default(now())

  patient      User          @relation("patient_calls", fields: [patientId], references: [id])
  doctor       User?         @relation("doctor_calls", fields: [doctorId], references: [id])
  prescription Prescription?
  messages     ChatMessage[]

  @@index([patientId])
  @@index([status])
}

model ChatMessage {
  id            String   @id @default(cuid())
  callSessionId String
  senderId      String
  content       String?
  imageKey      String?
  vitals        Json?
  type          MsgType  @default(TEXT)
  createdAt     DateTime @default(now())

  callSession CallSession @relation(fields: [callSessionId], references: [id])
  sender      User        @relation(fields: [senderId], references: [id])

  @@index([callSessionId])
}

model Prescription {
  id            String   @id @default(cuid())
  callSessionId String   @unique
  patientId     String
  doctorId      String
  content       Json
  objectKey     String?
  pdfReady      Boolean  @default(false)
  createdAt     DateTime @default(now())

  callSession CallSession @relation(fields: [callSessionId], references: [id])
  patient     User        @relation("patient_prescriptions", fields: [patientId], references: [id])
  doctor      User        @relation("doctor_prescriptions", fields: [doctorId], references: [id])
  healthFile  HealthFile?
}

model HealthFile {
  id             String   @id @default(cuid())
  userId         String
  prescriptionId String?  @unique
  name           String
  type           FileType
  objectKey      String
  sizeBytes      Int
  createdAt      DateTime @default(now())

  user         User          @relation(fields: [userId], references: [id])
  prescription Prescription? @relation(fields: [prescriptionId], references: [id])

  @@index([userId, createdAt])
}

model WalletTransaction {
  id            String    @id @default(cuid())
  doctorId      String
  callSessionId String?
  amount        Decimal   @db.Decimal(10, 2)
  type          TxnType
  status        TxnStatus @default(PENDING)
  description   String?
  createdAt     DateTime  @default(now())

  doctor User @relation(fields: [doctorId], references: [id])

  @@index([doctorId, createdAt])
}
```

- [ ] **Step 2: Generate Prisma client**

```bash
cd packages/server && pnpm db:generate
```

Expected: `Generated Prisma Client` message, `node_modules/.prisma/client` created.

- [ ] **Step 3: Run first migration**

```bash
cd packages/server && pnpm db:migrate
```

Prompt: enter migration name `init`. Expected: `Your database is now in sync with your schema.`

- [ ] **Step 4: Verify tables exist**

```bash
docker compose exec postgres psql -U madamgy -d madamgy -c "\dt"
```

Expected: lists `User`, `DoctorProfile`, `PatientProfile`, `CallSession`, `ChatMessage`, `Prescription`, `HealthFile`, `WalletTransaction`.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/prisma/
git commit -m "feat: add prisma schema with all models + first migration"
```

---

### Task 4: Seed script (admin user)

**Files:**
- Create: `packages/server/src/prisma/seed.ts`

- [ ] **Step 1: Write seed.ts**

```typescript
// packages/server/src/prisma/seed.ts
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const phone = process.env.ADMIN_PHONE;
  const password = process.env.ADMIN_PASSWORD;

  if (!phone || !password) {
    throw new Error("ADMIN_PHONE and ADMIN_PASSWORD env vars required");
  }

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    console.log("Admin already exists, skipping seed");
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: { phone, name: "Admin", role: "ADMIN", passwordHash },
  });

  console.log(`Admin created: ${phone}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Run seed**

```bash
cd packages/server && pnpm db:seed
```

Expected: `Admin created: 9000000000`

- [ ] **Step 3: Verify admin in DB**

```bash
docker compose exec postgres psql -U madamgy -d madamgy -c "SELECT phone, role FROM \"User\";"
```

Expected: one row with `9000000000 | ADMIN`.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/prisma/seed.ts
git commit -m "feat: add seed script for admin user"
```

---

### Task 5: api-client schemas (update to match Prisma)

**Files:**
- Modify: `packages/api-client/src/schemas/user.schema.ts`
- Create: `packages/api-client/src/schemas/call.schema.ts`
- Create: `packages/api-client/src/schemas/prescription.schema.ts`
- Create: `packages/api-client/src/schemas/health-file.schema.ts`
- Create: `packages/api-client/src/schemas/chat.schema.ts`
- Create: `packages/api-client/src/schemas/wallet.schema.ts`
- Create: `packages/api-client/src/index.ts`

- [ ] **Step 1: Replace user.schema.ts**

```typescript
// packages/api-client/src/schemas/user.schema.ts
import { z } from "zod";

export const UserRoleSchema = z.enum(["PATIENT", "DOCTOR", "ADMIN"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const PatientRegisterSchema = z.object({
  phone: z.string().min(10).max(15),
  name: z.string().min(1).max(100),
  dob: z.string().datetime(),
  pin: z.string().length(4).regex(/^\d{4}$/),
});
export type PatientRegister = z.infer<typeof PatientRegisterSchema>;

export const PatientLoginSchema = z.object({
  phone: z.string().min(10).max(15),
  pin: z.string().length(4).regex(/^\d{4}$/),
});
export type PatientLogin = z.infer<typeof PatientLoginSchema>;

export const DoctorRegisterSchema = z.object({
  phone: z.string().min(10).max(15),
  name: z.string().min(1).max(100),
  password: z.string().min(8),
  degree: z.string().min(1),
  regNumber: z.string().min(1),
  specialization: z.string().optional(),
});
export type DoctorRegister = z.infer<typeof DoctorRegisterSchema>;

export const DoctorLoginInitiateSchema = z.object({
  phone: z.string().min(10).max(15),
  password: z.string().min(1),
});
export type DoctorLoginInitiate = z.infer<typeof DoctorLoginInitiateSchema>;

export const DoctorLoginVerifySchema = z.object({
  phone: z.string().min(10).max(15),
  otp: z.string().length(6).regex(/^\d{6}$/),
});
export type DoctorLoginVerify = z.infer<typeof DoctorLoginVerifySchema>;

export const AdminLoginSchema = z.object({
  phone: z.string().min(10).max(15),
  password: z.string().min(1),
});
export type AdminLogin = z.infer<typeof AdminLoginSchema>;

export const UserSchema = z.object({
  id: z.string(),
  phone: z.string(),
  name: z.string(),
  role: UserRoleSchema,
  disabled: z.boolean(),
  createdAt: z.string(),
});
export type User = z.infer<typeof UserSchema>;

export const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  heightCm: z.number().positive().max(300).optional(),
  weightKg: z.number().positive().max(500).optional(),
  bloodType: z.string().max(10).optional(),
  dob: z.string().datetime().optional(),
});
export type UpdateProfile = z.infer<typeof UpdateProfileSchema>;
```

- [ ] **Step 2: Create call.schema.ts**

```typescript
// packages/api-client/src/schemas/call.schema.ts
import { z } from "zod";

export const CallStatusSchema = z.enum([
  "QUEUED",
  "RINGING",
  "ACTIVE",
  "ENDED",
  "MISSED",
  "REJECTED",
  "NO_DOCTOR",
]);
export type CallStatus = z.infer<typeof CallStatusSchema>;

export const CallSessionSchema = z.object({
  id: z.string(),
  patientId: z.string(),
  doctorId: z.string().nullable(),
  status: CallStatusSchema,
  livekitRoom: z.string(),
  queuedAt: z.string(),
  startedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type CallSession = z.infer<typeof CallSessionSchema>;

export const VitalsSchema = z.object({
  weightKg: z.number().positive().optional(),
  heightCm: z.number().positive().optional(),
  bp: z.string().optional(),
  spo2: z.number().min(0).max(100).optional(),
  temp: z.number().optional(),
});
export type Vitals = z.infer<typeof VitalsSchema>;
```

- [ ] **Step 3: Create prescription.schema.ts**

```typescript
// packages/api-client/src/schemas/prescription.schema.ts
import { z } from "zod";

export const PrescriptionSchema = z.object({
  id: z.string(),
  callSessionId: z.string(),
  patientId: z.string(),
  doctorId: z.string(),
  content: z.record(z.unknown()),
  objectKey: z.string().nullable(),
  pdfReady: z.boolean(),
  createdAt: z.string(),
});
export type Prescription = z.infer<typeof PrescriptionSchema>;

export const SubmitPrescriptionSchema = z.object({
  callSessionId: z.string(),
  content: z.record(z.unknown()),
});
export type SubmitPrescription = z.infer<typeof SubmitPrescriptionSchema>;
```

- [ ] **Step 4: Create health-file.schema.ts**

```typescript
// packages/api-client/src/schemas/health-file.schema.ts
import { z } from "zod";

export const FileTypeSchema = z.enum(["PRESCRIPTION", "LAB_REPORT", "OTHER"]);
export type FileType = z.infer<typeof FileTypeSchema>;

export const HealthFileSchema = z.object({
  id: z.string(),
  userId: z.string(),
  prescriptionId: z.string().nullable(),
  name: z.string(),
  type: FileTypeSchema,
  sizeBytes: z.number(),
  createdAt: z.string(),
  url: z.string(),
});
export type HealthFile = z.infer<typeof HealthFileSchema>;
```

- [ ] **Step 5: Create chat.schema.ts**

```typescript
// packages/api-client/src/schemas/chat.schema.ts
import { z } from "zod";
import { VitalsSchema } from "./call.schema";

export const MsgTypeSchema = z.enum(["TEXT", "IMAGE", "VITALS"]);
export type MsgType = z.infer<typeof MsgTypeSchema>;

export const ChatMessageSchema = z.object({
  id: z.string(),
  callSessionId: z.string(),
  senderId: z.string(),
  content: z.string().nullable(),
  imageKey: z.string().nullable(),
  vitals: VitalsSchema.nullable(),
  type: MsgTypeSchema,
  createdAt: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const SendChatSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("TEXT"),
    callSessionId: z.string(),
    content: z.string().min(1).max(2000),
  }),
  z.object({
    type: z.literal("IMAGE"),
    callSessionId: z.string(),
    imageKey: z.string(),
  }),
  z.object({
    type: z.literal("VITALS"),
    callSessionId: z.string(),
    vitals: VitalsSchema,
  }),
]);
export type SendChat = z.infer<typeof SendChatSchema>;
```

- [ ] **Step 6: Create wallet.schema.ts**

```typescript
// packages/api-client/src/schemas/wallet.schema.ts
import { z } from "zod";

export const TxnTypeSchema = z.enum(["CREDIT", "DEBIT"]);
export const TxnStatusSchema = z.enum(["PENDING", "COMPLETED", "FAILED"]);

export const WalletTransactionSchema = z.object({
  id: z.string(),
  doctorId: z.string(),
  callSessionId: z.string().nullable(),
  amount: z.string(),
  type: TxnTypeSchema,
  status: TxnStatusSchema,
  description: z.string().nullable(),
  createdAt: z.string(),
});
export type WalletTransaction = z.infer<typeof WalletTransactionSchema>;

export const WithdrawRequestSchema = z.object({
  amount: z.number().positive(),
  bankName: z.string().min(1),
  accountNumber: z.string().min(1),
  ifsc: z.string().min(1),
  holderName: z.string().min(1),
});
export type WithdrawRequest = z.infer<typeof WithdrawRequestSchema>;
```

- [ ] **Step 7: Create/replace index.ts barrel**

```typescript
// packages/api-client/src/index.ts
export * from "./schemas/user.schema";
export * from "./schemas/call.schema";
export * from "./schemas/prescription.schema";
export * from "./schemas/health-file.schema";
export * from "./schemas/chat.schema";
export * from "./schemas/wallet.schema";
```

- [ ] **Step 8: Build api-client**

```bash
cd packages/api-client && pnpm build
```

Expected: no errors, `dist/` created.

- [ ] **Step 9: Commit**

```bash
git add packages/api-client/
git commit -m "feat: rewrite api-client schemas to match prisma models"
```

---

### Task 6: Auth services + middleware

**Files:**
- Create: `packages/server/src/services/auth.service.ts`
- Create: `packages/server/src/services/otp.service.ts`
- Create: `packages/server/src/middleware/auth.middleware.ts`

- [ ] **Step 1: Write otp.service.ts**

```typescript
// packages/server/src/services/otp.service.ts
import axios from "axios";
import { redis } from "../lib/redis";

function otpKey(phone: string) {
  return `otp:${phone}`;
}

export async function storeOtp(phone: string): Promise<string> {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await redis.set(otpKey(phone), code, "EX", 300);
  return code;
}

export async function verifyOtp(
  phone: string,
  code: string,
): Promise<boolean> {
  const stored = await redis.getdel(otpKey(phone));
  return stored === code;
}

export async function sendOtpSms(phone: string, otp: string): Promise<void> {
  if (process.env.NODE_ENV === "test") return;

  const url = "https://api.msg91.com/api/v5/otp";
  await axios.post(
    url,
    { template_id: process.env.MSG91_TEMPLATE_ID, mobile: phone, otp },
    {
      headers: {
        authkey: process.env.MSG91_AUTH_KEY,
        "Content-Type": "application/json",
      },
    },
  );
}
```

- [ ] **Step 2: Create lib/redis.ts**

```typescript
// packages/server/src/lib/redis.ts
import IORedis from "ioredis";

export const redis = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});
```

- [ ] **Step 3: Create lib/prisma.ts**

```typescript
// packages/server/src/lib/prisma.ts
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
```

- [ ] **Step 4: Write auth.service.ts**

```typescript
// packages/server/src/services/auth.service.ts
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { AppError } from "../middleware/error.middleware";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";

export interface JwtPayload {
  sub: string;
  role: string;
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET!, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES || "15m",
  });
}

export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET!, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES || "30d",
  });
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET!) as JwtPayload;
}

export async function registerPatient(data: {
  phone: string;
  name: string;
  dob: string;
  pin: string;
}) {
  const existing = await prisma.user.findUnique({ where: { phone: data.phone } });
  if (existing) throw new AppError(409, "Phone already registered");

  const pinHash = await bcrypt.hash(data.pin, 12);
  const user = await prisma.user.create({
    data: {
      phone: data.phone,
      name: data.name,
      role: "PATIENT",
      pinHash,
      patientProfile: {
        create: { dob: new Date(data.dob) },
      },
    },
  });
  return user;
}

export async function loginPatient(phone: string, pin: string) {
  const attemptsKey = `pin_attempts:${phone}`;
  const attempts = await redis.get(attemptsKey);
  if (attempts && parseInt(attempts) >= 5) {
    throw new AppError(429, "Account locked. Try again in 15 minutes.");
  }

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user || !user.pinHash) throw new AppError(401, "Invalid credentials");
  if (user.disabled) throw new AppError(403, "Account disabled");

  const valid = await bcrypt.compare(pin, user.pinHash);
  if (!valid) {
    await redis.incr(attemptsKey);
    await redis.expire(attemptsKey, 900);
    throw new AppError(401, "Invalid credentials");
  }

  await redis.del(attemptsKey);
  return user;
}

export async function registerDoctor(data: {
  phone: string;
  name: string;
  password: string;
  degree: string;
  regNumber: string;
  specialization?: string;
}) {
  const existing = await prisma.user.findUnique({ where: { phone: data.phone } });
  if (existing) throw new AppError(409, "Phone already registered");

  const existing2 = await prisma.doctorProfile.findUnique({
    where: { regNumber: data.regNumber },
  });
  if (existing2) throw new AppError(409, "Registration number already in use");

  const passwordHash = await bcrypt.hash(data.password, 12);
  const user = await prisma.user.create({
    data: {
      phone: data.phone,
      name: data.name,
      role: "DOCTOR",
      passwordHash,
      doctorProfile: {
        create: {
          degree: data.degree,
          regNumber: data.regNumber,
          specialization: data.specialization,
        },
      },
    },
  });
  return user;
}

export async function loginDoctorInitiate(phone: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { phone },
    include: { doctorProfile: true },
  });
  if (!user || !user.passwordHash) throw new AppError(401, "Invalid credentials");
  if (user.disabled) throw new AppError(403, "Account disabled");
  if (!user.doctorProfile?.isApproved) {
    throw new AppError(403, "Account pending admin approval");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new AppError(401, "Invalid credentials");

  return user;
}

export async function loginAdmin(phone: string, password: string) {
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user || user.role !== "ADMIN" || !user.passwordHash) {
    throw new AppError(401, "Invalid credentials");
  }
  if (user.disabled) throw new AppError(403, "Account disabled");

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new AppError(401, "Invalid credentials");

  return user;
}
```

- [ ] **Step 5: Write auth.middleware.ts**

```typescript
// packages/server/src/middleware/auth.middleware.ts
import { NextFunction, Request, Response } from "express";
import { UserRole } from "@prisma/client";
import { AppError } from "./error.middleware";
import { verifyAccessToken } from "../services/auth.service";
import { prisma } from "../lib/prisma";

export function requireAuth(...roles: UserRole[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const header = req.headers.authorization;
      if (!header?.startsWith("Bearer ")) throw new AppError(401, "Unauthorized");

      const token = header.slice(7);
      const payload = verifyAccessToken(token);

      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || user.disabled) throw new AppError(401, "Unauthorized");
      if (roles.length && !roles.includes(user.role)) {
        throw new AppError(403, "Forbidden");
      }

      req.user = { sub: user.id, role: user.role };
      next();
    } catch (err) {
      next(err instanceof AppError ? err : new AppError(401, "Unauthorized"));
    }
  };
}
```

- [ ] **Step 6: Write auth.routes.ts**

```typescript
// packages/server/src/routes/auth.routes.ts
import { Router, Request, Response, NextFunction } from "express";
import {
  PatientRegisterSchema,
  PatientLoginSchema,
  DoctorRegisterSchema,
  DoctorLoginInitiateSchema,
  DoctorLoginVerifySchema,
  AdminLoginSchema,
} from "@madamgy/api-client";
import {
  registerPatient,
  loginPatient,
  registerDoctor,
  loginDoctorInitiate,
  loginAdmin,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../services/auth.service";
import { storeOtp, verifyOtp, sendOtpSms } from "../services/otp.service";
import { AppError } from "../middleware/error.middleware";
import { prisma } from "../lib/prisma";
import { io } from "../index";

export const authRouter = Router();

function setRefreshCookie(res: Response, token: string) {
  res.cookie("refreshToken", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

authRouter.post("/patient/register", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = PatientRegisterSchema.parse(req.body);
    const user = await registerPatient(body);
    const payload = { sub: user.id, role: user.role };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);
    setRefreshCookie(res, refreshToken);
    res.status(201).json({ accessToken, user: { id: user.id, name: user.name, role: user.role } });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/patient/login", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phone, pin } = PatientLoginSchema.parse(req.body);
    const user = await loginPatient(phone, pin);
    const payload = { sub: user.id, role: user.role };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);
    setRefreshCookie(res, refreshToken);
    res.json({ accessToken, user: { id: user.id, name: user.name, role: user.role } });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/doctor/register", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = DoctorRegisterSchema.parse(req.body);
    const user = await registerDoctor(body);
    io.to("admins").emit("doctor:new_registration", { doctorId: user.id, name: user.name });
    res.status(201).json({ message: "Registration submitted, awaiting admin approval" });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/doctor/login/initiate", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phone, password } = DoctorLoginInitiateSchema.parse(req.body);
    await loginDoctorInitiate(phone, password);
    const otp = await storeOtp(phone);
    await sendOtpSms(phone, otp);
    res.json({ message: "OTP sent" });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/doctor/login/verify", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phone, otp } = DoctorLoginVerifySchema.parse(req.body);
    const valid = await verifyOtp(phone, otp);
    if (!valid) throw new AppError(401, "Invalid or expired OTP");

    const user = await prisma.user.findUniqueOrThrow({ where: { phone } });
    const payload = { sub: user.id, role: user.role };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);
    setRefreshCookie(res, refreshToken);
    res.json({ accessToken, user: { id: user.id, name: user.name, role: user.role } });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/admin/login", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phone, password } = AdminLoginSchema.parse(req.body);
    const user = await loginAdmin(phone, password);
    const payload = { sub: user.id, role: user.role };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);
    setRefreshCookie(res, refreshToken);
    res.json({ accessToken, user: { id: user.id, name: user.name, role: user.role } });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/refresh", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) throw new AppError(401, "No refresh token");
    const payload = verifyRefreshToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.disabled) throw new AppError(401, "Unauthorized");
    const newPayload = { sub: user.id, role: user.role };
    const accessToken = signAccessToken(newPayload);
    const refreshToken = signRefreshToken(newPayload);
    setRefreshCookie(res, refreshToken);
    res.json({ accessToken });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie("refreshToken");
  res.json({ message: "Logged out" });
});
```

- [ ] **Step 7: Register routes in index.ts**

In `packages/server/src/index.ts`, add after existing middleware:

```typescript
import { authRouter } from "./routes/auth.routes";
// ...
app.use("/api/auth", authRouter);
```

- [ ] **Step 8: Write auth tests**

```typescript
// packages/server/src/__tests__/auth.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { app } from "../index";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";

beforeAll(async () => {
  await prisma.user.deleteMany({ where: { phone: { startsWith: "9999" } } });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { phone: { startsWith: "9999" } } });
  await prisma.$disconnect();
  await redis.quit();
});

describe("Patient auth", () => {
  it("registers a new patient", async () => {
    const res = await request(app).post("/api/auth/patient/register").send({
      phone: "9999000001",
      name: "Test Patient",
      dob: "1990-01-01T00:00:00.000Z",
      pin: "1234",
    });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.role).toBe("PATIENT");
  });

  it("rejects duplicate phone on register", async () => {
    const res = await request(app).post("/api/auth/patient/register").send({
      phone: "9999000001",
      name: "Dup",
      dob: "1990-01-01T00:00:00.000Z",
      pin: "1234",
    });
    expect(res.status).toBe(409);
  });

  it("logs in with correct PIN", async () => {
    const res = await request(app).post("/api/auth/patient/login").send({
      phone: "9999000001",
      pin: "1234",
    });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
  });

  it("rejects wrong PIN", async () => {
    const res = await request(app).post("/api/auth/patient/login").send({
      phone: "9999000001",
      pin: "0000",
    });
    expect(res.status).toBe(401);
  });

  it("locks after 5 failed attempts", async () => {
    for (let i = 0; i < 5; i++) {
      await request(app).post("/api/auth/patient/login").send({
        phone: "9999000001",
        pin: "0000",
      });
    }
    const res = await request(app).post("/api/auth/patient/login").send({
      phone: "9999000001",
      pin: "1234",
    });
    expect(res.status).toBe(429);
    await redis.del("pin_attempts:9999000001");
  });
});

describe("Admin auth", () => {
  it("logs in with env credentials", async () => {
    const res = await request(app).post("/api/auth/admin/login").send({
      phone: process.env.ADMIN_PHONE,
      password: process.env.ADMIN_PASSWORD,
    });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("ADMIN");
  });
});
```

- [ ] **Step 9: Run auth tests**

```bash
cd packages/server && pnpm test src/__tests__/auth.test.ts
```

Expected: all tests pass. If `Cannot find module '@madamgy/api-client'`, run `cd ../api-client && pnpm build` first, then add to server's package.json: `"@madamgy/api-client": "workspace:*"`.

- [ ] **Step 10: Commit**

```bash
git add packages/server/src/
git commit -m "feat: auth routes, middleware, OTP service, JWT sign/verify"
```

---

### Task 7: Users route + /me endpoint

**Files:**
- Create: `packages/server/src/routes/users.routes.ts`

- [ ] **Step 1: Write users.routes.ts**

```typescript
// packages/server/src/routes/users.routes.ts
import { Router, Request, Response, NextFunction } from "express";
import { UpdateProfileSchema } from "@madamgy/api-client";
import { requireAuth } from "../middleware/auth.middleware";
import { prisma } from "../lib/prisma";

export const usersRouter = Router();

usersRouter.get("/me", requireAuth(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.sub },
      include: { patientProfile: true, doctorProfile: true },
    });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

usersRouter.put("/me", requireAuth("PATIENT"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = UpdateProfileSchema.parse(req.body);
    await prisma.patientProfile.update({
      where: { userId: req.user!.sub },
      data: {
        heightCm: body.heightCm,
        weightKg: body.weightKg,
        bloodType: body.bloodType,
        dob: body.dob ? new Date(body.dob) : undefined,
      },
    });
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.sub },
      include: { patientProfile: true },
    });
    res.json(user);
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 2: Register in index.ts**

```typescript
import { usersRouter } from "./routes/users.routes";
app.use("/api/users", usersRouter);
```

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/routes/users.routes.ts packages/server/src/index.ts
git commit -m "feat: GET /api/users/me and PUT /api/users/me"
```

---

## Phase 2 — Consultation + Video

### Task 8: packages/web scaffold

**Files:**
- Create: `packages/web/package.json`
- Create: `packages/web/tsconfig.json`
- Create: `packages/web/vite.config.ts`
- Create: `packages/web/index.html`
- Create: `packages/web/tailwind.config.ts`
- Create: `packages/web/postcss.config.js`
- Create: `packages/web/src/main.tsx`
- Create: `packages/web/src/App.tsx`
- Create: `packages/web/src/lib/api.ts`
- Create: `packages/web/src/lib/queryClient.ts`
- Create: `packages/web/src/store/auth.store.ts`

- [ ] **Step 1: Write package.json**

```json
{
  "name": "@madamgy/web",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src"
  },
  "dependencies": {
    "@livekit/components-react": "^2.3.0",
    "@madamgy/api-client": "workspace:*",
    "@tanstack/react-query": "^5.40.0",
    "@tanstack/react-table": "^8.17.0",
    "@tiptap/extension-document": "^2.4.0",
    "@tiptap/extension-paragraph": "^2.4.0",
    "@tiptap/extension-text": "^2.4.0",
    "@tiptap/pm": "^2.4.0",
    "@tiptap/react": "^2.4.0",
    "@tiptap/starter-kit": "^2.4.0",
    "axios": "^1.7.0",
    "clsx": "^2.1.0",
    "date-fns": "^3.6.0",
    "framer-motion": "^11.2.0",
    "livekit-client": "^2.3.0",
    "lucide-react": "^0.383.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-hook-form": "^7.51.0",
    "react-hot-toast": "^2.4.1",
    "react-router-dom": "^6.23.0",
    "react-to-print": "^2.15.1",
    "recharts": "^2.12.0",
    "socket.io-client": "^4.7.5",
    "tailwind-merge": "^2.3.0",
    "zod": "^3.23.0",
    "zustand": "^4.5.0"
  },
  "devDependencies": {
    "@hookform/resolvers": "^3.6.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.4.0",
    "vite": "^5.2.0"
  }
}
```

- [ ] **Step 2: Write tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ES2022",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write vite.config.ts**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:3000",
      "/socket.io": { target: "http://localhost:3000", ws: true },
    },
  },
});
```

- [ ] **Step 4: Write index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MadamGy</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Write tailwind.config.ts**

```typescript
import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 6: Write postcss.config.js**

```javascript
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

- [ ] **Step 7: Write src/lib/api.ts**

```typescript
// packages/web/src/lib/api.ts
import axios from "axios";
import { useAuthStore } from "../store/auth.store";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401 && !err.config._retry) {
      err.config._retry = true;
      try {
        const res = await axios.post("/api/auth/refresh", {}, { withCredentials: true });
        useAuthStore.getState().setAccessToken(res.data.accessToken);
        err.config.headers.Authorization = `Bearer ${res.data.accessToken}`;
        return api(err.config);
      } catch {
        useAuthStore.getState().logout();
      }
    }
    return Promise.reject(err);
  },
);
```

- [ ] **Step 8: Write src/lib/queryClient.ts**

```typescript
// packages/web/src/lib/queryClient.ts
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});
```

- [ ] **Step 9: Write src/store/auth.store.ts**

```typescript
// packages/web/src/store/auth.store.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserRole } from "@madamgy/api-client";

interface AuthUser {
  id: string;
  name: string;
  role: UserRole;
}

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  setAuth: (token: string, user: AuthUser) => void;
  setAccessToken: (token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      setAuth: (accessToken, user) => set({ accessToken, user }),
      setAccessToken: (accessToken) => set({ accessToken }),
      logout: () => set({ accessToken: null, user: null }),
    }),
    { name: "madamgy-auth", partialize: (s) => ({ user: s.user }) },
  ),
);
```

- [ ] **Step 10: Write src/main.tsx**

```typescript
// packages/web/src/main.tsx
import { QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import App from "./App";
import { queryClient } from "./lib/queryClient";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster position="top-center" />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
```

- [ ] **Step 11: Create src/index.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

* { box-sizing: border-box; margin: 0; padding: 0; }
```

- [ ] **Step 12: Write src/App.tsx (routing skeleton)**

```typescript
// packages/web/src/App.tsx
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuthStore } from "./store/auth.store";

// Kiosk pages
import KioskHome from "./pages/kiosk/Home";
import KioskRegister from "./pages/kiosk/Register";
import KioskLogin from "./pages/kiosk/Login";
import KioskDashboard from "./pages/kiosk/Dashboard";
import KioskConsult from "./pages/kiosk/Consult";
import KioskPrescription from "./pages/kiosk/Prescription";

// Doctor pages
import DoctorDashboard from "./pages/doctor/Dashboard";
import DoctorCall from "./pages/doctor/Call";
import DoctorWallet from "./pages/doctor/Wallet";
import DoctorHistory from "./pages/doctor/History";

// Admin pages
import AdminDashboard from "./pages/admin/Dashboard";
import AdminDoctors from "./pages/admin/Doctors";
import AdminUsers from "./pages/admin/Users";
import AdminStats from "./pages/admin/Stats";

function RequireRole({ role, children }: { role: string; children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/" replace />;
  if (user.role !== role) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      {/* Kiosk */}
      <Route path="/" element={<KioskHome />} />
      <Route path="/register" element={<KioskRegister />} />
      <Route path="/login" element={<KioskLogin />} />
      <Route path="/dashboard" element={<RequireRole role="PATIENT"><KioskDashboard /></RequireRole>} />
      <Route path="/consult" element={<RequireRole role="PATIENT"><KioskConsult /></RequireRole>} />
      <Route path="/prescription/:id" element={<RequireRole role="PATIENT"><KioskPrescription /></RequireRole>} />

      {/* Doctor */}
      <Route path="/doctor" element={<RequireRole role="DOCTOR"><DoctorDashboard /></RequireRole>} />
      <Route path="/doctor/call/:id" element={<RequireRole role="DOCTOR"><DoctorCall /></RequireRole>} />
      <Route path="/doctor/wallet" element={<RequireRole role="DOCTOR"><DoctorWallet /></RequireRole>} />
      <Route path="/doctor/history" element={<RequireRole role="DOCTOR"><DoctorHistory /></RequireRole>} />

      {/* Admin */}
      <Route path="/admin" element={<RequireRole role="ADMIN"><AdminDashboard /></RequireRole>} />
      <Route path="/admin/doctors" element={<RequireRole role="ADMIN"><AdminDoctors /></RequireRole>} />
      <Route path="/admin/users" element={<RequireRole role="ADMIN"><AdminUsers /></RequireRole>} />
      <Route path="/admin/stats" element={<RequireRole role="ADMIN"><AdminStats /></RequireRole>} />
    </Routes>
  );
}
```

- [ ] **Step 13: Create all page stubs (so routes compile)**

Create each of the following with a minimal stub. Example for `pages/kiosk/Home.tsx`:

```typescript
// packages/web/src/pages/kiosk/Home.tsx
export default function KioskHome() {
  return <div className="min-h-screen flex items-center justify-center"><h1 className="text-4xl font-bold">MadamGy</h1></div>;
}
```

Repeat the same stub pattern for: `Register.tsx`, `Login.tsx`, `Dashboard.tsx`, `Consult.tsx`, `Prescription.tsx`, `doctor/Dashboard.tsx`, `doctor/Call.tsx`, `doctor/Wallet.tsx`, `doctor/History.tsx`, `admin/Dashboard.tsx`, `admin/Doctors.tsx`, `admin/Users.tsx`, `admin/Stats.tsx`.

- [ ] **Step 14: Install and start web**

```bash
cd packages/web && pnpm install
pnpm dev
```

Expected: Vite dev server starts on `:5173`. Visit `http://localhost:5173` — see "MadamGy" heading.

- [ ] **Step 15: Commit**

```bash
git add packages/web/
git commit -m "feat: scaffold packages/web with routing, auth store, all page stubs"
```

---

### Task 9: Kiosk auth pages (Register + Login)

**Files:**
- Modify: `packages/web/src/pages/kiosk/Home.tsx`
- Modify: `packages/web/src/pages/kiosk/Register.tsx`
- Modify: `packages/web/src/pages/kiosk/Login.tsx`
- Create: `packages/web/src/components/kiosk/NumPad.tsx`

- [ ] **Step 1: Write NumPad.tsx**

```typescript
// packages/web/src/components/kiosk/NumPad.tsx
import clsx from "clsx";

interface NumPadProps {
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
}

export function NumPad({ value, onChange, maxLength = 4 }: NumPadProps) {
  const push = (d: string) => {
    if (value.length < maxLength) onChange(value + d);
  };
  const pop = () => onChange(value.slice(0, -1));

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex gap-3 mb-2">
        {Array.from({ length: maxLength }).map((_, i) => (
          <div
            key={i}
            className={clsx(
              "w-10 h-10 rounded-full border-2",
              i < value.length ? "bg-blue-600 border-blue-600" : "border-gray-400",
            )}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((key) => (
          <button
            key={key}
            type="button"
            disabled={!key}
            onClick={() => key === "⌫" ? pop() : push(key)}
            className={clsx(
              "w-20 h-20 rounded-2xl text-2xl font-bold transition-colors",
              key
                ? "bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-900"
                : "invisible",
            )}
          >
            {key}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write Home.tsx**

```typescript
// packages/web/src/pages/kiosk/Home.tsx
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

export default function KioskHome() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex flex-col items-center justify-center gap-12 p-8">
      <motion.h1
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-6xl font-bold text-blue-900"
      >
        MadamGy
      </motion.h1>
      <p className="text-2xl text-gray-600">Your health, in one tap.</p>
      <div className="flex flex-col gap-6 w-full max-w-sm">
        <button
          onClick={() => navigate("/register")}
          className="w-full py-6 text-2xl font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-3xl transition-colors"
        >
          New Patient
        </button>
        <button
          onClick={() => navigate("/login")}
          className="w-full py-6 text-2xl font-semibold bg-white border-2 border-blue-600 text-blue-600 rounded-3xl hover:bg-blue-50 transition-colors"
        >
          Returning Patient
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write Register.tsx**

```typescript
// packages/web/src/pages/kiosk/Register.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { PatientRegisterSchema, type PatientRegister } from "@madamgy/api-client";
import { NumPad } from "../../components/kiosk/NumPad";
import { api } from "../../lib/api";
import { useAuthStore } from "../../store/auth.store";

export default function KioskRegister() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [step, setStep] = useState<"info" | "pin" | "confirm">("info");

  const { register, handleSubmit, getValues, formState: { errors } } = useForm<PatientRegister>({
    resolver: zodResolver(PatientRegisterSchema.omit({ pin: true })),
  });

  async function submit() {
    if (pin !== confirmPin) { toast.error("PINs do not match"); setStep("pin"); setPin(""); setConfirmPin(""); return; }
    try {
      const info = getValues();
      const res = await api.post("/auth/patient/register", { ...info, pin });
      setAuth(res.data.accessToken, res.data.user);
      navigate("/dashboard");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Registration failed");
    }
  }

  if (step === "info") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 gap-6 max-w-md mx-auto">
        <h2 className="text-4xl font-bold text-gray-900">Create Account</h2>
        <form onSubmit={handleSubmit(() => setStep("pin"))} className="w-full flex flex-col gap-4">
          <input {...register("name")} placeholder="Full Name" className="w-full p-5 text-xl border-2 rounded-2xl" />
          {errors.name && <p className="text-red-500">{errors.name.message}</p>}
          <input {...register("phone")} placeholder="Phone Number" type="tel" className="w-full p-5 text-xl border-2 rounded-2xl" />
          {errors.phone && <p className="text-red-500">{errors.phone.message}</p>}
          <input {...register("dob")} type="date" className="w-full p-5 text-xl border-2 rounded-2xl" />
          {errors.dob && <p className="text-red-500">{errors.dob.message}</p>}
          <button type="submit" className="w-full py-5 text-2xl font-semibold bg-blue-600 text-white rounded-3xl mt-4">
            Next
          </button>
        </form>
      </div>
    );
  }

  if (step === "pin") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-8">
        <h2 className="text-4xl font-bold">Choose a 4-digit PIN</h2>
        <NumPad value={pin} onChange={setPin} />
        <button
          disabled={pin.length < 4}
          onClick={() => setStep("confirm")}
          className="px-12 py-5 text-2xl font-semibold bg-blue-600 disabled:opacity-40 text-white rounded-3xl"
        >
          Continue
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8">
      <h2 className="text-4xl font-bold">Confirm PIN</h2>
      <NumPad value={confirmPin} onChange={setConfirmPin} />
      <button
        disabled={confirmPin.length < 4}
        onClick={submit}
        className="px-12 py-5 text-2xl font-semibold bg-green-600 disabled:opacity-40 text-white rounded-3xl"
      >
        Register
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Write Login.tsx**

```typescript
// packages/web/src/pages/kiosk/Login.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { NumPad } from "../../components/kiosk/NumPad";
import { api } from "../../lib/api";
import { useAuthStore } from "../../store/auth.store";

export default function KioskLogin() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [step, setStep] = useState<"phone" | "pin">("phone");

  async function submit() {
    try {
      const res = await api.post("/auth/patient/login", { phone, pin });
      setAuth(res.data.accessToken, res.data.user);
      navigate("/dashboard");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Login failed");
      setPin("");
    }
  }

  if (step === "phone") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-8 p-8">
        <h2 className="text-4xl font-bold">Enter Phone Number</h2>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="10-digit phone number"
          type="tel"
          className="w-full max-w-sm p-5 text-2xl border-2 rounded-2xl text-center"
        />
        <button
          disabled={phone.length < 10}
          onClick={() => setStep("pin")}
          className="px-12 py-5 text-2xl font-semibold bg-blue-600 disabled:opacity-40 text-white rounded-3xl"
        >
          Next
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8">
      <h2 className="text-4xl font-bold">Enter PIN</h2>
      <NumPad value={pin} onChange={setPin} />
      <button
        disabled={pin.length < 4}
        onClick={submit}
        className="px-12 py-5 text-2xl font-semibold bg-blue-600 disabled:opacity-40 text-white rounded-3xl"
      >
        Login
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Manually test**

Start both server and web dev servers. Navigate to `http://localhost:5173`, register a patient, verify redirect to `/dashboard` (stub page). Login with the same phone + PIN, verify success.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/
git commit -m "feat: kiosk Home, Register, Login pages with NumPad"
```

---

### Task 10: Call queue + BullMQ assign-doctor worker

**Files:**
- Create: `packages/server/src/workers/assign-doctor.worker.ts`
- Create: `packages/server/src/routes/calls.routes.ts`
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: Write lib/queues.ts**

```typescript
// packages/server/src/lib/queues.ts
import { Queue } from "bullmq";
import { redis } from "./redis";

export const assignDoctorQueue = new Queue("assign-doctor", { connection: redis });
export const renderPdfQueue = new Queue("render-pdf", { connection: redis });
```

- [ ] **Step 2: Write assign-doctor.worker.ts**

```typescript
// packages/server/src/workers/assign-doctor.worker.ts
import { Worker } from "bullmq";
import { redis } from "../lib/redis";
import { prisma } from "../lib/prisma";
import { io } from "../index";

export function startAssignDoctorWorker() {
  return new Worker(
    "assign-doctor",
    async (job) => {
      const { callSessionId } = job.data as { callSessionId: string };

      const call = await prisma.callSession.findUnique({ where: { id: callSessionId } });
      if (!call || call.status !== "QUEUED") return;

      const doctor = await prisma.$transaction(async (tx) => {
        const d = await tx.doctorProfile.findFirst({
          where: { isAvailable: true, isApproved: true },
          include: { user: true },
        });
        if (!d) throw new Error("no_doctor");

        await tx.doctorProfile.update({
          where: { id: d.id, isAvailable: true },
          data: { isAvailable: false },
        });
        return d;
      });

      const patient = await prisma.user.findUniqueOrThrow({
        where: { id: call.patientId },
        select: { id: true, name: true },
      });

      await prisma.callSession.update({
        where: { id: callSessionId },
        data: { doctorId: doctor.userId, status: "RINGING" },
      });

      io.to(`user:${doctor.userId}`).emit("call:incoming", { callSession: { ...call, doctorId: doctor.userId, status: "RINGING" }, patient });
    },
    {
      connection: redis,
      concurrency: 5,
    },
  );
}

export function handleAssignDoctorFailed(worker: ReturnType<typeof startAssignDoctorWorker>) {
  worker.on("failed", async (job, err) => {
    if (!job) return;
    const { callSessionId } = job.data as { callSessionId: string };

    if (job.attemptsMade >= (job.opts.attempts ?? 3) && err.message === "no_doctor") {
      await prisma.callSession.update({
        where: { id: callSessionId },
        data: { status: "NO_DOCTOR" },
      });

      const call = await prisma.callSession.findUnique({ where: { id: callSessionId } });
      if (call) {
        io.to(`user:${call.patientId}`).emit("call:no_doctor_available", { callSessionId });
      }
    }
  });
}
```

- [ ] **Step 3: Write calls.routes.ts**

```typescript
// packages/server/src/routes/calls.routes.ts
import { Router, Request, Response, NextFunction } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { prisma } from "../lib/prisma";
import { assignDoctorQueue } from "../lib/queues";
import { createId } from "@paralleldrive/cuid2";

export const callsRouter = Router();

callsRouter.post("/", requireAuth("PATIENT"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const patientId = req.user!.sub;

    const existing = await prisma.callSession.findFirst({
      where: { patientId, status: { in: ["QUEUED", "RINGING", "ACTIVE"] } },
    });
    if (existing) {
      return res.status(409).json({ message: "Active call exists", callSessionId: existing.id });
    }

    const livekitRoom = `room-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const call = await prisma.callSession.create({
      data: { patientId, livekitRoom, status: "QUEUED" },
    });

    await assignDoctorQueue.add(
      "assign",
      { callSessionId: call.id },
      { attempts: 3, backoff: { type: "fixed", delay: 30_000 } },
    );

    res.status(201).json(call);
  } catch (err) {
    next(err);
  }
});

callsRouter.get("/history", requireAuth(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(String(req.query.page || "1"));
    const limit = 20;
    const skip = (page - 1) * limit;

    const where =
      req.user!.role === "PATIENT"
        ? { patientId: req.user!.sub }
        : req.user!.role === "DOCTOR"
        ? { doctorId: req.user!.sub }
        : {};

    const [calls, total] = await Promise.all([
      prisma.callSession.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          patient: { select: { id: true, name: true } },
          doctor: { select: { id: true, name: true } },
        },
      }),
      prisma.callSession.count({ where }),
    ]);

    res.json({ calls, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 4: Register calls router in index.ts**

```typescript
import { callsRouter } from "./routes/calls.routes";
app.use("/api/calls", callsRouter);
```

- [ ] **Step 5: Start assign-doctor worker in index.ts**

```typescript
import { startAssignDoctorWorker, handleAssignDoctorFailed } from "./workers/assign-doctor.worker";

if (process.env.NODE_ENV !== "test") {
  const assignWorker = startAssignDoctorWorker();
  handleAssignDoctorFailed(assignWorker);
}
```

Note: `cuid2` needs to be installed — add `"@paralleldrive/cuid2": "^2.2.2"` to server deps, or use `crypto.randomUUID()` instead.

Alternative without cuid2 — replace `livekitRoom` generation:
```typescript
const livekitRoom = `room-${crypto.randomUUID()}`;
```

- [ ] **Step 6: Write call route tests**

```typescript
// packages/server/src/__tests__/calls.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../index";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { signAccessToken } from "../services/auth.service";

let patientToken: string;
let patientId: string;

beforeAll(async () => {
  const patient = await prisma.user.create({
    data: {
      phone: "9999100001",
      name: "Call Test Patient",
      role: "PATIENT",
      pinHash: "dummy",
      patientProfile: { create: {} },
    },
  });
  patientId = patient.id;
  patientToken = signAccessToken({ sub: patient.id, role: "PATIENT" });
});

afterAll(async () => {
  await prisma.callSession.deleteMany({ where: { patientId } });
  await prisma.user.delete({ where: { id: patientId } });
  await prisma.$disconnect();
  await redis.quit();
});

describe("POST /api/calls", () => {
  it("creates a call session for a patient", async () => {
    const res = await request(app)
      .post("/api/calls")
      .set("Authorization", `Bearer ${patientToken}`);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("QUEUED");
    expect(res.body.patientId).toBe(patientId);
  });

  it("returns 409 if patient already has an active call", async () => {
    const res = await request(app)
      .post("/api/calls")
      .set("Authorization", `Bearer ${patientToken}`);
    expect(res.status).toBe(409);
  });

  it("returns 401 without token", async () => {
    const res = await request(app).post("/api/calls");
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 7: Run call tests**

```bash
cd packages/server && pnpm test src/__tests__/calls.test.ts
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/
git commit -m "feat: POST /api/calls with BullMQ assign-doctor worker"
```

---

### Task 11: Socket.io handlers (call + chat + presence)

**Files:**
- Create: `packages/server/src/socket/index.ts`
- Create: `packages/server/src/socket/call.handler.ts`
- Create: `packages/server/src/socket/chat.handler.ts`
- Create: `packages/server/src/socket/presence.handler.ts`

- [ ] **Step 1: Write socket/index.ts**

```typescript
// packages/server/src/socket/index.ts
import { Server, Socket } from "socket.io";
import { verifyAccessToken } from "../services/auth.service";
import { prisma } from "../lib/prisma";
import { registerCallHandlers } from "./call.handler";
import { registerChatHandlers } from "./chat.handler";
import { registerPresenceHandlers } from "./presence.handler";

export function initSocketHandlers(io: Server) {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token as string;
      if (!token) return next(new Error("Unauthorized"));
      const payload = verifyAccessToken(token);
      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || user.disabled) return next(new Error("Unauthorized"));
      (socket as any).userId = user.id;
      (socket as any).userRole = user.role;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const userId = (socket as any).userId as string;
    const userRole = (socket as any).userRole as string;

    socket.join(`user:${userId}`);
    if (userRole === "ADMIN") socket.join("admins");

    registerCallHandlers(io, socket, userId, userRole);
    registerChatHandlers(io, socket, userId);
    registerPresenceHandlers(io, socket, userId);

    socket.on("disconnect", async () => {
      if (userRole === "DOCTOR") {
        await prisma.doctorProfile.updateMany({
          where: { userId, isAvailable: true },
          data: { isAvailable: false },
        });
      }
    });
  });
}
```

- [ ] **Step 2: Write call.handler.ts**

```typescript
// packages/server/src/socket/call.handler.ts
import { Server, Socket } from "socket.io";
import { prisma } from "../lib/prisma";
import { livekitService } from "../services/livekit.service";
import { assignDoctorQueue } from "../lib/queues";

export function registerCallHandlers(
  io: Server,
  socket: Socket,
  userId: string,
  userRole: string,
) {
  socket.on("call:accept", async ({ callSessionId }: { callSessionId: string }) => {
    try {
      const call = await prisma.callSession.findUnique({ where: { id: callSessionId } });
      if (!call || call.doctorId !== userId || call.status !== "RINGING") return;

      await prisma.callSession.update({
        where: { id: callSessionId },
        data: { status: "ACTIVE", startedAt: new Date() },
      });

      const [doctorToken, patientToken] = await Promise.all([
        livekitService.generateToken(call.livekitRoom, userId),
        livekitService.generateToken(call.livekitRoom, call.patientId),
      ]);

      socket.emit("call:accepted", { callSessionId, livekitToken: doctorToken });
      io.to(`user:${call.patientId}`).emit("call:accepted", {
        callSessionId,
        livekitToken: patientToken,
      });
    } catch (err) {
      console.error("call:accept error", err);
    }
  });

  socket.on("call:reject", async ({ callSessionId }: { callSessionId: string }) => {
    try {
      const call = await prisma.callSession.findUnique({ where: { id: callSessionId } });
      if (!call || call.doctorId !== userId) return;

      await prisma.$transaction([
        prisma.callSession.update({
          where: { id: callSessionId },
          data: { doctorId: null, status: "QUEUED" },
        }),
        prisma.doctorProfile.update({
          where: { userId },
          data: { isAvailable: true },
        }),
      ]);

      io.to(`user:${call.patientId}`).emit("call:rejected", { callSessionId });

      await assignDoctorQueue.add(
        "assign",
        { callSessionId },
        { attempts: 1, backoff: { type: "fixed", delay: 5_000 } },
      );
    } catch (err) {
      console.error("call:reject error", err);
    }
  });

  socket.on("call:end", async ({ callSessionId }: { callSessionId: string }) => {
    try {
      const call = await prisma.callSession.findUnique({ where: { id: callSessionId } });
      if (!call) return;

      const allowed = call.patientId === userId || call.doctorId === userId;
      if (!allowed) return;

      if (call.status === "ACTIVE") {
        io.to(`user:${call.patientId}`).emit("call:ended", { callSessionId });
        if (call.doctorId) {
          io.to(`user:${call.doctorId}`).emit("call:ended", { callSessionId });
        }
      }
    } catch (err) {
      console.error("call:end error", err);
    }
  });

  socket.on("doctor:toggle_available", async ({ isAvailable }: { isAvailable: boolean }) => {
    if (userRole !== "DOCTOR") return;
    try {
      await prisma.doctorProfile.update({ where: { userId }, data: { isAvailable } });
    } catch (err) {
      console.error("doctor:toggle_available error", err);
    }
  });
}
```

- [ ] **Step 3: Write chat.handler.ts**

```typescript
// packages/server/src/socket/chat.handler.ts
import { Server, Socket } from "socket.io";
import { prisma } from "../lib/prisma";
import { SendChatSchema } from "@madamgy/api-client";
import { VitalsSchema } from "@madamgy/api-client";

export function registerChatHandlers(io: Server, socket: Socket, userId: string) {
  socket.on("chat:send", async (rawData: unknown) => {
    try {
      const data = SendChatSchema.parse(rawData);
      const call = await prisma.callSession.findUnique({
        where: { id: data.callSessionId },
      });
      if (!call) return;
      if (call.patientId !== userId && call.doctorId !== userId) return;
      if (call.status !== "ACTIVE") return;

      const msg = await prisma.chatMessage.create({
        data: {
          callSessionId: data.callSessionId,
          senderId: userId,
          type: data.type,
          content: data.type === "TEXT" ? data.content : null,
          imageKey: data.type === "IMAGE" ? data.imageKey : null,
          vitals: data.type === "VITALS" ? (data.vitals as object) : null,
        },
        include: { sender: { select: { id: true, name: true } } },
      });

      io.to(`user:${call.patientId}`).emit("chat:message", msg);
      if (call.doctorId) {
        io.to(`user:${call.doctorId}`).emit("chat:message", msg);
      }
    } catch (err) {
      console.error("chat:send error", err);
    }
  });
}
```

- [ ] **Step 4: Write presence.handler.ts**

```typescript
// packages/server/src/socket/presence.handler.ts
import { Server, Socket } from "socket.io";

export function registerPresenceHandlers(_io: Server, socket: Socket, _userId: string) {
  socket.on("presence:ping", () => {
    socket.emit("presence:pong");
  });
}
```

- [ ] **Step 5: Write LiveKit service**

```typescript
// packages/server/src/services/livekit.service.ts
import { AccessToken } from "livekit-server-sdk";

export const livekitService = {
  async generateToken(room: string, participantId: string): Promise<string> {
    const token = new AccessToken(
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!,
      { identity: participantId, ttl: "2h" },
    );
    token.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });
    return token.toJwt();
  },
};
```

- [ ] **Step 6: Wire socket handlers into index.ts**

```typescript
import { initSocketHandlers } from "./socket/index";
// After io is created:
initSocketHandlers(io);
```

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/socket/ packages/server/src/services/livekit.service.ts
git commit -m "feat: socket.io call/chat/presence handlers + livekit token service"
```

---

### Task 12: Kiosk Consult page + Doctor Call page (video)

**Files:**
- Create: `packages/web/src/lib/socket.ts`
- Create: `packages/web/src/store/call.store.ts`
- Create: `packages/web/src/hooks/useSocket.ts`
- Create: `packages/web/src/hooks/useCall.ts`
- Modify: `packages/web/src/pages/kiosk/Consult.tsx`
- Create: `packages/web/src/components/video/KioskCallView.tsx`
- Modify: `packages/web/src/pages/doctor/Dashboard.tsx`
- Modify: `packages/web/src/pages/doctor/Call.tsx`
- Create: `packages/web/src/components/video/DoctorCallView.tsx`

- [ ] **Step 1: Write lib/socket.ts**

```typescript
// packages/web/src/lib/socket.ts
import { io } from "socket.io-client";
import { useAuthStore } from "../store/auth.store";

let socket: ReturnType<typeof io> | null = null;

export function getSocket() {
  if (!socket) {
    const token = useAuthStore.getState().accessToken;
    socket = io(import.meta.env.VITE_SOCKET_URL || "", {
      auth: { token },
      autoConnect: false,
    });
  }
  return socket;
}

export function connectSocket() {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
```

- [ ] **Step 2: Write call.store.ts**

```typescript
// packages/web/src/store/call.store.ts
import { create } from "zustand";
import type { CallSession } from "@madamgy/api-client";

interface CallState {
  callSession: CallSession | null;
  livekitToken: string | null;
  setCall: (call: CallSession) => void;
  setLivekitToken: (token: string) => void;
  clearCall: () => void;
}

export const useCallStore = create<CallState>((set) => ({
  callSession: null,
  livekitToken: null,
  setCall: (callSession) => set({ callSession }),
  setLivekitToken: (livekitToken) => set({ livekitToken }),
  clearCall: () => set({ callSession: null, livekitToken: null }),
}));
```

- [ ] **Step 3: Write hooks/useSocket.ts**

```typescript
// packages/web/src/hooks/useSocket.ts
import { useEffect } from "react";
import { connectSocket, disconnectSocket, getSocket } from "../lib/socket";

export function useSocket() {
  useEffect(() => {
    connectSocket();
    return () => { disconnectSocket(); };
  }, []);
  return getSocket();
}
```

- [ ] **Step 4: Write hooks/useCall.ts**

```typescript
// packages/web/src/hooks/useCall.ts
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useCallStore } from "../store/call.store";
import { connectSocket, getSocket } from "../lib/socket";
import type { CallSession } from "@madamgy/api-client";
import toast from "react-hot-toast";

export function useCallListener() {
  const { setCall, setLivekitToken, clearCall } = useCallStore();
  const navigate = useNavigate();

  useEffect(() => {
    const s = connectSocket();

    s.on("call:accepted", ({ callSessionId, livekitToken }: { callSessionId: string; livekitToken: string }) => {
      setLivekitToken(livekitToken);
      navigate("/consult");
    });

    s.on("call:no_doctor_available", () => {
      clearCall();
      toast.error("No doctors available. Please try again later.");
      navigate("/dashboard");
    });

    s.on("call:ended", () => {
      clearCall();
      navigate("/dashboard");
    });

    return () => {
      s.off("call:accepted");
      s.off("call:no_doctor_available");
      s.off("call:ended");
    };
  }, []);
}
```

- [ ] **Step 5: Write KioskCallView.tsx**

```typescript
// packages/web/src/components/video/KioskCallView.tsx
import {
  LiveKitRoom,
  VideoConference,
} from "@livekit/components-react";
import "@livekit/components-styles";

interface Props {
  token: string;
  serverUrl: string;
  onDisconnected: () => void;
}

export function KioskCallView({ token, serverUrl, onDisconnected }: Props) {
  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connect={true}
      video={true}
      audio={true}
      onDisconnected={onDisconnected}
      style={{ height: "100vh" }}
    >
      <VideoConference />
    </LiveKitRoom>
  );
}
```

- [ ] **Step 6: Write Consult.tsx**

```typescript
// packages/web/src/pages/kiosk/Consult.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useCallStore } from "../../store/call.store";
import { useCallListener } from "../../hooks/useCall";
import { KioskCallView } from "../../components/video/KioskCallView";
import toast from "react-hot-toast";

export default function KioskConsult() {
  const navigate = useNavigate();
  const { callSession, livekitToken, setCall, clearCall } = useCallStore();
  const [loading, setLoading] = useState(!callSession);

  useCallListener();

  useEffect(() => {
    if (!callSession) {
      api.post("/calls")
        .then((res) => setCall(res.data))
        .catch((err) => {
          toast.error(err.response?.data?.message || "Failed to start call");
          navigate("/dashboard");
        })
        .finally(() => setLoading(false));
    }
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6">
        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-2xl text-gray-700">Finding available doctor...</p>
        <button onClick={() => { clearCall(); navigate("/dashboard"); }} className="text-gray-500 underline text-lg mt-4">
          Cancel
        </button>
      </div>
    );
  }

  if (livekitToken) {
    return (
      <KioskCallView
        token={livekitToken}
        serverUrl={import.meta.env.VITE_LIVEKIT_URL || "ws://localhost:7880"}
        onDisconnected={() => { clearCall(); navigate("/dashboard"); }}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6">
      <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-2xl text-gray-700">Connecting to doctor...</p>
    </div>
  );
}
```

- [ ] **Step 7: Write Doctor Dashboard.tsx**

```typescript
// packages/web/src/pages/doctor/Dashboard.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { connectSocket, getSocket } from "../../lib/socket";
import { api } from "../../lib/api";
import { useAuthStore } from "../../store/auth.store";
import toast from "react-hot-toast";

interface IncomingCall {
  callSession: { id: string; livekitRoom: string };
  patient: { id: string; name: string };
}

export default function DoctorDashboard() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [isAvailable, setIsAvailable] = useState(false);
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);

  useEffect(() => {
    const s = connectSocket();
    s.on("call:incoming", (data: IncomingCall) => {
      setIncoming(data);
      toast("Incoming call!", { icon: "📞" });
    });
    return () => { s.off("call:incoming"); };
  }, []);

  function toggleAvailable() {
    const next = !isAvailable;
    setIsAvailable(next);
    getSocket().emit("doctor:toggle_available", { isAvailable: next });
  }

  function accept() {
    if (!incoming) return;
    getSocket().emit("call:accept", { callSessionId: incoming.callSession.id });
    navigate(`/doctor/call/${incoming.callSession.id}`);
    setIncoming(null);
  }

  function reject() {
    if (!incoming) return;
    getSocket().emit("call:reject", { callSessionId: incoming.callSession.id });
    setIncoming(null);
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Welcome, Dr. {user?.name}</h1>
        <div className="flex items-center gap-4 mb-8">
          <span className="text-gray-600">Availability:</span>
          <button
            onClick={toggleAvailable}
            className={`px-6 py-3 rounded-full font-semibold text-white transition-colors ${isAvailable ? "bg-green-500 hover:bg-green-600" : "bg-gray-400 hover:bg-gray-500"}`}
          >
            {isAvailable ? "Available" : "Unavailable"}
          </button>
        </div>

        {incoming && (
          <div className="bg-white rounded-2xl shadow-lg p-6 border-2 border-blue-400">
            <h2 className="text-xl font-bold mb-2">Incoming call</h2>
            <p className="text-gray-700 mb-4">Patient: <strong>{incoming.patient.name}</strong></p>
            <div className="flex gap-4">
              <button onClick={accept} className="flex-1 py-4 bg-green-500 text-white rounded-xl font-semibold hover:bg-green-600">
                Accept
              </button>
              <button onClick={reject} className="flex-1 py-4 bg-red-500 text-white rounded-xl font-semibold hover:bg-red-600">
                Reject
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Write DoctorCallView.tsx**

```typescript
// packages/web/src/components/video/DoctorCallView.tsx
import { LiveKitRoom, GridLayout, ParticipantTile, useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";
import "@livekit/components-styles";

interface Props {
  token: string;
  serverUrl: string;
  onDisconnected: () => void;
  children?: React.ReactNode;
}

function VideoGrid() {
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare]);
  return (
    <GridLayout tracks={tracks} style={{ height: "100%" }}>
      <ParticipantTile />
    </GridLayout>
  );
}

export function DoctorCallView({ token, serverUrl, onDisconnected, children }: Props) {
  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connect={true}
      video={true}
      audio={true}
      onDisconnected={onDisconnected}
      style={{ height: "60vh" }}
    >
      <VideoGrid />
      {children}
    </LiveKitRoom>
  );
}
```

- [ ] **Step 9: Write doctor/Call.tsx stub (tiptap editor added in Task 16)**

```typescript
// packages/web/src/pages/doctor/Call.tsx
import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { connectSocket, getSocket } from "../../lib/socket";
import { DoctorCallView } from "../../components/video/DoctorCallView";

export default function DoctorCall() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [livekitToken, setLivekitToken] = useState<string | null>(null);

  useEffect(() => {
    const s = connectSocket();
    s.on("call:accepted", ({ callSessionId, livekitToken: token }: { callSessionId: string; livekitToken: string }) => {
      if (callSessionId === id) setLivekitToken(token);
    });
    return () => { s.off("call:accepted"); };
  }, [id]);

  if (!livekitToken) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-2xl">Connecting...</p></div>;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <DoctorCallView
        token={livekitToken}
        serverUrl={import.meta.env.VITE_LIVEKIT_URL || "ws://localhost:7880"}
        onDisconnected={() => navigate("/doctor")}
      />
      <div className="p-4 bg-white">
        <p className="text-gray-500">Prescription editor coming in Phase 3</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 10: Commit**

```bash
git add packages/web/src/
git commit -m "feat: kiosk consult page + doctor dashboard with LiveKit video"
```

---

## Phase 3 — Prescription + PDF + Print

### Task 13: storage.service.ts (MinIO)

**Files:**
- Create: `packages/server/src/services/storage.service.ts`

- [ ] **Step 1: Write storage.service.ts**

```typescript
// packages/server/src/services/storage.service.ts
import * as Minio from "minio";

const client = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || "localhost",
  port: parseInt(process.env.MINIO_PORT || "9000"),
  useSSL: process.env.MINIO_USE_SSL === "true",
  accessKey: process.env.MINIO_ACCESS_KEY!,
  secretKey: process.env.MINIO_SECRET_KEY!,
});

const BUCKET = process.env.MINIO_BUCKET || "madamgy";

export async function ensureBucket() {
  const exists = await client.bucketExists(BUCKET);
  if (!exists) {
    await client.makeBucket(BUCKET, "ap-south-1");
  }
}

export async function uploadBuffer(
  objectKey: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  await client.putObject(BUCKET, objectKey, buffer, buffer.length, {
    "Content-Type": contentType,
  });
}

export async function getPresignedUrl(objectKey: string, ttlSeconds = 3600): Promise<string> {
  return client.presignedGetObject(BUCKET, objectKey, ttlSeconds);
}

export async function deleteObject(objectKey: string): Promise<void> {
  await client.removeObject(BUCKET, objectKey);
}

export async function uploadStream(
  objectKey: string,
  stream: NodeJS.ReadableStream,
  size: number,
  contentType: string,
): Promise<void> {
  await client.putObject(BUCKET, objectKey, stream, size, {
    "Content-Type": contentType,
  });
}
```

- [ ] **Step 2: Call ensureBucket on startup in index.ts**

```typescript
import { ensureBucket } from "./services/storage.service";
// After app setup:
if (process.env.NODE_ENV !== "test") {
  ensureBucket().catch(console.error);
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/services/storage.service.ts packages/server/src/index.ts
git commit -m "feat: minio storage service with presigned URL generation"
```

---

### Task 14: Prescription route + render-pdf BullMQ worker

**Files:**
- Create: `packages/server/src/routes/prescriptions.routes.ts`
- Create: `packages/server/src/workers/render-pdf.worker.ts`
- Create: `packages/server/src/components/PrescriptionDoc.tsx`

- [ ] **Step 1: Write PrescriptionDoc.tsx (react-pdf)**

```typescript
// packages/server/src/components/PrescriptionDoc.tsx
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica" },
  header: { marginBottom: 20, borderBottom: "2px solid #1d4ed8", paddingBottom: 10 },
  title: { fontSize: 24, color: "#1d4ed8", fontWeight: "bold" },
  subtitle: { fontSize: 12, color: "#6b7280", marginTop: 4 },
  section: { marginTop: 16 },
  label: { fontSize: 10, color: "#6b7280", marginBottom: 2 },
  value: { fontSize: 12 },
  content: { marginTop: 20, fontSize: 12, lineHeight: 1.6 },
  footer: { position: "absolute", bottom: 40, left: 40, right: 40, borderTop: "1px solid #e5e7eb", paddingTop: 10, fontSize: 10, color: "#9ca3af" },
});

interface Props {
  prescription: {
    id: string;
    createdAt: string | Date;
    content: Record<string, unknown>;
    patient: { name: string; phone: string };
    doctor: { name: string; doctorProfile: { degree: string; regNumber: string; specialization: string | null } | null };
  };
}

function extractText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as Record<string, unknown>;
  if (typeof n.text === "string") return n.text;
  if (Array.isArray(n.content)) return n.content.map(extractText).join("");
  return "";
}

export function PrescriptionDoc({ prescription }: Props) {
  const text = extractText(prescription.content);
  const date = new Date(prescription.createdAt).toLocaleDateString("en-IN");

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>MadamGy</Text>
          <Text style={styles.subtitle}>Prescription</Text>
        </View>

        <View style={{ flexDirection: "row", gap: 40 }}>
          <View style={styles.section}>
            <Text style={styles.label}>Patient</Text>
            <Text style={styles.value}>{prescription.patient.name}</Text>
            <Text style={styles.value}>{prescription.patient.phone}</Text>
          </View>
          <View style={styles.section}>
            <Text style={styles.label}>Doctor</Text>
            <Text style={styles.value}>Dr. {prescription.doctor.name}</Text>
            <Text style={styles.value}>{prescription.doctor.doctorProfile?.degree}</Text>
            <Text style={styles.value}>Reg: {prescription.doctor.doctorProfile?.regNumber}</Text>
          </View>
          <View style={styles.section}>
            <Text style={styles.label}>Date</Text>
            <Text style={styles.value}>{date}</Text>
          </View>
        </View>

        <View style={[styles.section, { marginTop: 24 }]}>
          <Text style={styles.label}>Prescription</Text>
          <Text style={styles.content}>{text}</Text>
        </View>

        <Text style={styles.footer}>
          Prescription ID: {prescription.id} · MadamGy Telemedicine · This prescription is digitally generated.
        </Text>
      </Page>
    </Document>
  );
}
```

- [ ] **Step 2: Write render-pdf.worker.ts**

```typescript
// packages/server/src/workers/render-pdf.worker.ts
import { Worker } from "bullmq";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { redis } from "../lib/redis";
import { prisma } from "../lib/prisma";
import { io } from "../index";
import { uploadBuffer } from "../services/storage.service";
import { PrescriptionDoc } from "../components/PrescriptionDoc";

const CONSULTATION_FEE = parseFloat(process.env.CONSULTATION_FEE || "200");

export function startRenderPdfWorker() {
  return new Worker(
    "render-pdf",
    async (job) => {
      const { prescriptionId } = job.data as { prescriptionId: string };

      const prescription = await prisma.prescription.findUniqueOrThrow({
        where: { id: prescriptionId },
        include: {
          patient: { select: { id: true, name: true, phone: true } },
          doctor: {
            select: {
              id: true,
              name: true,
              doctorProfile: { select: { degree: true, regNumber: true, specialization: true, commissionRate: true } },
            },
          },
          callSession: true,
        },
      });

      const buffer = await renderToBuffer(
        React.createElement(PrescriptionDoc, { prescription }),
      );

      const objectKey = `prescriptions/${prescription.patientId}/${prescription.callSessionId}.pdf`;
      await uploadBuffer(objectKey, buffer, "application/pdf");

      const commission = prescription.doctor.doctorProfile?.commissionRate ?? 0.8;
      const earning = parseFloat((CONSULTATION_FEE * Number(commission)).toFixed(2));

      await prisma.$transaction([
        prisma.prescription.update({
          where: { id: prescriptionId },
          data: { objectKey, pdfReady: true },
        }),
        prisma.healthFile.create({
          data: {
            userId: prescription.patientId,
            prescriptionId,
            name: `Prescription - ${new Date(prescription.createdAt).toLocaleDateString("en-IN")}`,
            type: "PRESCRIPTION",
            objectKey,
            sizeBytes: buffer.length,
          },
        }),
        prisma.walletTransaction.create({
          data: {
            doctorId: prescription.doctorId,
            callSessionId: prescription.callSessionId,
            amount: earning,
            type: "CREDIT",
            status: "COMPLETED",
            description: `Consultation fee - ${prescription.callSession.id}`,
          },
        }),
        prisma.doctorProfile.update({
          where: { userId: prescription.doctorId },
          data: { walletBalance: { increment: earning }, isAvailable: true },
        }),
        prisma.callSession.update({
          where: { id: prescription.callSessionId },
          data: { status: "ENDED", endedAt: new Date() },
        }),
      ]);

      const healthFile = await prisma.healthFile.findFirst({
        where: { prescriptionId },
      });

      io.to(`user:${prescription.patientId}`).emit("prescription:ready", {
        callSessionId: prescription.callSessionId,
        healthFileId: healthFile?.id,
      });

      io.to(`user:${prescription.doctorId}`).emit("call:ended", {
        callSessionId: prescription.callSessionId,
      });
    },
    { connection: redis },
  );
}
```

- [ ] **Step 3: Write prescriptions.routes.ts**

```typescript
// packages/server/src/routes/prescriptions.routes.ts
import { Router, Request, Response, NextFunction } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { prisma } from "../lib/prisma";
import { renderPdfQueue } from "../lib/queues";
import { SubmitPrescriptionSchema } from "@madamgy/api-client";
import { AppError } from "../middleware/error.middleware";
import { getPresignedUrl } from "../services/storage.service";

export const prescriptionsRouter = Router();

prescriptionsRouter.post("/", requireAuth("DOCTOR"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { callSessionId, content } = SubmitPrescriptionSchema.parse(req.body);
    const doctorId = req.user!.sub;

    const call = await prisma.callSession.findUnique({ where: { id: callSessionId } });
    if (!call) throw new AppError(404, "Call session not found");
    if (call.doctorId !== doctorId) throw new AppError(403, "Forbidden");
    if (call.status !== "ACTIVE") throw new AppError(400, "Call is not active");

    const existing = await prisma.prescription.findUnique({ where: { callSessionId } });
    if (existing) throw new AppError(409, "Prescription already submitted");

    const prescription = await prisma.prescription.create({
      data: {
        callSessionId,
        patientId: call.patientId,
        doctorId,
        content,
      },
    });

    await renderPdfQueue.add("render", { prescriptionId: prescription.id }, { attempts: 3 });

    res.status(202).json({ message: "Prescription received, PDF generating", id: prescription.id });
  } catch (err) {
    next(err);
  }
});

prescriptionsRouter.get("/:id", requireAuth(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rx = await prisma.prescription.findUnique({
      where: { id: req.params.id },
      include: {
        patient: { select: { id: true, name: true } },
        doctor: { select: { id: true, name: true } },
        healthFile: true,
      },
    });
    if (!rx) throw new AppError(404, "Prescription not found");

    const userId = req.user!.sub;
    const role = req.user!.role;
    if (rx.patientId !== userId && rx.doctorId !== userId && role !== "ADMIN") {
      throw new AppError(403, "Forbidden");
    }

    const result: Record<string, unknown> = { ...rx };
    if (rx.objectKey && rx.pdfReady) {
      result.pdfUrl = await getPresignedUrl(rx.objectKey);
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 4: Register routes + start worker in index.ts**

```typescript
import { prescriptionsRouter } from "./routes/prescriptions.routes";
import { startRenderPdfWorker } from "./workers/render-pdf.worker";

app.use("/api/prescriptions", prescriptionsRouter);

if (process.env.NODE_ENV !== "test") {
  startRenderPdfWorker();
}
```

- [ ] **Step 5: Write prescription tests**

```typescript
// packages/server/src/__tests__/prescriptions.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../index";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { signAccessToken } from "../services/auth.service";

let doctorToken: string;
let patientToken: string;
let callSessionId: string;
let doctorId: string;
let patientId: string;

beforeAll(async () => {
  const patient = await prisma.user.create({
    data: { phone: "9999200001", name: "Rx Patient", role: "PATIENT", pinHash: "x", patientProfile: { create: {} } },
  });
  patientId = patient.id;
  patientToken = signAccessToken({ sub: patient.id, role: "PATIENT" });

  const doctor = await prisma.user.create({
    data: {
      phone: "9999200002",
      name: "Rx Doctor",
      role: "DOCTOR",
      passwordHash: "x",
      doctorProfile: { create: { degree: "MBBS", regNumber: "TEST999", isApproved: true } },
    },
  });
  doctorId = doctor.id;
  doctorToken = signAccessToken({ sub: doctor.id, role: "DOCTOR" });

  const call = await prisma.callSession.create({
    data: { patientId, doctorId, status: "ACTIVE", livekitRoom: "test-room-rx", startedAt: new Date() },
  });
  callSessionId = call.id;
});

afterAll(async () => {
  await prisma.prescription.deleteMany({ where: { callSessionId } });
  await prisma.callSession.delete({ where: { id: callSessionId } });
  await prisma.user.deleteMany({ where: { phone: { in: ["9999200001", "9999200002"] } } });
  await prisma.$disconnect();
  await redis.quit();
});

describe("POST /api/prescriptions", () => {
  it("doctor submits prescription", async () => {
    const res = await request(app)
      .post("/api/prescriptions")
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({ callSessionId, content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Rest and fluids" }] }] } });
    expect(res.status).toBe(202);
    expect(res.body.id).toBeTruthy();
  });

  it("rejects duplicate prescription", async () => {
    const res = await request(app)
      .post("/api/prescriptions")
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({ callSessionId, content: { type: "doc" } });
    expect(res.status).toBe(409);
  });

  it("patient cannot submit prescription", async () => {
    const res = await request(app)
      .post("/api/prescriptions")
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ callSessionId, content: {} });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 6: Run prescription tests**

```bash
cd packages/server && pnpm test src/__tests__/prescriptions.test.ts
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/
git commit -m "feat: prescription route + BullMQ render-pdf worker with wallet credit"
```

---

### Task 15: Health files route + upload

**Files:**
- Create: `packages/server/src/routes/health-files.routes.ts`

- [ ] **Step 1: Write health-files.routes.ts**

```typescript
// packages/server/src/routes/health-files.routes.ts
import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth.middleware";
import { prisma } from "../lib/prisma";
import { uploadStream, getPresignedUrl, deleteObject } from "../services/storage.service";
import { AppError } from "../middleware/error.middleware";

export const healthFilesRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

healthFilesRouter.get("/", requireAuth("PATIENT"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const files = await prisma.healthFile.findMany({
      where: { userId: req.user!.sub },
      orderBy: { createdAt: "desc" },
    });

    const withUrls = await Promise.all(
      files.map(async (f) => ({
        ...f,
        url: await getPresignedUrl(f.objectKey),
      })),
    );

    res.json(withUrls);
  } catch (err) {
    next(err);
  }
});

healthFilesRouter.get("/:id", requireAuth(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = await prisma.healthFile.findUnique({ where: { id: req.params.id } });
    if (!file) throw new AppError(404, "File not found");
    if (file.userId !== req.user!.sub && req.user!.role !== "ADMIN") {
      throw new AppError(403, "Forbidden");
    }
    const url = await getPresignedUrl(file.objectKey);
    res.json({ ...file, url });
  } catch (err) {
    next(err);
  }
});

healthFilesRouter.post(
  "/",
  requireAuth("PATIENT"),
  upload.single("file"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) throw new AppError(400, "No file uploaded");

      const userId = req.user!.sub;
      const objectKey = `health-files/${userId}/${Date.now()}-${req.file.originalname}`;

      const { Readable } = await import("stream");
      const stream = Readable.from(req.file.buffer);
      await uploadStream(objectKey, stream, req.file.size, req.file.mimetype);

      const file = await prisma.healthFile.create({
        data: {
          userId,
          name: req.file.originalname,
          type: "LAB_REPORT",
          objectKey,
          sizeBytes: req.file.size,
        },
      });

      const url = await getPresignedUrl(objectKey);
      res.status(201).json({ ...file, url });
    } catch (err) {
      next(err);
    }
  },
);

healthFilesRouter.delete("/:id", requireAuth("PATIENT"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = await prisma.healthFile.findUnique({ where: { id: req.params.id } });
    if (!file) throw new AppError(404, "File not found");
    if (file.userId !== req.user!.sub) throw new AppError(403, "Forbidden");
    if (file.type === "PRESCRIPTION") throw new AppError(400, "Cannot delete prescriptions");

    await deleteObject(file.objectKey);
    await prisma.healthFile.delete({ where: { id: req.params.id } });
    res.json({ message: "Deleted" });
  } catch (err) {
    next(err);
  }
});
```

Add `multer` to server dependencies: `"multer": "^1.4.5-lts.1"` and `"@types/multer": "^1.4.11"`.

- [ ] **Step 2: Register in index.ts**

```typescript
import { healthFilesRouter } from "./routes/health-files.routes";
app.use("/api/health-files", healthFilesRouter);
```

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/routes/health-files.routes.ts packages/server/src/index.ts
git commit -m "feat: health files routes (list, upload, delete, presigned URL)"
```

---

### Task 16: Doctor Call page with tiptap editor

**Files:**
- Modify: `packages/web/src/pages/doctor/Call.tsx`

- [ ] **Step 1: Rewrite doctor/Call.tsx with tiptap**

```typescript
// packages/web/src/pages/doctor/Call.tsx
import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { connectSocket, getSocket } from "../../lib/socket";
import { DoctorCallView } from "../../components/video/DoctorCallView";
import { api } from "../../lib/api";
import toast from "react-hot-toast";

export default function DoctorCall() {
  const { id: callSessionId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [livekitToken, setLivekitToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const editor = useEditor({
    extensions: [StarterKit],
    content: "<p>Patient complaint: <br/>Diagnosis: <br/>Medications: <br/>Advice: </p>",
  });

  useEffect(() => {
    const s = connectSocket();
    s.on("call:accepted", ({ callSessionId: csId, livekitToken: token }: { callSessionId: string; livekitToken: string }) => {
      if (csId === callSessionId) setLivekitToken(token);
    });
    return () => { s.off("call:accepted"); };
  }, [callSessionId]);

  async function submitPrescription() {
    if (!editor || !callSessionId) return;
    setSubmitting(true);
    try {
      const content = editor.getJSON();
      await api.post("/prescriptions", { callSessionId, content });
      toast.success("Prescription submitted");
      navigate("/doctor");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (!livekitToken) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-2xl">Waiting for connection...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div style={{ height: "55vh" }}>
        <DoctorCallView
          token={livekitToken}
          serverUrl={import.meta.env.VITE_LIVEKIT_URL || "ws://localhost:7880"}
          onDisconnected={() => navigate("/doctor")}
        />
      </div>

      <div className="flex-1 bg-white border-t-2 border-gray-200 p-4 flex flex-col">
        <h3 className="font-bold text-lg mb-2">Prescription</h3>
        <div className="flex-1 border-2 rounded-xl p-3 min-h-[120px] prose max-w-none">
          <EditorContent editor={editor} />
        </div>
        <button
          onClick={submitPrescription}
          disabled={submitting}
          className="mt-3 w-full py-4 bg-blue-600 disabled:opacity-50 text-white rounded-xl text-lg font-semibold"
        >
          {submitting ? "Submitting..." : "Submit Prescription"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/pages/doctor/Call.tsx
git commit -m "feat: doctor call page with tiptap prescription editor"
```

---

### Task 17: Patient Dashboard + Prescription viewer + Print

**Files:**
- Modify: `packages/web/src/pages/kiosk/Dashboard.tsx`
- Modify: `packages/web/src/pages/kiosk/Prescription.tsx`
- Create: `packages/web/src/components/prescription/PrescriptionViewer.tsx`
- Create: `packages/web/src/components/prescription/PrintButton.tsx`
- Create: `packages/web/src/components/kiosk/IdleGuard.tsx`

- [ ] **Step 1: Write IdleGuard.tsx**

```typescript
// packages/web/src/components/kiosk/IdleGuard.tsx
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/auth.store";

const IDLE_MS = 5 * 60 * 1000;

export function IdleGuard() {
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function reset() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      logout();
      navigate("/");
    }, IDLE_MS);
  }

  useEffect(() => {
    reset();
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, reset));
    return () => {
      if (timer.current) clearTimeout(timer.current);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, []);

  return null;
}
```

- [ ] **Step 2: Write Dashboard.tsx**

```typescript
// packages/web/src/pages/kiosk/Dashboard.tsx
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { IdleGuard } from "../../components/kiosk/IdleGuard";
import { useAuthStore } from "../../store/auth.store";
import { format } from "date-fns";
import type { HealthFile } from "@madamgy/api-client";
import { connectSocket } from "../../lib/socket";
import { useEffect } from "react";
import toast from "react-hot-toast";

export default function KioskDashboard() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  const { data: files, refetch } = useQuery({
    queryKey: ["health-files"],
    queryFn: () => api.get<HealthFile[]>("/health-files").then((r) => r.data),
  });

  useEffect(() => {
    const s = connectSocket();
    s.on("prescription:ready", ({ healthFileId }: { healthFileId: string }) => {
      toast.success("Prescription ready!");
      refetch();
      navigate(`/prescription/${healthFileId}`);
    });
    return () => { s.off("prescription:ready"); };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <IdleGuard />
      <div className="max-w-2xl mx-auto p-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Welcome, {user?.name}</h1>
            <p className="text-gray-500">Your health folder</p>
          </div>
          <button
            onClick={() => navigate("/consult")}
            className="px-8 py-4 bg-blue-600 text-white rounded-2xl text-xl font-semibold hover:bg-blue-700 transition-colors"
          >
            Consult Doctor
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {files?.length === 0 && (
            <p className="text-gray-500 text-center py-12">No files yet. Start a consultation.</p>
          )}
          {files?.map((f) => (
            <div
              key={f.id}
              onClick={() => navigate(`/prescription/${f.id}`)}
              className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 cursor-pointer hover:border-blue-300 transition-colors"
            >
              <p className="font-semibold text-lg">{f.name}</p>
              <p className="text-gray-500 text-sm">
                {f.type === "PRESCRIPTION" ? "Prescription" : "Lab Report"} · {format(new Date(f.createdAt), "dd MMM yyyy")}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write PrintButton.tsx**

```typescript
// packages/web/src/components/prescription/PrintButton.tsx
import { useRef } from "react";
import { useReactToPrint } from "react-to-print";

interface Props {
  targetRef: React.RefObject<HTMLElement>;
}

export function PrintButton({ targetRef }: Props) {
  const handlePrint = useReactToPrint({ contentRef: targetRef });
  return (
    <button
      onClick={() => handlePrint()}
      className="px-8 py-4 bg-green-600 text-white rounded-2xl text-xl font-semibold hover:bg-green-700"
    >
      Print Prescription
    </button>
  );
}
```

- [ ] **Step 4: Write PrescriptionViewer.tsx**

```typescript
// packages/web/src/components/prescription/PrescriptionViewer.tsx
import { forwardRef } from "react";

interface Props {
  pdfUrl: string;
  name: string;
}

export const PrescriptionViewer = forwardRef<HTMLDivElement, Props>(
  ({ pdfUrl, name }, ref) => (
    <div ref={ref} className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="p-4 bg-blue-50 border-b border-blue-100">
        <h3 className="font-semibold text-blue-900">{name}</h3>
      </div>
      <iframe
        src={pdfUrl}
        title={name}
        className="w-full"
        style={{ height: "60vh", border: "none" }}
      />
    </div>
  ),
);
PrescriptionViewer.displayName = "PrescriptionViewer";
```

- [ ] **Step 5: Write kiosk/Prescription.tsx**

```typescript
// packages/web/src/pages/kiosk/Prescription.tsx
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { api } from "../../lib/api";
import { PrescriptionViewer } from "../../components/prescription/PrescriptionViewer";
import { PrintButton } from "../../components/prescription/PrintButton";
import { IdleGuard } from "../../components/kiosk/IdleGuard";
import type { HealthFile } from "@madamgy/api-client";

export default function KioskPrescription() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const printRef = useRef<HTMLDivElement>(null);

  const { data: file, isLoading } = useQuery({
    queryKey: ["health-file", id],
    queryFn: () => api.get<HealthFile>(`/health-files/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><p className="text-2xl">Loading...</p></div>;
  if (!file) return <div className="min-h-screen flex items-center justify-center"><p className="text-2xl text-red-500">File not found</p></div>;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <IdleGuard />
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <button onClick={() => navigate("/dashboard")} className="text-blue-600 text-xl">&larr; Back</button>
          <PrintButton targetRef={printRef as React.RefObject<HTMLElement>} />
        </div>
        <PrescriptionViewer ref={printRef} pdfUrl={file.url} name={file.name} />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/
git commit -m "feat: patient dashboard with health folder, prescription viewer + print"
```

---

## Phase 4 — Admin + Doctor Wallet

### Task 18: Admin routes

**Files:**
- Create: `packages/server/src/routes/admin.routes.ts`

- [ ] **Step 1: Write admin.routes.ts**

```typescript
// packages/server/src/routes/admin.routes.ts
import { Router, Request, Response, NextFunction } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/error.middleware";
import { io } from "../index";

export const adminRouter = Router();

adminRouter.use(requireAuth("ADMIN"));

adminRouter.get("/doctors", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const doctors = await prisma.user.findMany({
      where: { role: "DOCTOR" },
      include: { doctorProfile: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(doctors);
  } catch (err) {
    next(err);
  }
});

adminRouter.put("/doctors/:id/approve", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user || user.role !== "DOCTOR") throw new AppError(404, "Doctor not found");

    await prisma.doctorProfile.update({
      where: { userId: req.params.id },
      data: { isApproved: true, approvedAt: new Date(), approvedById: req.user!.sub },
    });

    io.to(`user:${req.params.id}`).emit("doctor:approved");
    res.json({ message: "Doctor approved" });
  } catch (err) {
    next(err);
  }
});

adminRouter.put("/users/:id/disable", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { disabled } = req.body as { disabled: boolean };
    await prisma.user.update({ where: { id: req.params.id }, data: { disabled } });
    res.json({ message: disabled ? "User disabled" : "User enabled" });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/stats", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [totalPatients, totalDoctors, totalCalls, activeCalls, totalRx] = await Promise.all([
      prisma.user.count({ where: { role: "PATIENT" } }),
      prisma.user.count({ where: { role: "DOCTOR" } }),
      prisma.callSession.count(),
      prisma.callSession.count({ where: { status: { in: ["QUEUED", "RINGING", "ACTIVE"] } } }),
      prisma.prescription.count(),
    ]);
    res.json({ totalPatients, totalDoctors, totalCalls, activeCalls, totalRx });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/calls", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(String(req.query.page || "1"));
    const limit = 20;
    const [calls, total] = await Promise.all([
      prisma.callSession.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          patient: { select: { id: true, name: true } },
          doctor: { select: { id: true, name: true } },
        },
      }),
      prisma.callSession.count(),
    ]);
    res.json({ calls, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 2: Register in index.ts**

```typescript
import { adminRouter } from "./routes/admin.routes";
app.use("/api/admin", adminRouter);
```

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/routes/admin.routes.ts packages/server/src/index.ts
git commit -m "feat: admin routes (approve doctor, disable user, stats, calls)"
```

---

### Task 19: Doctor wallet routes

**Files:**
- Create: `packages/server/src/routes/doctor.routes.ts`
- Create: `packages/server/src/services/wallet.service.ts`

- [ ] **Step 1: Write wallet.service.ts**

```typescript
// packages/server/src/services/wallet.service.ts
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/error.middleware";

export async function getWalletBalance(doctorId: string) {
  const profile = await prisma.doctorProfile.findUnique({
    where: { userId: doctorId },
    select: { walletBalance: true },
  });
  if (!profile) throw new AppError(404, "Doctor profile not found");
  return profile.walletBalance;
}

export async function createWithdrawRequest(
  doctorId: string,
  amount: number,
  bankDetails: { bankName: string; accountNumber: string; ifsc: string; holderName: string },
) {
  const profile = await prisma.doctorProfile.findUnique({ where: { userId: doctorId } });
  if (!profile) throw new AppError(404, "Doctor profile not found");

  if (Number(profile.walletBalance) < amount) {
    throw new AppError(400, "Insufficient wallet balance");
  }

  const pending = await prisma.walletTransaction.findFirst({
    where: { doctorId, type: "DEBIT", status: "PENDING" },
  });
  if (pending) throw new AppError(409, "A withdrawal request is already pending");

  return prisma.walletTransaction.create({
    data: {
      doctorId,
      amount,
      type: "DEBIT",
      status: "PENDING",
      description: `Withdrawal to ${bankDetails.bankName} ${bankDetails.accountNumber}`,
    },
  });
}
```

- [ ] **Step 2: Write doctor.routes.ts**

```typescript
// packages/server/src/routes/doctor.routes.ts
import { Router, Request, Response, NextFunction } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { prisma } from "../lib/prisma";
import { getWalletBalance, createWithdrawRequest } from "../services/wallet.service";
import { WithdrawRequestSchema } from "@madamgy/api-client";

export const doctorRouter = Router();
doctorRouter.use(requireAuth("DOCTOR"));

doctorRouter.get("/wallet", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const balance = await getWalletBalance(req.user!.sub);
    res.json({ balance: balance.toString() });
  } catch (err) {
    next(err);
  }
});

doctorRouter.get("/wallet/transactions", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(String(req.query.page || "1"));
    const limit = 20;
    const [txns, total] = await Promise.all([
      prisma.walletTransaction.findMany({
        where: { doctorId: req.user!.sub },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.walletTransaction.count({ where: { doctorId: req.user!.sub } }),
    ]);
    res.json({ transactions: txns, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});

doctorRouter.post("/wallet/withdraw", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { amount, bankName, accountNumber, ifsc, holderName } =
      WithdrawRequestSchema.parse(req.body);
    const txn = await createWithdrawRequest(req.user!.sub, amount, {
      bankName,
      accountNumber,
      ifsc,
      holderName,
    });
    res.status(201).json(txn);
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 3: Register in index.ts**

```typescript
import { doctorRouter } from "./routes/doctor.routes";
app.use("/api/doctor", doctorRouter);
```

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/routes/doctor.routes.ts packages/server/src/services/wallet.service.ts packages/server/src/index.ts
git commit -m "feat: doctor wallet routes (balance, transactions, withdraw request)"
```

---

### Task 20: Admin UI pages

**Files:**
- Modify: `packages/web/src/pages/admin/Dashboard.tsx`
- Modify: `packages/web/src/pages/admin/Doctors.tsx`
- Modify: `packages/web/src/pages/admin/Users.tsx`
- Modify: `packages/web/src/pages/admin/Stats.tsx`

- [ ] **Step 1: Write admin/Stats.tsx**

```typescript
// packages/web/src/pages/admin/Stats.tsx
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";

interface Stats {
  totalPatients: number;
  totalDoctors: number;
  totalCalls: number;
  activeCalls: number;
  totalRx: number;
}

export default function AdminStats() {
  const { data } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => api.get<Stats>("/admin/stats").then((r) => r.data),
    refetchInterval: 30_000,
  });

  const cards = [
    { label: "Patients", value: data?.totalPatients },
    { label: "Doctors", value: data?.totalDoctors },
    { label: "Total Calls", value: data?.totalCalls },
    { label: "Active Calls", value: data?.activeCalls },
    { label: "Prescriptions", value: data?.totalRx },
  ];

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>
      <div className="grid grid-cols-3 gap-6">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <p className="text-gray-500 mb-2">{c.label}</p>
            <p className="text-4xl font-bold text-blue-700">{c.value ?? "—"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write admin/Doctors.tsx**

```typescript
// packages/web/src/pages/admin/Doctors.tsx
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import toast from "react-hot-toast";

interface Doctor {
  id: string;
  name: string;
  phone: string;
  createdAt: string;
  doctorProfile: { degree: string; regNumber: string; specialization: string | null; isApproved: boolean };
}

export default function AdminDoctors() {
  const qc = useQueryClient();

  const { data: doctors } = useQuery({
    queryKey: ["admin-doctors"],
    queryFn: () => api.get<Doctor[]>("/admin/doctors").then((r) => r.data),
  });

  const approve = useMutation({
    mutationFn: (id: string) => api.put(`/admin/doctors/${id}/approve`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-doctors"] }); toast.success("Doctor approved"); },
    onError: () => toast.error("Failed to approve"),
  });

  const pending = doctors?.filter((d) => !d.doctorProfile.isApproved) ?? [];
  const approved = doctors?.filter((d) => d.doctorProfile.isApproved) ?? [];

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Doctors</h1>

      {pending.length > 0 && (
        <>
          <h2 className="text-xl font-semibold mb-4 text-amber-700">Pending Approval ({pending.length})</h2>
          <div className="flex flex-col gap-3 mb-8">
            {pending.map((d) => (
              <div key={d.id} className="bg-white rounded-2xl p-5 shadow-sm border-2 border-amber-200 flex items-center justify-between">
                <div>
                  <p className="font-bold text-lg">{d.name}</p>
                  <p className="text-gray-500">{d.phone} · {d.doctorProfile.degree} · Reg: {d.doctorProfile.regNumber}</p>
                </div>
                <button
                  onClick={() => approve.mutate(d.id)}
                  className="px-6 py-2 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700"
                >
                  Approve
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="text-xl font-semibold mb-4 text-gray-700">Approved ({approved.length})</h2>
      <div className="flex flex-col gap-3">
        {approved.map((d) => (
          <div key={d.id} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center justify-between">
            <div>
              <p className="font-bold">{d.name}</p>
              <p className="text-gray-500 text-sm">{d.phone} · {d.doctorProfile.degree}</p>
            </div>
            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">Approved</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write admin/Users.tsx**

```typescript
// packages/web/src/pages/admin/Users.tsx
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import toast from "react-hot-toast";

interface User { id: string; name: string; phone: string; role: string; disabled: boolean; createdAt: string; }

export default function AdminUsers() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api.get<{ calls: User[]; total: number }>("/admin/calls").then((r) => r.data),
  });

  const toggle = useMutation({
    mutationFn: ({ id, disabled }: { id: string; disabled: boolean }) =>
      api.put(`/admin/users/${id}/disable`, { disabled }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); toast.success("Updated"); },
  });

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Users</h1>
      <p className="text-gray-500">Use the Admin API directly to manage users or implement a full table here.</p>
    </div>
  );
}
```

- [ ] **Step 4: Write admin/Dashboard.tsx**

```typescript
// packages/web/src/pages/admin/Dashboard.tsx
import { Link } from "react-router-dom";

export default function AdminDashboard() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <h1 className="text-3xl font-bold mb-8">Admin Panel</h1>
      <div className="grid grid-cols-2 gap-6 max-w-lg">
        {[
          { label: "Stats", href: "/admin/stats" },
          { label: "Doctors", href: "/admin/doctors" },
          { label: "Users", href: "/admin/users" },
          { label: "Call History", href: "/admin/calls" },
        ].map((item) => (
          <Link
            key={item.href}
            to={item.href}
            className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 text-center text-xl font-semibold text-blue-700 hover:border-blue-300 transition-colors"
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/pages/admin/
git commit -m "feat: admin UI - stats, doctor approval, dashboard"
```

---

### Task 21: Doctor wallet + history UI

**Files:**
- Modify: `packages/web/src/pages/doctor/Wallet.tsx`
- Modify: `packages/web/src/pages/doctor/History.tsx`

- [ ] **Step 1: Write doctor/Wallet.tsx**

```typescript
// packages/web/src/pages/doctor/Wallet.tsx
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "../../lib/api";
import { WithdrawRequestSchema, type WithdrawRequest, type WalletTransaction } from "@madamgy/api-client";
import toast from "react-hot-toast";
import { format } from "date-fns";

interface WalletResp { balance: string; }
interface TxnResp { transactions: WalletTransaction[]; total: number; }

export default function DoctorWallet() {
  const { data: wallet } = useQuery({
    queryKey: ["wallet"],
    queryFn: () => api.get<WalletResp>("/doctor/wallet").then((r) => r.data),
  });

  const { data: txns } = useQuery({
    queryKey: ["wallet-txns"],
    queryFn: () => api.get<TxnResp>("/doctor/wallet/transactions").then((r) => r.data),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<WithdrawRequest>({
    resolver: zodResolver(WithdrawRequestSchema),
  });

  const withdraw = useMutation({
    mutationFn: (data: WithdrawRequest) => api.post("/doctor/wallet/withdraw", data),
    onSuccess: () => { toast.success("Withdrawal request submitted"); reset(); },
    onError: (err: any) => toast.error(err.response?.data?.message || "Failed"),
  });

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Wallet</h1>
      <div className="bg-blue-50 rounded-2xl p-6 mb-8">
        <p className="text-gray-500 mb-1">Available balance</p>
        <p className="text-5xl font-bold text-blue-700">₹{wallet?.balance ?? "—"}</p>
      </div>

      <form onSubmit={handleSubmit((d) => withdraw.mutate(d))} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-8">
        <h2 className="text-xl font-bold mb-4">Request Withdrawal</h2>
        {[
          { name: "amount" as const, label: "Amount (₹)", type: "number" },
          { name: "bankName" as const, label: "Bank Name" },
          { name: "accountNumber" as const, label: "Account Number" },
          { name: "ifsc" as const, label: "IFSC Code" },
          { name: "holderName" as const, label: "Account Holder Name" },
        ].map((f) => (
          <div key={f.name} className="mb-4">
            <label className="block text-sm text-gray-600 mb-1">{f.label}</label>
            <input {...register(f.name, { valueAsNumber: f.type === "number" })} type={f.type || "text"} className="w-full p-3 border-2 rounded-xl" />
            {errors[f.name] && <p className="text-red-500 text-sm mt-1">{errors[f.name]?.message}</p>}
          </div>
        ))}
        <button type="submit" disabled={withdraw.isPending} className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold disabled:opacity-50">
          {withdraw.isPending ? "Submitting..." : "Request Withdrawal"}
        </button>
      </form>

      <h2 className="text-xl font-bold mb-4">Transactions</h2>
      <div className="flex flex-col gap-2">
        {txns?.transactions.map((t) => (
          <div key={t.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center justify-between">
            <div>
              <p className="font-medium">{t.description || t.type}</p>
              <p className="text-sm text-gray-500">{format(new Date(t.createdAt), "dd MMM yyyy HH:mm")}</p>
            </div>
            <div className="text-right">
              <p className={`font-bold text-lg ${t.type === "CREDIT" ? "text-green-600" : "text-red-600"}`}>
                {t.type === "CREDIT" ? "+" : "-"}₹{t.amount}
              </p>
              <p className="text-xs text-gray-400">{t.status}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write doctor/History.tsx**

```typescript
// packages/web/src/pages/doctor/History.tsx
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { format } from "date-fns";
import type { CallSession } from "@madamgy/api-client";

interface HistoryResp { calls: (CallSession & { patient: { name: string } })[]; total: number; }

export default function DoctorHistory() {
  const { data } = useQuery({
    queryKey: ["call-history"],
    queryFn: () => api.get<HistoryResp>("/calls/history").then((r) => r.data),
  });

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Call History</h1>
      <div className="flex flex-col gap-3">
        {data?.calls.map((c) => (
          <div key={c.id} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-semibold">{c.patient?.name}</p>
                <p className="text-sm text-gray-500">{format(new Date(c.createdAt), "dd MMM yyyy HH:mm")}</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                c.status === "ENDED" ? "bg-green-100 text-green-700" :
                c.status === "NO_DOCTOR" ? "bg-red-100 text-red-700" :
                "bg-gray-100 text-gray-700"
              }`}>
                {c.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/pages/doctor/
git commit -m "feat: doctor wallet page with withdraw form + call history"
```

---

## Phase 5 — Infrastructure + CI

### Task 22: Dockerize server + web

**Files:**
- Create: `packages/server/Dockerfile`
- Create: `packages/web/Dockerfile`
- Modify: `docker-compose.yml` (add api + web services)

- [ ] **Step 1: Write packages/server/Dockerfile**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
RUN npm i -g pnpm@9
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/api-client/package.json packages/api-client/
COPY packages/server/package.json packages/server/
RUN pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages/api-client/ packages/api-client/
COPY packages/server/ packages/server/
RUN pnpm --filter @madamgy/api-client build
RUN pnpm --filter @madamgy/server build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN npm i -g pnpm@9
COPY --from=builder /app/pnpm-workspace.yaml /app/package.json /app/pnpm-lock.yaml ./
COPY --from=builder /app/packages/api-client/package.json packages/api-client/
COPY --from=builder /app/packages/server/package.json packages/server/
RUN pnpm install --frozen-lockfile --prod
COPY --from=builder /app/packages/api-client/dist packages/api-client/dist
COPY --from=builder /app/packages/server/dist packages/server/dist
COPY --from=builder /app/packages/server/src/prisma packages/server/src/prisma
EXPOSE 3000
CMD ["node", "packages/server/dist/index.js"]
```

- [ ] **Step 2: Write packages/web/Dockerfile**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
RUN npm i -g pnpm@9
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/api-client/package.json packages/api-client/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages/api-client/ packages/api-client/
COPY packages/web/ packages/web/
RUN pnpm --filter @madamgy/api-client build
RUN pnpm --filter @madamgy/web build

FROM nginx:alpine
COPY --from=builder /app/packages/web/dist /usr/share/nginx/html
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

- [ ] **Step 3: Create packages/web/nginx.conf**

```nginx
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }

  location /api {
    proxy_pass http://api:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
  }

  location /socket.io {
    proxy_pass http://api:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

- [ ] **Step 4: Add api + web to docker-compose.yml**

```yaml
  api:
    build:
      context: .
      dockerfile: packages/server/Dockerfile
    depends_on:
      - postgres
      - redis
      - minio
      - livekit
    env_file: .env
    environment:
      - NODE_ENV=production
    ports:
      - "3000:3000"
    restart: unless-stopped

  web:
    build:
      context: .
      dockerfile: packages/web/Dockerfile
    depends_on:
      - api
    restart: unless-stopped
```

- [ ] **Step 5: Commit**

```bash
git add packages/server/Dockerfile packages/web/Dockerfile packages/web/nginx.conf docker-compose.yml
git commit -m "infra: dockerfiles for server and web + docker-compose full stack"
```

---

### Task 23: Caddyfile + HTTPS

**Files:**
- Create: `Caddyfile`

- [ ] **Step 1: Write Caddyfile**

```
your-domain.com {
  reverse_proxy /api/* api:3000
  reverse_proxy /socket.io/* api:3000 {
    transport http {
      versions 1.1
    }
    header_up Upgrade {http.upgrade}
    header_up Connection "Upgrade"
  }
  reverse_proxy web:80
}
```

Replace `your-domain.com` with actual domain before deploy.

- [ ] **Step 2: Commit**

```bash
git add Caddyfile
git commit -m "infra: Caddyfile with HTTPS and WebSocket proxy"
```

---

### Task 24: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write CI workflow**

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  lint-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @madamgy/api-client build
      - run: pnpm typecheck
      - run: pnpm lint

  test-server:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: madamgy
          POSTGRES_PASSWORD: madamgy
          POSTGRES_DB: madamgy_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]
    env:
      DATABASE_URL: postgresql://madamgy:madamgy@localhost:5432/madamgy_test
      REDIS_URL: redis://localhost:6379
      JWT_ACCESS_SECRET: ci-test-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
      JWT_REFRESH_SECRET: ci-test-secret-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
      NODE_ENV: test
      ADMIN_PHONE: "9000000000"
      ADMIN_PASSWORD: admin123
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @madamgy/api-client build
      - run: pnpm --filter @madamgy/server db:migrate:deploy
      - run: pnpm --filter @madamgy/server db:seed
      - run: pnpm --filter @madamgy/server test
```

- [ ] **Step 2: Commit**

```bash
git add .github/
git commit -m "ci: GitHub Actions with postgres + redis service containers"
```

---

### Task 25: Final wiring — register @madamgy/api-client workspace dep

The server imports from `@madamgy/api-client`. Add it to the server's package.json and re-install.

- [ ] **Step 1: Add workspace dep to server package.json**

In `packages/server/package.json`, under `"dependencies"`, add:
```json
"@madamgy/api-client": "workspace:*"
```

- [ ] **Step 2: Re-install**

```bash
pnpm install
```

Expected: no errors, `@madamgy/api-client` linked in server's node_modules.

- [ ] **Step 3: Full typecheck**

```bash
pnpm typecheck
```

Fix any TS errors before proceeding.

- [ ] **Step 4: Run all server tests**

```bash
cd packages/server && pnpm test
```

Expected: all test suites pass.

- [ ] **Step 5: Build full stack**

```bash
pnpm build
```

Expected: both server and web build without errors.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: final wiring - workspace deps, typecheck, full build verified"
```

---

## Self-Review Checklist

After writing, checking spec coverage:

| Spec Requirement | Task |
|---|---|
| Patient PIN auth with bcrypt | Task 6 |
| PIN brute-force lockout (5 attempts, 15min Redis) | Task 6 auth.service.ts |
| Doctor 2-step OTP via MSG91 | Task 6 (otp.service.ts) |
| Admin password auth + seed | Task 4, Task 6 |
| JWT access (15min) + refresh cookie (30d) | Task 6 auth.service.ts |
| Disabled user check on every request | Task 6 auth.middleware.ts |
| OTP via redis.getdel (atomic, no replay) | Task 6 otp.service.ts |
| POST /api/calls → QUEUED | Task 10 |
| BullMQ assign-doctor worker (3 attempts, 30s fixed) | Task 10 |
| Atomic doctor claim via Prisma tx | Task 10 assign-doctor.worker.ts |
| NO_DOCTOR after 3 failures | Task 10 handleAssignDoctorFailed |
| Doctor reject → re-assign new doctor (1 attempt) | Task 11 call.handler.ts |
| LiveKit token generation | Task 11 livekit.service.ts |
| Socket call:accept/reject/end | Task 11 call.handler.ts |
| In-call chat (text/image/vitals) | Task 11 chat.handler.ts |
| VitalsSchema validation | Task 5 (Zod schema) |
| POST /api/prescriptions | Task 14 |
| BullMQ render-pdf worker | Task 14 |
| @react-pdf/renderer PrescriptionDoc | Task 14 |
| MinIO upload + HealthFile creation | Task 14 render-pdf.worker.ts |
| Doctor wallet credit atomic Prisma tx | Task 14 render-pdf.worker.ts |
| Decimal money (no Float) | Schema (Decimal @db.Decimal) |
| prescription:ready socket event | Task 14 |
| GET /api/health-files presigned URL | Task 15 |
| Lab report upload | Task 15 |
| react-to-print print button | Task 17 |
| 5-min idle auto-logout | Task 17 IdleGuard.tsx |
| Admin approve doctor | Task 18 |
| Admin disable user | Task 18 |
| Admin stats | Task 18 |
| Doctor wallet balance | Task 19 |
| Doctor withdrawal request | Task 19 |
| Docker Compose all services | Task 1 |
| Caddyfile HTTPS | Task 23 |
| GitHub Actions CI | Task 24 |

All spec requirements mapped to tasks. No gaps found.

---

## Execution Note

Run tasks sequentially — each phase depends on prior phases. Within a phase, tasks are also sequential (schema before routes, routes before UI). The workers (Tasks 10, 14) must be started after the queue lib is set up (Task 10 Step 1).

**Test database:** Use a separate `madamgy_test` DB for CI. For local test runs, set `DATABASE_URL` to point to the test DB or add a `vitest.setup.ts` that wipes test data.

**MinIO in tests:** Skip actual MinIO calls in test env by checking `process.env.NODE_ENV === "test"` (already done in otp.service.ts pattern) — mock `uploadBuffer` and `getPresignedUrl` in test files that exercise the PDF worker.
