# Roles, Kiosk Attribution & Revenue Wallet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the existing 3-role/2-way-split system into 4-role/3-way-split — split `ADMIN` into `SUPER_ADMIN` (full power) and a new `ADMIN` (kiosk owner), give both a payable wallet, and attribute each consult's revenue split (doctor 65% / admin 25% / super-admin 10%, all runtime-configurable) based on whether the booking came from a registered kiosk device.

**Architecture:** Extends existing infrastructure rather than replacing it — same `WalletTransaction`/withdrawal ledger, same `requireAuth(...roles)` middleware, same `prisma.$transaction` call-completion pattern. Three additive pieces: a `RevenueConfig` singleton row (replaces env-var fee + per-doctor commission), a `Kiosk` device-registration table (device → admin binding, resolved server-side, never client-asserted), and snapshot columns on `Payment` so historical splits never drift when config changes later.

**Tech Stack:** Express, Prisma/PostgreSQL, Zod (via `@madamgy/api-client`), Vitest + Supertest, existing bcrypt/JWT auth.

## Global Constraints

- No hardcoded fee or split percentages anywhere in application code after this plan — all three percentages and the fee live in `RevenueConfig`, editable only by `SUPER_ADMIN`, validated to sum to 100.
- Every `Payment` snapshots the fee + split that applied at charge time. Changing `RevenueConfig` later must never alter the credited amounts of already-completed calls.
- The client never asserts an admin identity for kiosk attribution — only an opaque `deviceId`. Attribution is always resolved server-side from a `Kiosk` row created by an authenticated `ADMIN` action.
- Money/config/approval endpoints (`revenue-config`, `staff`, doctor approval, withdrawal approval) are `SUPER_ADMIN`-only. Shared operational endpoints (users list, calls list, stats, audit log) accept both `SUPER_ADMIN` and `ADMIN`. Clinical-document endpoints (prescriptions, health files, single-user detail with nested records) stay `SUPER_ADMIN`-only — narrower than the general operational split, since kiosk `ADMIN`'s job is booking/account-ops, not clinical record access.
- `SUPER_ADMIN`'s 10% share is never wallet-tracked — no `WalletTransaction`, no withdrawal. It's read straight off `Payment` for reporting.
- Existing tests must keep passing with mechanical role-string updates only (`"ADMIN"` → `"SUPER_ADMIN"` wherever today's admin is meant); no test's asserted behavior should change because of the rename itself.

---

### Task 1: Schema migration — role split, wallet fields, new models

**Files:**
- Modify: `packages/server/src/prisma/schema.prisma`
- Modify: `packages/server/src/prisma/seed.ts`
- Modify: `packages/server/src/routes/doctor.routes.ts:58-76`
- Create: `packages/server/src/prisma/migrations/<timestamp>_role_split_and_wallet_rework/migration.sql`
- Test: `packages/server/src/__tests__/call-completion.test.ts` (field rename only, see Task 8)

**Interfaces:**
- Produces: `UserRole` enum values `PATIENT | DOCTOR | ADMIN | SUPER_ADMIN`; `User.walletBalance: Decimal`; `WalletTransaction.userId: string` (renamed from `doctorId`); `Kiosk` model; `RevenueConfig` model; `Payment.doctorPct/adminPct/superAdminPct: Decimal | null`; `CallSession.assistingAdminId: string | null`.

- [ ] **Step 1: Edit `schema.prisma` — role enum and wallet field moves**

Replace the `UserRole` enum:

```prisma
enum UserRole {
  PATIENT
  DOCTOR
  ADMIN
  SUPER_ADMIN
}
```

Update `User` model (add `walletBalance`, new relations):

```prisma
model User {
  id           String   @id @default(cuid())
  phone        String   @unique
  name         String
  role         UserRole @default(PATIENT)
  pinHash      String?
  passwordHash String?
  disabled     Boolean  @default(false)
  walletBalance Decimal @default(0) @db.Decimal(12, 2)
  createdAt    DateTime @default(now())

  patientProfile Patient Profile?
  doctorProfile  DoctorProfile?
  healthFiles    HealthFile[]
  prescriptions  Prescription[]      @relation("patient_prescriptions")
  doctorRx       Prescription[]      @relation("doctor_prescriptions")
  callsAsPatient CallSession[]       @relation("patient_calls")
  callsAsDoctor  CallSession[]       @relation("doctor_calls")
  callsAssisted  CallSession[]       @relation("assisting_admin_calls")
  walletTxns     WalletTransaction[]
  chatMessages   ChatMessage[]
  payments       Payment[]
  auditLogs      AuditLog[]
  kiosks         Kiosk[]
  revenueConfigUpdates RevenueConfig[]
}
```

(Note the `Patient Profile?` above has a stray space — write it as `PatientProfile?`, matching the existing field name exactly.)

Update `DoctorProfile` (drop `walletBalance` and `commissionRate`):

```prisma
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
  licenseDocKey  String?

  user User @relation(fields: [userId], references: [id])

  @@index([isAvailable])
}
```

Update `WalletTransaction` (`doctorId` → `userId`):

```prisma
model WalletTransaction {
  id            String    @id @default(cuid())
  userId        String
  callSessionId String?
  amount        Decimal   @db.Decimal(10, 2)
  type          TxnType
  status        TxnStatus @default(PENDING)
  description   String?
  createdAt     DateTime  @default(now())

  user User @relation(fields: [userId], references: [id])

  @@index([userId, createdAt])
}
```

Update `CallSession` (add `assistingAdminId`):

```prisma
model CallSession {
  id                String     @id @default(cuid())
  patientId         String
  doctorId          String?
  assistingAdminId  String?
  status            CallStatus @default(QUEUED)
  livekitRoom       String     @unique
  queuedAt          DateTime   @default(now())
  startedAt         DateTime?
  endedAt           DateTime?
  createdAt         DateTime   @default(now())

  patient        User          @relation("patient_calls", fields: [patientId], references: [id])
  doctor         User?         @relation("doctor_calls", fields: [doctorId], references: [id])
  assistingAdmin User?         @relation("assisting_admin_calls", fields: [assistingAdminId], references: [id])
  prescription   Prescription?
  messages       ChatMessage[]
  payment        Payment?

  @@index([patientId])
  @@index([status])
}
```

Update `Payment` (add snapshot columns, nullable — pre-migration rows have no split to snapshot):

```prisma
model Payment {
  id                String        @id @default(cuid())
  patientId         String
  callSessionId     String?       @unique
  amount            Decimal       @db.Decimal(10, 2)
  razorpayOrderId   String        @unique
  razorpayPaymentId String?
  status            PaymentStatus @default(CREATED)
  doctorPct         Decimal?      @db.Decimal(5, 2)
  adminPct          Decimal?      @db.Decimal(5, 2)
  superAdminPct     Decimal?      @db.Decimal(5, 2)
  createdAt         DateTime      @default(now())

  patient     User         @relation(fields: [patientId], references: [id])
  callSession CallSession? @relation(fields: [callSessionId], references: [id])

  @@index([patientId])
}
```

Add two new models at the end of the file:

```prisma
model Kiosk {
  id        String   @id @default(cuid())
  deviceId  String   @unique
  adminId   String
  label     String?
  active    Boolean  @default(true)
  createdAt DateTime @default(now())

  admin User @relation(fields: [adminId], references: [id])

  @@index([adminId])
}

model RevenueConfig {
  id              String   @id @default(cuid())
  consultationFee Decimal  @db.Decimal(10, 2)
  doctorPct       Decimal  @db.Decimal(5, 2)
  adminPct        Decimal  @db.Decimal(5, 2)
  superAdminPct   Decimal  @db.Decimal(5, 2)
  updatedAt       DateTime @updatedAt
  updatedById     String

  updatedBy User @relation(fields: [updatedById], references: [id])
}
```

- [ ] **Step 2: Generate a create-only migration**

Run: `cd packages/server && DATABASE_URL=postgresql://madamgy:madamgy@localhost:55432/madamgy npx prisma migrate dev --schema src/prisma/schema.prisma --name role_split_and_wallet_rework --create-only`

Expected: a new folder under `src/prisma/migrations/` with a `migration.sql` inside, not yet applied.

- [ ] **Step 3: Replace the generated SQL**

Prisma's auto-diff cannot express an enum value rename (it will try to drop `ADMIN` and fail since existing rows use it). Overwrite the generated `migration.sql` entirely with:

```sql
-- Role split: existing full-power ADMIN becomes SUPER_ADMIN, new narrower ADMIN added for kiosk owners
ALTER TYPE "UserRole" RENAME VALUE 'ADMIN' TO 'SUPER_ADMIN';
ALTER TYPE "UserRole" ADD VALUE 'ADMIN';

-- Wallet: every payable role (DOCTOR, ADMIN) now has a balance directly on User
ALTER TABLE "User" ADD COLUMN "walletBalance" DECIMAL(12,2) NOT NULL DEFAULT 0;

UPDATE "User" u
SET "walletBalance" = dp."walletBalance"
FROM "DoctorProfile" dp
WHERE dp."userId" = u.id;

ALTER TABLE "DoctorProfile" DROP COLUMN "walletBalance";
ALTER TABLE "DoctorProfile" DROP COLUMN "commissionRate";

-- WalletTransaction now belongs to either a doctor or an admin
ALTER TABLE "WalletTransaction" RENAME COLUMN "doctorId" TO "userId";

-- Kiosk device registration: opaque deviceId bound to an admin, resolved server-side only
CREATE TABLE "Kiosk" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "label" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Kiosk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Kiosk_deviceId_key" ON "Kiosk"("deviceId");
CREATE INDEX "Kiosk_adminId_idx" ON "Kiosk"("adminId");

ALTER TABLE "Kiosk" ADD CONSTRAINT "Kiosk_adminId_fkey"
    FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Revenue config: single row, runtime-editable, replaces CONSULTATION_FEE env var + per-doctor commissionRate
CREATE TABLE "RevenueConfig" (
    "id" TEXT NOT NULL,
    "consultationFee" DECIMAL(10,2) NOT NULL,
    "doctorPct" DECIMAL(5,2) NOT NULL,
    "adminPct" DECIMAL(5,2) NOT NULL,
    "superAdminPct" DECIMAL(5,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT NOT NULL,

    CONSTRAINT "RevenueConfig_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "RevenueConfig" ADD CONSTRAINT "RevenueConfig_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Payment: snapshot the split that applied at charge time (nullable — pre-existing rows predate this model)
ALTER TABLE "Payment" ADD COLUMN "doctorPct" DECIMAL(5,2);
ALTER TABLE "Payment" ADD COLUMN "adminPct" DECIMAL(5,2);
ALTER TABLE "Payment" ADD COLUMN "superAdminPct" DECIMAL(5,2);

-- CallSession: which kiosk admin, if any, this booking is attributed to
ALTER TABLE "CallSession" ADD COLUMN "assistingAdminId" TEXT;
ALTER TABLE "CallSession" ADD CONSTRAINT "CallSession_assistingAdminId_fkey"
    FOREIGN KEY ("assistingAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 4: Apply the migration and regenerate the client**

Run: `cd packages/server && DATABASE_URL=postgresql://madamgy:madamgy@localhost:55432/madamgy npx prisma migrate dev --schema src/prisma/schema.prisma`
Expected: `The following migration(s) have been applied` followed by the new migration's folder name, then `Generated Prisma Client`.

- [ ] **Step 5: Update the seed script — role rename + initial RevenueConfig**

Replace `packages/server/src/prisma/seed.ts` in full:

```typescript
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const phone = process.env.ADMIN_PHONE;
  const password = process.env.ADMIN_PASSWORD;

  if (!phone || !password) {
    throw new Error("ADMIN_PHONE and ADMIN_PASSWORD env vars required");
  }

  let superAdmin = await prisma.user.findUnique({ where: { phone } });
  if (!superAdmin) {
    const passwordHash = await bcrypt.hash(password, 12);
    superAdmin = await prisma.user.create({
      data: { phone, name: "Super Admin", role: "SUPER_ADMIN", passwordHash },
    });
    console.log(`Super admin created: ${phone}`);
  } else {
    console.log("Super admin already exists, skipping user seed");
  }

  const existingConfig = await prisma.revenueConfig.findFirst();
  if (!existingConfig) {
    const consultationFee = Number(process.env.CONSULTATION_FEE ?? "200");
    await prisma.revenueConfig.create({
      data: {
        consultationFee,
        doctorPct: 65,
        adminPct: 25,
        superAdminPct: 10,
        updatedById: superAdmin.id,
      },
    });
    console.log(`Revenue config seeded: fee=${consultationFee}, split=65/25/10`);
  } else {
    console.log("Revenue config already exists, skipping");
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 6: Fix the one direct-Prisma reference to the renamed field**

`packages/server/src/routes/doctor.routes.ts:58-76` queries `WalletTransaction` directly (not through `wallet.service.ts`) and will fail to compile once `doctorId` is renamed to `userId`. Update lines 63 and 69:

```typescript
doctorRouter.get("/wallet/transactions", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(Number(req.query.page ?? "1"), 1);
    const limit = 20;
    const [transactions, total] = await Promise.all([
      prisma.walletTransaction.findMany({
        where: { userId: req.user!.sub },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.walletTransaction.count({ where: { userId: req.user!.sub } }),
    ]);

    res.json({ transactions, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    next(error);
  }
});
```

- [ ] **Step 7: Run the seed and verify**

Run: `cd packages/server && DATABASE_URL=postgresql://madamgy:madamgy@localhost:55432/madamgy ADMIN_PHONE=9000000000 ADMIN_PASSWORD=admin123 npm run db:seed`
Expected: `Super admin created: 9000000000` and `Revenue config seeded: fee=200, split=65/25/10` (or `already exists, skipping` on repeat runs).

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/prisma/schema.prisma packages/server/src/prisma/seed.ts packages/server/src/prisma/migrations packages/server/src/routes/doctor.routes.ts
git commit -m "feat: split ADMIN into SUPER_ADMIN/ADMIN, add Kiosk and RevenueConfig models"
```

---

### Task 2: Staff login generalization

**Files:**
- Modify: `packages/server/src/services/auth.service.ts:167-182`
- Modify: `packages/server/src/routes/auth.routes.ts:220-235`
- Modify: `packages/server/src/__tests__/auth.test.ts:45-53,466-478`

**Interfaces:**
- Consumes: `UserRole` from Task 1 (`"ADMIN" | "SUPER_ADMIN"` both valid staff logins).
- Produces: `loginStaff(phone: string, password: string): Promise<User>` (replaces `loginAdmin`) — accepts either `ADMIN` or `SUPER_ADMIN`.

- [ ] **Step 1: Rename and broaden `loginAdmin` in `auth.service.ts`**

Replace the function at lines 167-182:

```typescript
export async function loginStaff(phone: string, password: string) {
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") || !user.passwordHash) {
    throw new AppError(401, "Invalid credentials");
  }
  if (user.disabled) {
    throw new AppError(403, "Account disabled");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new AppError(401, "Invalid credentials");
  }

  return user;
}
```

- [ ] **Step 2: Update the route wiring in `auth.routes.ts`**

Change the import of `loginAdmin` to `loginStaff`, and in the handler at lines 220-235 replace `const user = await loginAdmin(phone, password);` with `const user = await loginStaff(phone, password);`. Route path `/admin/login` and the `AdminLoginSchema` stay as-is — no request/response shape change, just which roles it accepts.

- [ ] **Step 3: Update `auth.test.ts` seed data and assertions**

At lines 45-53, the test-seeded staff user's `role: "ADMIN"` becomes `role: "SUPER_ADMIN"`. At line 472, `expect(response.body.user.role).toBe("ADMIN")` becomes `expect(response.body.user.role).toBe("SUPER_ADMIN")`.

- [ ] **Step 4: Add a new-ADMIN-role login test**

Add to `auth.test.ts`, in the same `describe` block as the existing `/admin/login` tests:

```typescript
it("logs in a kiosk ADMIN through the same /admin/login route", async () => {
  const passwordHash = await bcrypt.hash("kiosk-pass-123", 12);
  const kioskAdmin = await prisma.user.create({
    data: { phone: "8888700001", name: "Kiosk Admin", role: "ADMIN", passwordHash },
  });

  const response = await request(app).post("/api/auth/admin/login").send({
    phone: "8888700001",
    password: "kiosk-pass-123",
  });

  expect(response.status).toBe(200);
  expect(response.body.user.role).toBe("ADMIN");

  await prisma.user.delete({ where: { id: kioskAdmin.id } });
});
```

(Check the top of `auth.test.ts` for existing `bcrypt`/`prisma`/`request`/`app` imports — they're already used elsewhere in the file for the existing admin-login tests; reuse them, don't re-import.)

- [ ] **Step 5: Run the auth test suite**

Run: `cd packages/server && npm test -- auth.test.ts`
Expected: all tests pass, including the new one.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/services/auth.service.ts packages/server/src/routes/auth.routes.ts packages/server/src/__tests__/auth.test.ts
git commit -m "feat: generalize admin login to accept both ADMIN and SUPER_ADMIN"
```

---

### Task 3: Permission split across existing routes and sockets

**Files:**
- Modify: `packages/server/src/routes/admin.routes.ts` (full file — permission gates)
- Modify: `packages/server/src/routes/prescriptions.routes.ts:73`
- Modify: `packages/server/src/routes/health-files.routes.ts:41`
- Modify: `packages/server/src/socket/index.ts:37`
- Modify: `packages/web/src/pages/admin/Login.tsx:13`
- Modify: `packages/web/src/App.tsx:54-60`
- Modify: `packages/web/src/pages/admin/UserDetail.tsx:11`
- Modify: `packages/api-client/src/schemas/user.schema.ts:28`
- Test: `packages/server/src/__tests__/api-routes.test.ts`

**Interfaces:**
- Consumes: `requireAuth(...roles: UserRole[])` from `middleware/auth.middleware.ts` (unchanged signature).
- Produces: `admin.routes.ts` routes now individually role-gated instead of one blanket `adminRouter.use(requireAuth("ADMIN"))`.

- [ ] **Step 1: Remove the blanket guard, gate each route in `admin.routes.ts`**

Delete line 16 (`adminRouter.use(requireAuth("ADMIN"));`). Add `requireAuth(...)` as the second middleware argument on each route instead. Money/approval/config routes get `requireAuth("SUPER_ADMIN")`; shared operational routes get `requireAuth("SUPER_ADMIN", "ADMIN")`:

```typescript
adminRouter.get("/doctors", requireAuth("SUPER_ADMIN"), async (_req: Request, res: Response, next: NextFunction) => {
```
```typescript
adminRouter.get("/doctors/:id/license", requireAuth("SUPER_ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
```
```typescript
adminRouter.put("/doctors/:id/approve", requireAuth("SUPER_ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
```
```typescript
adminRouter.get("/users", requireAuth("SUPER_ADMIN", "ADMIN"), async (_req: Request, res: Response, next: NextFunction) => {
```
```typescript
adminRouter.get("/users/:id", requireAuth("SUPER_ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
```
```typescript
adminRouter.get("/stats", requireAuth("SUPER_ADMIN", "ADMIN"), async (_req: Request, res: Response, next: NextFunction) => {
```
```typescript
adminRouter.get("/calls", requireAuth("SUPER_ADMIN", "ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
```
```typescript
adminRouter.get("/wallet/withdrawals", requireAuth("SUPER_ADMIN"), async (_req: Request, res: Response, next: NextFunction) => {
```
```typescript
adminRouter.put("/wallet/withdrawals/:id/complete", requireAuth("SUPER_ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
```
```typescript
adminRouter.put("/wallet/withdrawals/:id/reject", requireAuth("SUPER_ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
```
```typescript
adminRouter.get("/audit-log", requireAuth("SUPER_ADMIN", "ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
```

- [ ] **Step 2: Restrict `/users/:id/disable` — ADMIN can only touch PATIENT accounts**

Replace the handler at lines 79-88:

```typescript
adminRouter.put(
  "/users/:id/disable",
  requireAuth("SUPER_ADMIN", "ADMIN"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { disabled } = DisableUserSchema.parse(req.body);

      if (req.user!.role === "ADMIN") {
        const target = await prisma.user.findUnique({ where: { id: req.params.id } });
        if (!target || target.role !== "PATIENT") {
          throw new AppError(403, "Forbidden");
        }
      }

      await prisma.user.update({ where: { id: req.params.id }, data: { disabled } });
      await recordAuditLog(req.user!.sub, disabled ? "user.disable" : "user.enable", req.params.id);
      res.json({ message: disabled ? "User disabled" : "User enabled" });
    } catch (error) {
      next(error);
    }
  },
);
```

- [ ] **Step 3: Narrow the clinical-document bypass checks to `SUPER_ADMIN` only**

In `prescriptions.routes.ts:73`, change:
```typescript
if (prescription.patientId !== userId && prescription.doctorId !== userId && role !== "ADMIN") {
```
to:
```typescript
if (prescription.patientId !== userId && prescription.doctorId !== userId && role !== "SUPER_ADMIN") {
```

In `health-files.routes.ts:41`, change:
```typescript
if (file.userId !== req.user!.sub && req.user!.role !== "ADMIN") {
```
to:
```typescript
if (file.userId !== req.user!.sub && req.user!.role !== "SUPER_ADMIN") {
```

- [ ] **Step 4: Widen the socket `admins` room to both roles**

In `socket/index.ts:37`, change:
```typescript
if (userRole === "ADMIN") {
  socket.join("admins");
}
```
to:
```typescript
if (userRole === "ADMIN" || userRole === "SUPER_ADMIN") {
  socket.join("admins");
}
```

- [ ] **Step 5: Mechanical rename in the web admin panel**

`packages/web/src/pages/admin/Login.tsx:13` — `user: { id: string; name: string; role: "ADMIN" };` → `role: "SUPER_ADMIN"`.

`packages/web/src/pages/admin/UserDetail.tsx:11` — `role: "PATIENT" | "DOCTOR" | "ADMIN";` → `role: "PATIENT" | "DOCTOR" | "ADMIN" | "SUPER_ADMIN";`.

`packages/web/src/App.tsx:54-60` — every `role="ADMIN"` on the `/admin*` routes becomes `role="SUPER_ADMIN"` (the existing admin panel is the super-admin's panel; it keeps working unchanged for that role). Building a separate kiosk-`ADMIN`-facing panel is explicitly out of scope for this plan — flag it as follow-up frontend work once this backend lands.

`packages/api-client/src/schemas/user.schema.ts:28` — `export const UserRoleSchema = z.enum(["PATIENT", "DOCTOR", "ADMIN"]);` → `export const UserRoleSchema = z.enum(["PATIENT", "DOCTOR", "ADMIN", "SUPER_ADMIN"]);`.

- [ ] **Step 6: Update the three other test files still seeding today's full-power admin as `"ADMIN"`**

These hit routes that become `SUPER_ADMIN`-only in Step 1 above and will start failing with 403 unless updated:

`audit-log.test.ts:15,18` — change:
```typescript
const admin = await prisma.user.create({
  data: { phone: "8888900001", name: "Audit Admin", role: "SUPER_ADMIN", passwordHash: "unused" },
});
adminId = admin.id;
adminToken = signAccessToken({ sub: admin.id, role: "SUPER_ADMIN" });
```

`doctor-verification.test.ts:36,38` (this test hits `GET /api/admin/doctors/:id/license`, `SUPER_ADMIN`-only) — change:
```typescript
const admin = await prisma.user.create({
  data: { phone: "8889000099", name: "Verify Admin", role: "SUPER_ADMIN", passwordHash: "unused" },
});
const adminToken = signAccessToken({ sub: admin.id, role: "SUPER_ADMIN" });
```

`e2e-consult-flow.test.ts:46` (the `ensureAdmin()` helper, used to log in via `/api/auth/admin/login` and drive the doctor-approval step of the full flow) — change:
```typescript
        role: "SUPER_ADMIN",
```

- [ ] **Step 7: Update `api-routes.test.ts` role-gate tests**

Find the existing admin-token setup near the top of the file (`adminId`/`adminToken`) and any test asserting `role: "ADMIN"` for what is today's full-power admin — change the seeded user's `role` to `"SUPER_ADMIN"` and `signAccessToken({ sub: adminId, role: "SUPER_ADMIN" })`.

Add a new test proving the permission split:

```typescript
it("rejects a kiosk ADMIN from a SUPER_ADMIN-only route but allows the shared operational route", async () => {
  const passwordHash = await bcrypt.hash("kiosk-pass", 12);
  const kioskAdmin = await prisma.user.create({
    data: { phone: "8888700002", name: "Kiosk Admin Route Test", role: "ADMIN", passwordHash },
  });
  const kioskToken = signAccessToken({ sub: kioskAdmin.id, role: "ADMIN" });

  const forbidden = await request(app)
    .get("/api/admin/wallet/withdrawals")
    .set("Authorization", `Bearer ${kioskToken}`);
  expect(forbidden.status).toBe(403);

  const allowed = await request(app)
    .get("/api/admin/stats")
    .set("Authorization", `Bearer ${kioskToken}`);
  expect(allowed.status).toBe(200);

  await prisma.user.delete({ where: { id: kioskAdmin.id } });
});
```

(Confirm `bcrypt` is already imported at the top of `api-routes.test.ts`; if not, add `import bcrypt from "bcryptjs";`.)

- [ ] **Step 8: Run the full server test suite**

Run: `cd packages/server && npm test`
Expected: all suites pass.

- [ ] **Step 9: Commit**

```bash
git add packages/server/src/routes/admin.routes.ts packages/server/src/routes/prescriptions.routes.ts packages/server/src/routes/health-files.routes.ts packages/server/src/socket/index.ts packages/server/src/__tests__/api-routes.test.ts packages/server/src/__tests__/audit-log.test.ts packages/server/src/__tests__/doctor-verification.test.ts packages/server/src/__tests__/e2e-consult-flow.test.ts packages/web/src/pages/admin/Login.tsx packages/web/src/App.tsx packages/web/src/pages/admin/UserDetail.tsx packages/api-client/src/schemas/user.schema.ts
git commit -m "feat: split admin permissions between SUPER_ADMIN and kiosk ADMIN"
```

---

### Task 4: Staff account creation

**Files:**
- Modify: `packages/server/src/routes/admin.routes.ts`
- Modify: `packages/api-client/src/schemas/user.schema.ts`
- Test: `packages/server/src/__tests__/api-routes.test.ts`

**Interfaces:**
- Produces: `POST /api/admin/staff` (`SUPER_ADMIN`-only) — `{ phone, name, role: "DOCTOR" | "ADMIN" }` → `{ id, phone, name, role, tempPin }`.

- [ ] **Step 1: Add `StaffCreateSchema` to `api-client`**

In `packages/api-client/src/schemas/user.schema.ts`, add after `UserSchema`:

```typescript
export const StaffCreateSchema = z.object({
  phone: z.string().min(10).max(15),
  name: z.string().min(1).max(100),
  role: z.enum(["DOCTOR", "ADMIN"]),
});
export type StaffCreate = z.infer<typeof StaffCreateSchema>;
```

- [ ] **Step 2: Add the route in `admin.routes.ts`**

Add near the top of the file, after the existing `DisableUserSchema` import block, import `StaffCreateSchema` from `@madamgy/api-client` (check the existing import style in this file — other route files import shared schemas the same way, e.g. `doctor.routes.ts:3` imports `WithdrawRequestSchema` from `"@madamgy/api-client"`). Add a `randomUUID` import from `"crypto"` and `bcrypt` from `"bcryptjs"` at the top, then the route:

```typescript
adminRouter.post("/staff", requireAuth("SUPER_ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phone, name, role } = StaffCreateSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing) {
      throw new AppError(409, "Phone already registered");
    }

    const tempPin = randomUUID().slice(0, 8);
    const passwordHash = await bcrypt.hash(tempPin, 12);

    const user = await prisma.user.create({
      data: {
        phone,
        name,
        role,
        passwordHash,
        ...(role === "DOCTOR"
          ? { doctorProfile: { create: { degree: "", regNumber: `PENDING-${randomUUID()}` } } }
          : {}),
      },
    });

    await recordAuditLog(req.user!.sub, "staff.create", user.id, { role });
    res.status(201).json({ id: user.id, phone: user.phone, name: user.name, role: user.role, tempPin });
  } catch (error) {
    next(error);
  }
});
```

Note: a `DOCTOR` created this way gets a placeholder `degree`/`regNumber` — the super admin (or the doctor themselves on first login) must still fill in real license details before `isApproved` can be set true via the existing `/doctors/:id/approve` flow. This matches the spec's "doctor accounts still go through the existing license-upload+approval flow unchanged."

- [ ] **Step 3: Write the test**

Add to `api-routes.test.ts`, alongside the other admin-route tests:

```typescript
it("lets SUPER_ADMIN create a staff account directly", async () => {
  const response = await request(app)
    .post("/api/admin/staff")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ phone: "8888700003", name: "New Kiosk Owner", role: "ADMIN" });

  expect(response.status).toBe(201);
  expect(response.body.role).toBe("ADMIN");
  expect(typeof response.body.tempPin).toBe("string");

  const created = await prisma.user.findUniqueOrThrow({ where: { id: response.body.id } });
  expect(created.passwordHash).not.toBeNull();

  await prisma.user.delete({ where: { id: response.body.id } });
});

it("rejects staff creation from a non-SUPER_ADMIN role", async () => {
  const response = await request(app)
    .post("/api/admin/staff")
    .set("Authorization", `Bearer ${patientToken}`)
    .send({ phone: "8888700004", name: "Nope", role: "ADMIN" });

  expect(response.status).toBe(403);
});
```

- [ ] **Step 4: Run the test**

Run: `cd packages/server && npm test -- api-routes.test.ts`
Expected: both new tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/routes/admin.routes.ts packages/api-client/src/schemas/user.schema.ts packages/server/src/__tests__/api-routes.test.ts
git commit -m "feat: let SUPER_ADMIN create DOCTOR/ADMIN staff accounts directly"
```

---

### Task 5: Revenue config — runtime-editable fee and split

**Files:**
- Create: `packages/server/src/services/revenue-config.service.ts`
- Create: `packages/server/src/__tests__/revenue-config.test.ts`
- Modify: `packages/server/src/routes/admin.routes.ts`
- Modify: `packages/server/src/services/payment.service.ts`
- Modify: `packages/api-client/src/schemas/wallet.schema.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `getRevenueConfig(): Promise<RevenueConfig>`, `updateRevenueConfig(updatedById: string, data: { consultationFee: number; doctorPct: number; adminPct: number; superAdminPct: number }): Promise<RevenueConfig>` — throws `AppError(400, ...)` if percentages don't sum to 100.
- Consumes: `prisma.revenueConfig` (Task 1), `AppError` from `middleware/error.middleware.js`.

- [ ] **Step 1: Write the failing service test**

Create `packages/server/src/__tests__/revenue-config.test.ts`:

```typescript
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma.js";
import { getRevenueConfig, updateRevenueConfig } from "../services/revenue-config.service.js";

describe("revenue-config.service", () => {
  let superAdminId: string;

  beforeAll(async () => {
    const superAdmin = await prisma.user.create({
      data: { phone: "9999400001", name: "Config Test Super Admin", role: "SUPER_ADMIN", passwordHash: "x" },
    });
    superAdminId = superAdmin.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: superAdminId } });
  });

  it("returns the seeded config", async () => {
    const config = await getRevenueConfig();
    expect(Number(config.doctorPct) + Number(config.adminPct) + Number(config.superAdminPct)).toBe(100);
  });

  it("updates the config when percentages sum to 100", async () => {
    const updated = await updateRevenueConfig(superAdminId, {
      consultationFee: 500,
      doctorPct: 70,
      adminPct: 20,
      superAdminPct: 10,
    });
    expect(Number(updated.consultationFee)).toBe(500);
    expect(updated.updatedById).toBe(superAdminId);

    await updateRevenueConfig(superAdminId, {
      consultationFee: 200,
      doctorPct: 65,
      adminPct: 25,
      superAdminPct: 10,
    });
  });

  it("rejects an update whose percentages do not sum to 100", async () => {
    await expect(
      updateRevenueConfig(superAdminId, {
        consultationFee: 200,
        doctorPct: 70,
        adminPct: 25,
        superAdminPct: 10,
      }),
    ).rejects.toThrow("Split percentages must sum to 100");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd packages/server && npm test -- revenue-config.test.ts`
Expected: FAIL — `Cannot find module '../services/revenue-config.service.js'`.

- [ ] **Step 3: Implement the service**

Create `packages/server/src/services/revenue-config.service.ts`:

```typescript
import { prisma } from "../lib/prisma.js";
import { AppError } from "../middleware/error.middleware.js";

export async function getRevenueConfig() {
  const config = await prisma.revenueConfig.findFirst();
  if (!config) {
    throw new AppError(500, "Revenue config not seeded");
  }
  return config;
}

export async function updateRevenueConfig(
  updatedById: string,
  data: { consultationFee: number; doctorPct: number; adminPct: number; superAdminPct: number },
) {
  const sum = data.doctorPct + data.adminPct + data.superAdminPct;
  if (sum !== 100) {
    throw new AppError(400, "Split percentages must sum to 100");
  }

  const existing = await getRevenueConfig();
  return prisma.revenueConfig.update({
    where: { id: existing.id },
    data: { ...data, updatedById },
  });
}
```

- [ ] **Step 4: Run the test again**

Run: `cd packages/server && npm test -- revenue-config.test.ts`
Expected: PASS (all 3 tests) — note the seeded config from Task 1 must already exist in the test database for the first test to pass; it's created once by `npm run db:seed`, not per-test.

- [ ] **Step 5: Add the API routes**

In `admin.routes.ts`, import `getRevenueConfig`, `updateRevenueConfig` from `../services/revenue-config.service.js`, and `RevenueConfigUpdateSchema` from `@madamgy/api-client`. Add:

```typescript
adminRouter.get("/revenue-config", requireAuth("SUPER_ADMIN"), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await getRevenueConfig();
    res.json(config);
  } catch (error) {
    next(error);
  }
});

adminRouter.put("/revenue-config", requireAuth("SUPER_ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = RevenueConfigUpdateSchema.parse(req.body);
    const before = await getRevenueConfig();
    const updated = await updateRevenueConfig(req.user!.sub, data);
    await recordAuditLog(req.user!.sub, "revenue-config.update", updated.id, {
      before: { fee: before.consultationFee.toString(), doctorPct: before.doctorPct.toString(), adminPct: before.adminPct.toString(), superAdminPct: before.superAdminPct.toString() },
      after: { fee: updated.consultationFee.toString(), doctorPct: updated.doctorPct.toString(), adminPct: updated.adminPct.toString(), superAdminPct: updated.superAdminPct.toString() },
    });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});
```

- [ ] **Step 6: Add `RevenueConfigUpdateSchema` to `api-client`**

In `packages/api-client/src/schemas/wallet.schema.ts`, add:

```typescript
export const RevenueConfigUpdateSchema = z.object({
  consultationFee: z.number().positive(),
  doctorPct: z.number().min(0).max(100),
  adminPct: z.number().min(0).max(100),
  superAdminPct: z.number().min(0).max(100),
});
export type RevenueConfigUpdate = z.infer<typeof RevenueConfigUpdateSchema>;
```

- [ ] **Step 7: Wire `payment.service.ts` to read the live config instead of the env var**

Replace `packages/server/src/services/payment.service.ts` in full:

```typescript
import Razorpay from "razorpay";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../middleware/error.middleware.js";
import { getRevenueConfig } from "./revenue-config.service.js";

function getRazorpayClient(): Razorpay {
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
  });
}

export async function createPaymentOrder(patientId: string) {
  const config = await getRevenueConfig();
  const fee = Number(config.consultationFee);

  const razorpay = getRazorpayClient();
  const order = await razorpay.orders.create({
    amount: fee * 100,
    currency: "INR",
    receipt: `consult_${patientId}_${Date.now()}`,
  });

  const payment = await prisma.payment.create({
    data: {
      patientId,
      amount: fee,
      razorpayOrderId: order.id,
      status: "CREATED",
      doctorPct: config.doctorPct,
      adminPct: config.adminPct,
      superAdminPct: config.superAdminPct,
    },
  });

  return {
    paymentId: payment.id,
    razorpayOrderId: order.id,
    amount: fee,
    keyId: process.env.RAZORPAY_KEY_ID,
  };
}

export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
    .update(rawBody)
    .digest();

  let provided: Buffer;
  try {
    provided = Buffer.from(signature, "hex");
  } catch {
    return false;
  }

  if (provided.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, provided);
}

export async function markPaymentPaid(razorpayOrderId: string, razorpayPaymentId: string): Promise<void> {
  await prisma.payment.updateMany({
    where: { razorpayOrderId, status: "CREATED" },
    data: { status: "PAID", razorpayPaymentId },
  });
}

export async function refundPayment(paymentId: string) {
  const claimed = await prisma.payment.updateMany({
    where: { id: paymentId, status: "PAID" },
    data: { status: "REFUNDED" },
  });
  if (claimed.count === 0) {
    throw new AppError(400, "Payment not eligible for refund");
  }

  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  if (!payment.razorpayPaymentId) {
    throw new AppError(400, "Payment not eligible for refund");
  }

  const razorpay = getRazorpayClient();
  await razorpay.payments.refund(payment.razorpayPaymentId, {});
  return payment;
}
```

Any existing test relying on `CONSULTATION_FEE=200` env var to predict `createPaymentOrder`'s amount (check `packages/server/src/__tests__/payments.test.ts` and `e2e-consult-flow.test.ts` for `CONSULTATION_FEE`) now depends on the seeded `RevenueConfig` row instead — since Task 1's seed reads `CONSULTATION_FEE` as the seed's initial fee, this stays consistent as long as the test database was seeded with that same env value before the test run.

- [ ] **Step 8: Note the env var's new role**

In `.env.example`, change the `CONSULTATION_FEE=200` line's context — add a comment above it:

```
# CONSULTATION_FEE only seeds the initial RevenueConfig row (see prisma/seed.ts).
# After first seed, the live fee is whatever SUPER_ADMIN set via PUT /api/admin/revenue-config.
CONSULTATION_FEE=200
```

- [ ] **Step 9: Run the full server test suite**

Run: `cd packages/server && npm test`
Expected: all suites pass, including `payments.test.ts` and `e2e-consult-flow.test.ts`.

- [ ] **Step 10: Commit**

```bash
git add packages/server/src/services/revenue-config.service.ts packages/server/src/__tests__/revenue-config.test.ts packages/server/src/routes/admin.routes.ts packages/server/src/services/payment.service.ts packages/api-client/src/schemas/wallet.schema.ts .env.example
git commit -m "feat: make consultation fee and revenue split runtime-configurable"
```

---

### Task 6: Kiosk device registration

**Files:**
- Create: `packages/server/src/services/kiosk.service.ts`
- Create: `packages/server/src/__tests__/kiosk.test.ts`
- Modify: `packages/server/src/routes/admin.routes.ts`
- Modify: `packages/api-client/src/schemas/user.schema.ts`

**Interfaces:**
- Produces: `registerKioskDevice(adminId: string, deviceId: string, label?: string): Promise<Kiosk>` — throws `AppError(409, ...)` if `deviceId` is active under a different admin.
- Consumes: `Kiosk` model from Task 1.

- [ ] **Step 1: Write the failing service test**

Create `packages/server/src/__tests__/kiosk.test.ts`:

```typescript
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma.js";
import { registerKioskDevice } from "../services/kiosk.service.js";

describe("kiosk.service", () => {
  let adminAId: string;
  let adminBId: string;

  beforeAll(async () => {
    const adminA = await prisma.user.create({
      data: { phone: "9999500001", name: "Kiosk Admin A", role: "ADMIN", passwordHash: "x" },
    });
    adminAId = adminA.id;
    const adminB = await prisma.user.create({
      data: { phone: "9999500002", name: "Kiosk Admin B", role: "ADMIN", passwordHash: "x" },
    });
    adminBId = adminB.id;
  });

  afterAll(async () => {
    await prisma.kiosk.deleteMany({ where: { adminId: { in: [adminAId, adminBId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [adminAId, adminBId] } } });
  });

  it("registers a new device to an admin", async () => {
    const kiosk = await registerKioskDevice(adminAId, "device-kiosk-test-1", "Front desk tablet");
    expect(kiosk.adminId).toBe(adminAId);
    expect(kiosk.active).toBe(true);
  });

  it("is idempotent when the same admin re-registers their own device", async () => {
    const kiosk = await registerKioskDevice(adminAId, "device-kiosk-test-1", "Renamed tablet");
    expect(kiosk.label).toBe("Renamed tablet");

    const count = await prisma.kiosk.count({ where: { deviceId: "device-kiosk-test-1" } });
    expect(count).toBe(1);
  });

  it("rejects a different admin claiming a device that is active under someone else", async () => {
    await expect(registerKioskDevice(adminBId, "device-kiosk-test-1")).rejects.toThrow(
      "Device already registered to another admin",
    );
  });

  it("allows claiming a device once the original admin deactivates it", async () => {
    await prisma.kiosk.updateMany({
      where: { deviceId: "device-kiosk-test-1" },
      data: { active: false },
    });

    const kiosk = await registerKioskDevice(adminBId, "device-kiosk-test-1");
    expect(kiosk.adminId).toBe(adminBId);
    expect(kiosk.active).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd packages/server && npm test -- kiosk.test.ts`
Expected: FAIL — `Cannot find module '../services/kiosk.service.js'`.

- [ ] **Step 3: Implement the service**

Create `packages/server/src/services/kiosk.service.ts`:

```typescript
import { prisma } from "../lib/prisma.js";
import { AppError } from "../middleware/error.middleware.js";

export async function registerKioskDevice(adminId: string, deviceId: string, label?: string) {
  const existing = await prisma.kiosk.findUnique({ where: { deviceId } });

  if (existing && existing.active && existing.adminId !== adminId) {
    throw new AppError(409, "Device already registered to another admin");
  }

  return prisma.kiosk.upsert({
    where: { deviceId },
    create: { deviceId, adminId, label, active: true },
    update: { adminId, label, active: true },
  });
}

export async function deactivateKioskDevice(adminId: string, deviceId: string) {
  const existing = await prisma.kiosk.findUnique({ where: { deviceId } });
  if (!existing || existing.adminId !== adminId) {
    throw new AppError(404, "Kiosk device not found for this admin");
  }

  return prisma.kiosk.update({ where: { deviceId }, data: { active: false } });
}

export async function resolveAssistingAdmin(deviceId?: string): Promise<string | null> {
  if (!deviceId) {
    return null;
  }

  const kiosk = await prisma.kiosk.findUnique({ where: { deviceId } });
  if (!kiosk || !kiosk.active) {
    return null;
  }

  return kiosk.adminId;
}
```

- [ ] **Step 4: Run the test again**

Run: `cd packages/server && npm test -- kiosk.test.ts`
Expected: PASS (all 4 tests).

- [ ] **Step 5: Add the API routes**

Add `KioskRegisterSchema` to `packages/api-client/src/schemas/user.schema.ts`:

```typescript
export const KioskRegisterSchema = z.object({
  deviceId: z.string().min(1),
  label: z.string().max(100).optional(),
});
export type KioskRegister = z.infer<typeof KioskRegisterSchema>;
```

In `admin.routes.ts`, import `registerKioskDevice`, `deactivateKioskDevice` from `../services/kiosk.service.js` and `KioskRegisterSchema` from `@madamgy/api-client`, then add:

```typescript
adminRouter.post("/kiosk-devices", requireAuth("ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { deviceId, label } = KioskRegisterSchema.parse(req.body);
    const kiosk = await registerKioskDevice(req.user!.sub, deviceId, label);
    res.status(201).json(kiosk);
  } catch (error) {
    next(error);
  }
});

adminRouter.delete("/kiosk-devices/:deviceId", requireAuth("ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const kiosk = await deactivateKioskDevice(req.user!.sub, req.params.deviceId);
    res.json(kiosk);
  } catch (error) {
    next(error);
  }
});
```

- [ ] **Step 6: Run the full server test suite**

Run: `cd packages/server && npm test`
Expected: all suites pass.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/services/kiosk.service.ts packages/server/src/__tests__/kiosk.test.ts packages/server/src/routes/admin.routes.ts packages/api-client/src/schemas/user.schema.ts
git commit -m "feat: add kiosk device registration for admin revenue attribution"
```

---

### Task 7: Booking attribution via device ID

**Files:**
- Modify: `packages/server/src/routes/calls.routes.ts:12-61`
- Modify: `packages/api-client/src/schemas/call.schema.ts`
- Test: `packages/server/src/__tests__/calls.test.ts`

**Interfaces:**
- Consumes: `resolveAssistingAdmin(deviceId?: string): Promise<string | null>` from Task 6.
- Produces: `CallSession.assistingAdminId` set at creation time, resolved server-side only.

- [ ] **Step 1: Check the existing booking request schema**

Read `packages/api-client/src/schemas/call.schema.ts` to find the schema used for `POST /api/calls` (if one exists for the body) — if the route currently parses no body schema when `REQUIRE_PAYMENT_FOR_CALLS` is off, add a new schema rather than editing an unrelated one:

```typescript
export const CallCreateSchema = z.object({
  paymentId: z.string().optional(),
  deviceId: z.string().min(1).optional(),
});
export type CallCreate = z.infer<typeof CallCreateSchema>;
```

- [ ] **Step 2: Update `calls.routes.ts` to resolve attribution server-side**

Replace lines 1-61 of `calls.routes.ts`:

```typescript
import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { CallCreateSchema } from "@madamgy/api-client";
import { assignDoctorQueue } from "../lib/queues.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { resolveAssistingAdmin } from "../services/kiosk.service.js";

export const callsRouter = Router();

callsRouter.post("/", requireAuth("PATIENT"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const patientId = req.user!.sub;

    const existing = await prisma.callSession.findFirst({
      where: { patientId, status: { in: ["QUEUED", "RINGING", "ACTIVE"] } },
    });
    if (existing) {
      res.status(409).json({ message: "Active call exists", callSession: existing, callSessionId: existing.id });
      return;
    }

    const { paymentId, deviceId } = CallCreateSchema.parse(req.body ?? {});

    const requirePayment = process.env.REQUIRE_PAYMENT_FOR_CALLS === "true";
    if (requirePayment && !paymentId) {
      z.object({ paymentId: z.string() }).parse(req.body);
    }

    const assistingAdminId = await resolveAssistingAdmin(deviceId);

    // Create the call first (cheap, no external side effects). The payment claim below uses the
    // real call.id directly as the callSessionId being set, never a placeholder, so it can never
    // violate the FK constraint on Payment.callSessionId and never collides across unrelated
    // payments (each claim only ever touches its own payment row).
    const call = await prisma.callSession.create({
      data: { patientId, assistingAdminId, livekitRoom: `room-${randomUUID()}`, status: "QUEUED" },
    });

    if (requirePayment && paymentId) {
      // Atomically claim the payment for this call. Two concurrent requests with the same
      // paymentId each create their own distinct CallSession, then race on this updateMany
      // against the same Payment row; Postgres serializes the two UPDATEs, only one can match
      // callSessionId: null, and the loser deletes its own orphan CallSession below.
      const claim = await prisma.payment.updateMany({
        where: { id: paymentId, patientId, status: "PAID", callSessionId: null },
        data: { callSessionId: call.id },
      });
      if (claim.count === 0) {
        await prisma.callSession.delete({ where: { id: call.id } });
        res.status(402).json({ message: "Valid unused paid payment required" });
        return;
      }
    }

    await assignDoctorQueue.add(
      "assign",
      { callSessionId: call.id },
      { attempts: 3, backoff: { type: "fixed", delay: 30_000 } },
    );

    res.status(201).json(call);
  } catch (error) {
    next(error);
  }
});
```

Note the `resolveAssistingAdmin(deviceId)` call is the only place `assistingAdminId` is ever set — it's never read from `req.body` directly, so a client cannot assert an admin identity, only an opaque `deviceId` that the server resolves independently.

- [ ] **Step 3: Write the attribution test**

Add to `packages/server/src/__tests__/calls.test.ts` (check the file's existing imports/setup for a `patientToken`-style pattern and reuse it):

```typescript
it("attributes a booking to the admin who owns the registered device", async () => {
  const admin = await prisma.user.create({
    data: { phone: "8888800001", name: "Attribution Admin", role: "ADMIN", passwordHash: "x" },
  });
  await prisma.kiosk.create({ data: { deviceId: "device-attr-test-1", adminId: admin.id, active: true } });

  const patient = await prisma.user.create({
    data: { phone: "8888800002", name: "Attribution Patient", role: "PATIENT", pinHash: "x" },
  });
  const token = signAccessToken({ sub: patient.id, role: "PATIENT" });

  const response = await request(app)
    .post("/api/calls")
    .set("Authorization", `Bearer ${token}`)
    .send({ deviceId: "device-attr-test-1" });

  expect(response.status).toBe(201);
  const call = await prisma.callSession.findUniqueOrThrow({ where: { id: response.body.id } });
  expect(call.assistingAdminId).toBe(admin.id);

  await prisma.callSession.delete({ where: { id: call.id } });
  await prisma.kiosk.delete({ where: { deviceId: "device-attr-test-1" } });
  await prisma.user.deleteMany({ where: { id: { in: [admin.id, patient.id] } } });
});

it("leaves assistingAdminId null for an unregistered device", async () => {
  const patient = await prisma.user.create({
    data: { phone: "8888800003", name: "No Attribution Patient", role: "PATIENT", pinHash: "x" },
  });
  const token = signAccessToken({ sub: patient.id, role: "PATIENT" });

  const response = await request(app)
    .post("/api/calls")
    .set("Authorization", `Bearer ${token}`)
    .send({ deviceId: "device-never-registered" });

  expect(response.status).toBe(201);
  const call = await prisma.callSession.findUniqueOrThrow({ where: { id: response.body.id } });
  expect(call.assistingAdminId).toBeNull();

  await prisma.callSession.delete({ where: { id: call.id } });
  await prisma.user.delete({ where: { id: patient.id } });
});
```

Add one more, for a device that was registered but then deactivated:

```typescript
it("leaves assistingAdminId null for a deactivated device", async () => {
  const admin = await prisma.user.create({
    data: { phone: "8888800004", name: "Deactivated Kiosk Admin", role: "ADMIN", passwordHash: "x" },
  });
  await prisma.kiosk.create({ data: { deviceId: "device-attr-test-2", adminId: admin.id, active: false } });

  const patient = await prisma.user.create({
    data: { phone: "8888800005", name: "Deactivated Device Patient", role: "PATIENT", pinHash: "x" },
  });
  const token = signAccessToken({ sub: patient.id, role: "PATIENT" });

  const response = await request(app)
    .post("/api/calls")
    .set("Authorization", `Bearer ${token}`)
    .send({ deviceId: "device-attr-test-2" });

  expect(response.status).toBe(201);
  const call = await prisma.callSession.findUniqueOrThrow({ where: { id: response.body.id } });
  expect(call.assistingAdminId).toBeNull();

  await prisma.callSession.delete({ where: { id: call.id } });
  await prisma.kiosk.delete({ where: { deviceId: "device-attr-test-2" } });
  await prisma.user.deleteMany({ where: { id: { in: [admin.id, patient.id] } } });
});
```

- [ ] **Step 4: Run the test**

Run: `cd packages/server && npm test -- calls.test.ts`
Expected: all three new tests pass, existing tests in the file unaffected.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/routes/calls.routes.ts packages/api-client/src/schemas/call.schema.ts packages/server/src/__tests__/calls.test.ts
git commit -m "feat: attribute bookings to a kiosk admin via registered device ID"
```

---

### Task 8: Wallet crediting — three-way split at call completion

**Files:**
- Modify: `packages/server/src/services/call-completion.service.ts` (full file)
- Modify: `packages/server/src/__tests__/call-completion.test.ts`

**Interfaces:**
- Consumes: `Payment.doctorPct/adminPct/superAdminPct` (Task 1, snapshotted in Task 5), `getRevenueConfig()` (Task 5, fallback), `CallSession.assistingAdminId` (Task 1/7).
- Produces: `completeCall` now credits `WalletTransaction` rows keyed by `userId` (doctor always, admin only if attributed).

- [ ] **Step 1: Replace `call-completion.service.ts` in full**

```typescript
import { prisma } from "../lib/prisma.js";
import { io } from "../index.js";
import { getRevenueConfig } from "./revenue-config.service.js";

const ACTIVE_STATUSES = ["QUEUED", "RINGING", "ACTIVE"];

export async function completeCall(callSessionId: string): Promise<void> {
  const result = await prisma.$transaction(async (tx) => {
    const call = await tx.callSession.findUnique({ where: { id: callSessionId } });
    if (!call || !ACTIVE_STATUSES.includes(call.status)) {
      return null;
    }

    const wasActive = call.status === "ACTIVE";

    await tx.callSession.update({
      where: { id: callSessionId },
      data: { status: "ENDED", endedAt: new Date() },
    });

    if (!call.doctorId) {
      return { patientId: call.patientId, doctorId: null as string | null };
    }

    await tx.doctorProfile.update({
      where: { userId: call.doctorId },
      data: { isAvailable: true },
    });

    if (wasActive) {
      const existingCredit = await tx.walletTransaction.findFirst({
        where: { callSessionId, type: "CREDIT" },
      });
      if (!existingCredit) {
        const payment = await tx.payment.findUnique({ where: { callSessionId } });

        let fee: number;
        let doctorPct: number;
        let adminPct: number;

        if (payment && payment.doctorPct !== null && payment.adminPct !== null) {
          fee = Number(payment.amount);
          doctorPct = Number(payment.doctorPct);
          adminPct = Number(payment.adminPct);
        } else {
          const config = await getRevenueConfig();
          fee = Number(config.consultationFee);
          doctorPct = Number(config.doctorPct);
          adminPct = Number(config.adminPct);
        }

        const doctorEarning = Number((fee * doctorPct / 100).toFixed(2));
        await tx.walletTransaction.create({
          data: {
            userId: call.doctorId,
            callSessionId,
            amount: doctorEarning,
            type: "CREDIT",
            status: "COMPLETED",
            description: `Consultation fee - ${callSessionId}`,
          },
        });
        await tx.user.update({
          where: { id: call.doctorId },
          data: { walletBalance: { increment: doctorEarning } },
        });

        if (call.assistingAdminId) {
          const adminEarning = Number((fee * adminPct / 100).toFixed(2));
          await tx.walletTransaction.create({
            data: {
              userId: call.assistingAdminId,
              callSessionId,
              amount: adminEarning,
              type: "CREDIT",
              status: "COMPLETED",
              description: `Kiosk attribution fee - ${callSessionId}`,
            },
          });
          await tx.user.update({
            where: { id: call.assistingAdminId },
            data: { walletBalance: { increment: adminEarning } },
          });
        }
      }
    }

    return { patientId: call.patientId, doctorId: call.doctorId as string | null };
  });

  if (!result) {
    return;
  }

  io.to(`user:${result.patientId}`).emit("call:ended", { callSessionId });
  if (result.doctorId) {
    io.to(`user:${result.doctorId}`).emit("call:ended", { callSessionId });
  }
}
```

Note: `superAdminPct` is deliberately never credited to any `WalletTransaction` — per the spec, the company's share is read straight off `Payment`, never wallet-tracked. When there's no attributing admin, `adminPct`'s share simply isn't credited to anyone either — it's part of the company's tracked revenue alongside `superAdminPct`, both readable off `Payment` without a wallet entry.

- [ ] **Step 2: Update `call-completion.test.ts` for the field rename**

`DoctorProfile.walletBalance` no longer exists — replace every `prisma.doctorProfile.findUniqueOrThrow({ where: { userId: doctorId } })` wallet-balance assertion with a `prisma.user.findUniqueOrThrow({ where: { id: doctorId } })` one. At line 51-53:

```typescript
    const user = await prisma.user.findUniqueOrThrow({ where: { id: doctorId } });
    expect(Number(user.walletBalance)).toBeGreaterThan(0);

    const profile = await prisma.doctorProfile.findUniqueOrThrow({ where: { userId: doctorId } });
    expect(profile.isAvailable).toBe(true);
```

Every `prisma.walletTransaction.findMany({ where: { doctorId } })`-style query in this file's `afterAll` (line 38: `await prisma.walletTransaction.deleteMany({ where: { doctorId } });`) becomes `where: { userId: doctorId }`.

- [ ] **Step 3: Add a kiosk-attributed credit test**

Add to `call-completion.test.ts`:

```typescript
it("credits both doctor and admin wallets when the call is kiosk-attributed", async () => {
  const admin = await prisma.user.create({
    data: { phone: "9999300003", name: "Completion Admin", role: "ADMIN", passwordHash: "x" },
  });

  const call = await prisma.callSession.create({
    data: {
      patientId,
      doctorId,
      assistingAdminId: admin.id,
      status: "ACTIVE",
      livekitRoom: "room-completion-attributed",
      startedAt: new Date(),
    },
  });

  await completeCall(call.id);

  const doctorTxn = await prisma.walletTransaction.findFirstOrThrow({
    where: { callSessionId: call.id, userId: doctorId },
  });
  const adminTxn = await prisma.walletTransaction.findFirstOrThrow({
    where: { callSessionId: call.id, userId: admin.id },
  });

  expect(Number(doctorTxn.amount)).toBeCloseTo(200 * 0.65, 2);
  expect(Number(adminTxn.amount)).toBeCloseTo(200 * 0.25, 2);

  await prisma.walletTransaction.deleteMany({ where: { callSessionId: call.id } });
  await prisma.callSession.delete({ where: { id: call.id } });
  await prisma.user.delete({ where: { id: admin.id } });
});
```

(The `200` and `0.65`/`0.25` here assume the seeded `RevenueConfig` from Task 1 — fee 200, doctor 65%, admin 25% — is unchanged in the test database; this test reads live config via the no-`Payment` fallback path, since no `Payment` row is created for this direct `CallSession`.)

- [ ] **Step 4: Run the test**

Run: `cd packages/server && npm test -- call-completion.test.ts`
Expected: all tests pass, including the new one.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/call-completion.service.ts packages/server/src/__tests__/call-completion.test.ts
git commit -m "feat: credit doctor and kiosk admin wallets on call completion per revenue split"
```

---

### Task 9: Admin's own wallet — balance, history, withdrawal

**Files:**
- Modify: `packages/server/src/services/wallet.service.ts` (full file)
- Modify: `packages/server/src/routes/admin.routes.ts`
- Modify: `packages/api-client/src/schemas/wallet.schema.ts:6-16`
- Test: `packages/server/src/__tests__/api-routes.test.ts`

**Interfaces:**
- Produces: `getWalletBalance(userId)`, `createWithdrawRequest(userId, amount, bankDetails)` — renamed param, same behavior, now valid for either `DOCTOR` or `ADMIN`. `GET/POST /api/admin/wallet*` mirroring the existing doctor endpoints.

- [ ] **Step 1: Generalize `wallet.service.ts` from `doctorId` to `userId`**

Replace `packages/server/src/services/wallet.service.ts` in full:

```typescript
import { prisma } from "../lib/prisma.js";
import { AppError } from "../middleware/error.middleware.js";

export async function getWalletBalance(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { walletBalance: true },
  });
  if (!user) {
    throw new AppError(404, "User not found");
  }

  return user.walletBalance;
}

export async function createWithdrawRequest(
  userId: string,
  amount: number,
  bankDetails: { bankName: string; accountNumber: string; ifsc: string; holderName: string },
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError(404, "User not found");
  }

  if (Number(user.walletBalance) < amount) {
    throw new AppError(400, "Insufficient wallet balance");
  }

  const pending = await prisma.walletTransaction.findFirst({
    where: { userId, type: "DEBIT", status: "PENDING" },
  });
  if (pending) {
    throw new AppError(409, "A withdrawal request is already pending");
  }

  return prisma.walletTransaction.create({
    data: {
      userId,
      amount,
      type: "DEBIT",
      status: "PENDING",
      description: `Withdrawal to ${bankDetails.bankName} ${bankDetails.accountNumber}`,
    },
  });
}

export async function listPendingWithdrawals() {
  return prisma.walletTransaction.findMany({
    where: { type: "DEBIT", status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { id: true, name: true, phone: true, role: true } } },
  });
}

export async function completeWithdrawal(transactionId: string) {
  return prisma.$transaction(async (tx) => {
    const txn = await tx.walletTransaction.findUnique({ where: { id: transactionId } });
    if (!txn || txn.type !== "DEBIT" || txn.status !== "PENDING") {
      throw new AppError(400, "Not a pending withdrawal request");
    }

    const user = await tx.user.findUnique({ where: { id: txn.userId } });
    if (!user || Number(user.walletBalance) < Number(txn.amount)) {
      throw new AppError(400, "User balance insufficient to complete withdrawal");
    }

    await tx.user.update({
      where: { id: txn.userId },
      data: { walletBalance: { decrement: txn.amount } },
    });

    return tx.walletTransaction.update({ where: { id: transactionId }, data: { status: "COMPLETED" } });
  });
}

export async function rejectWithdrawal(transactionId: string) {
  const txn = await prisma.walletTransaction.findUnique({ where: { id: transactionId } });
  if (!txn || txn.type !== "DEBIT" || txn.status !== "PENDING") {
    throw new AppError(400, "Not a pending withdrawal request");
  }

  return prisma.walletTransaction.update({ where: { id: transactionId }, data: { status: "FAILED" } });
}
```

Note `listPendingWithdrawals`'s `include` changed from `doctor: {...}` to `user: {...}` (with `role` added so the super admin's withdrawal-approval UI can tell doctor and admin payouts apart) — this is a response-shape change consumers must follow; `doctor.routes.ts` doesn't call this function, only `admin.routes.ts` does, so it's the only call site.

- [ ] **Step 2: Rename `WalletTransactionSchema.doctorId` in `api-client`**

In `packages/api-client/src/schemas/wallet.schema.ts:6-16`:

```typescript
export const WalletTransactionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  callSessionId: z.string().nullable(),
  amount: z.string(),
  type: TxnTypeSchema,
  status: TxnStatusSchema,
  description: z.string().nullable(),
  createdAt: z.string(),
});
export type WalletTransaction = z.infer<typeof WalletTransactionSchema>;
```

- [ ] **Step 3: Add admin's own wallet routes**

In `admin.routes.ts`, import `getWalletBalance`, `createWithdrawRequest` (already imported at the top for the withdrawal-approval endpoints — check line 8, extend that import) and `WithdrawRequestSchema` from `@madamgy/api-client`. Add:

```typescript
adminRouter.get("/wallet", requireAuth("ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const balance = await getWalletBalance(req.user!.sub);
    res.json({ balance: balance.toString() });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/wallet/transactions", requireAuth("ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(Number(req.query.page ?? "1"), 1);
    const limit = 20;
    const [transactions, total] = await Promise.all([
      prisma.walletTransaction.findMany({
        where: { userId: req.user!.sub },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.walletTransaction.count({ where: { userId: req.user!.sub } }),
    ]);

    res.json({ transactions, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/wallet/withdraw", requireAuth("ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { amount, bankName, accountNumber, ifsc, holderName } = WithdrawRequestSchema.parse(req.body);
    const transaction = await createWithdrawRequest(req.user!.sub, amount, {
      bankName,
      accountNumber,
      ifsc,
      holderName,
    });
    res.status(201).json(transaction);
  } catch (error) {
    next(error);
  }
});
```

- [ ] **Step 4: Write the test**

Add to `api-routes.test.ts`:

```typescript
it("lets an ADMIN check their own wallet and request a withdrawal, but not see another user's", async () => {
  const admin = await prisma.user.create({
    data: { phone: "8888700005", name: "Wallet Admin", role: "ADMIN", passwordHash: "x", walletBalance: 100 },
  });
  const adminToken2 = signAccessToken({ sub: admin.id, role: "ADMIN" });

  const balance = await request(app)
    .get("/api/admin/wallet")
    .set("Authorization", `Bearer ${adminToken2}`);
  expect(balance.status).toBe(200);
  expect(balance.body.balance).toBe("100");

  const withdraw = await request(app)
    .post("/api/admin/wallet/withdraw")
    .set("Authorization", `Bearer ${adminToken2}`)
    .send({ amount: 50, bankName: "Test Bank", accountNumber: "12345", ifsc: "TEST0001", holderName: "Wallet Admin" });
  expect(withdraw.status).toBe(201);

  const forbidden = await request(app)
    .get("/api/doctor/wallet")
    .set("Authorization", `Bearer ${adminToken2}`);
  expect(forbidden.status).toBe(403);

  await prisma.walletTransaction.deleteMany({ where: { userId: admin.id } });
  await prisma.user.delete({ where: { id: admin.id } });
});
```

- [ ] **Step 5: Run the test**

Run: `cd packages/server && npm test -- api-routes.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full server test suite**

Run: `cd packages/server && npm test`
Expected: all suites pass.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/services/wallet.service.ts packages/server/src/routes/admin.routes.ts packages/api-client/src/schemas/wallet.schema.ts packages/server/src/__tests__/api-routes.test.ts
git commit -m "feat: generalize wallet service and withdrawal flow to admin role"
```

---

### Task 10: Config-change snapshot isolation (full spec coverage)

**Files:**
- Test: `packages/server/src/__tests__/e2e-consult-flow.test.ts`

**Interfaces:**
- Consumes: `updateRevenueConfig` (Task 5), `createPaymentOrder` (Task 5), `completeCall` (Task 8).

- [ ] **Step 1: Write the snapshot-isolation test**

Add to `e2e-consult-flow.test.ts` (check the file's existing setup for how it spawns/talks to the running server and reuse that pattern — this is the one test in the suite that already exercises the full payment → call → completion path end to end):

```typescript
it("keeps a call's credited split fixed even if RevenueConfig changes afterward", async () => {
  const { updateRevenueConfig, getRevenueConfig } = await import("../services/revenue-config.service.js");
  const { createPaymentOrder, markPaymentPaid } = await import("../services/payment.service.js");
  const { completeCall } = await import("../services/call-completion.service.js");

  const originalConfig = await getRevenueConfig();

  const doctor = await prisma.user.create({
    data: {
      phone: "9999600001",
      name: "Snapshot Doctor",
      role: "DOCTOR",
      doctorProfile: { create: { degree: "MBBS", regNumber: "SNAPSHOT-REG-1", isApproved: true } },
    },
  });
  const patient = await prisma.user.create({
    data: { phone: "9999600002", name: "Snapshot Patient", role: "PATIENT", pinHash: "x" },
  });

  const order = await createPaymentOrder(patient.id);
  await markPaymentPaid(order.razorpayOrderId, "razorpay_pay_snapshot_test");

  const call = await prisma.callSession.create({
    data: {
      patientId: patient.id,
      doctorId: doctor.id,
      status: "ACTIVE",
      livekitRoom: "room-snapshot-test",
      startedAt: new Date(),
    },
  });
  await prisma.payment.update({
    where: { razorpayOrderId: order.razorpayOrderId },
    data: { callSessionId: call.id },
  });

  await updateRevenueConfig(doctor.id, {
    consultationFee: 999,
    doctorPct: 10,
    adminPct: 10,
    superAdminPct: 80,
  });

  await completeCall(call.id);

  const doctorTxn = await prisma.walletTransaction.findFirstOrThrow({
    where: { callSessionId: call.id, userId: doctor.id },
  });
  expect(Number(doctorTxn.amount)).toBeCloseTo(Number(order.amount) * 0.65, 2);
  expect(Number(doctorTxn.amount)).not.toBeCloseTo(999 * 0.1, 2);

  await updateRevenueConfig(doctor.id, {
    consultationFee: Number(originalConfig.consultationFee),
    doctorPct: Number(originalConfig.doctorPct),
    adminPct: Number(originalConfig.adminPct),
    superAdminPct: Number(originalConfig.superAdminPct),
  });

  await prisma.walletTransaction.deleteMany({ where: { callSessionId: call.id } });
  await prisma.payment.deleteMany({ where: { patientId: patient.id } });
  await prisma.callSession.delete({ where: { id: call.id } });
  await prisma.doctorProfile.deleteMany({ where: { userId: doctor.id } });
  await prisma.user.deleteMany({ where: { id: { in: [doctor.id, patient.id] } } });
});
```

- [ ] **Step 2: Run it**

Run: `cd packages/server && npm test -- e2e-consult-flow.test.ts`
Expected: PASS — confirms the credited amount used the `Payment`-snapshotted 65% from order-creation time, not the 10% set afterward.

- [ ] **Step 3: Run the entire server test suite one final time**

Run: `cd packages/server && npm test`
Expected: all suites green.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/__tests__/e2e-consult-flow.test.ts
git commit -m "test: verify revenue config changes don't retroactively affect completed calls"
```
