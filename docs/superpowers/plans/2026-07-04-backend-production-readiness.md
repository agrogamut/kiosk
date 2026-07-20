# Backend Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every backend/infra gap between the current MadamGy build and a real production-ready end-to-end product: security (secrets, throttling, dependency vulns), correctness (call-completion race, wallet fallback, stale-call recovery), the missing payment gateway, compliance-adjacent data capture (consent, doctor verification), admin accountability (audit log), a test harness that actually exercises the worker/socket layer, and ops basics (CI gating, backups, monitoring).

**Architecture:** No new services are introduced beyond what already exists (Express, Socket.IO, Prisma/Postgres, BullMQ/Redis, MinIO, LiveKit token signing) except Razorpay for payments. Every change is additive or behind a flag where it would otherwise break the frontend that ships in the companion (not-yet-applied) frontend plan — see the flag note in Task 7.

**Tech Stack:** Node.js 20, TypeScript 5.4 (strict), Express 4, Prisma 5, BullMQ 5 + ioredis, Zod (shared via `@madamgy/api-client`), Vitest + Supertest, `razorpay` npm SDK (new dependency, Task 7).

## Global Constraints

- Node 20 LTS, TypeScript `strict: true` (see `tsconfig.base.json`) — no `any`, no unused locals/params.
- All async code uses `async/await`, never `.then()` chains.
- All Zod schemas that cross the client/server boundary live in `packages/api-client/src/schemas/` and must be exported from `packages/api-client/src/index.ts`.
- **After every edit to `packages/api-client/src/**`, run `npm run build --workspace @madamgy/api-client` from the repo root before typechecking `server` or `web`** — the compiled `dist/` is what they import, not the source. Forgetting this produces a misleading "Cannot find module '@madamgy/api-client'" error.
- **After every edit to `packages/server/src/prisma/schema.prisma`, run `npx prisma migrate dev --name <change> --schema src/prisma/schema.prisma` from `packages/server/`** (regenerates the client automatically in dev). For CI/deploy, `prisma migrate deploy` does not regenerate the client — follow it with `npx prisma generate --schema src/prisma/schema.prisma`.
- File naming: `kebab-case.ts` for modules, `PascalCase.tsx` for React components (frontend plan only).
- New shell scripts use `fish`, matching `scripts/dev-server.fish` already in the repo — not `bash`/`sh`.
- Tests use the real local Postgres (port 55432), Redis (port 56379), and MinIO (port 19000) already brought up via `docker compose up -d postgres redis minio livekit` — never mock Prisma, Redis, or MinIO in a test. This matches the existing 4 test files' convention.
- Commit after each task (or each numbered step group where noted) with a plain, factual message — no attribution footers, no mention of any tool or assistant.

---

### Task 1: Fix production secrets wiring

**Files:**
- Modify: `docker-compose.yml:49`
- Create: `scripts/generate-secrets.fish`
- Modify: `.env.example` (add a header comment)

**Interfaces:**
- Produces: a real, gitignored `.env` file at repo root containing random JWT secrets, ready for the operator to fill in the remaining service credentials.

- [ ] **Step 1: Reproduce the bug**

Run: `docker compose config | grep -A2 "env_file"`
Expected: shows `env_file: .env.example` under the `api` service — confirming the `api` container would load the template file, not a real secrets file, in any deploy that doesn't override this.

- [ ] **Step 2: Fix the compose file**

In `docker-compose.yml`, change:

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
    env_file: .env.example
```

to:

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
```

- [ ] **Step 3: Add a warning header to `.env.example`**

At the very top of `.env.example`, add:

```
# TEMPLATE FILE — do not deploy with these values.
# Run `fish scripts/generate-secrets.fish` to create a real .env with random JWT secrets,
# then fill in MINIO_*, LIVEKIT_*, MSG91_*, RAZORPAY_*, ADMIN_PASSWORD yourself.
```

- [ ] **Step 4: Write the secrets generator script**

Create `scripts/generate-secrets.fish`:

```fish
#!/usr/bin/env fish
# Generates a real .env from .env.example with random JWT secrets filled in.
# Refuses to overwrite an existing .env.

if test -f .env
    echo ".env already exists — refusing to overwrite. Delete it first if you want to regenerate."
    exit 1
end

set access_secret (openssl rand -hex 32)
set refresh_secret (openssl rand -hex 32)

cp .env.example .env
sed -i "s#^JWT_ACCESS_SECRET=.*#JWT_ACCESS_SECRET=$access_secret#" .env
sed -i "s#^JWT_REFRESH_SECRET=.*#JWT_REFRESH_SECRET=$refresh_secret#" .env

echo "Generated .env with real JWT secrets."
echo "Fill in MINIO_*, LIVEKIT_*, MSG91_*, RAZORPAY_*, ADMIN_PASSWORD manually before deploying."
```

Make it executable: `chmod +x scripts/generate-secrets.fish`

- [ ] **Step 5: Verify the refusal-to-overwrite behavior**

Run: `fish scripts/generate-secrets.fish`
Expected: `Generated .env with real JWT secrets. ...`

Run: `fish scripts/generate-secrets.fish` again
Expected: `.env already exists — refusing to overwrite. Delete it first if you want to regenerate.` and a non-zero exit code (`echo $status` shows `1`).

- [ ] **Step 6: Verify docker compose now resolves real secrets**

Run: `docker compose config | grep JWT_ACCESS_SECRET`
Expected: no output (compose config doesn't expand env_file contents into the printed config directly, since it's a file reference) — instead verify by running: `docker compose run --rm api printenv JWT_ACCESS_SECRET`
Expected: a 64-character hex string, not the literal text `replace-with-64-char-random-string-aaa...`.

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml scripts/generate-secrets.fish .env.example
git commit -m "fix: point production api container at real .env instead of the template"
```

---

### Task 2: Dependency vulnerability remediation

**Files:**
- Modify: `package-lock.json` (regenerated by npm, do not hand-edit)

**Interfaces:**
- None — this task touches no application code, only dependency versions.

- [ ] **Step 1: Capture the baseline**

Run: `npm audit`
Expected: `11 vulnerabilities (4 moderate, 6 high, 1 critical)`

- [ ] **Step 2: Apply non-breaking fixes**

Run: `npm audit fix`
Expected: output lists `form-data`, `react-router`/`react-router-dom`, and the `ws`/`engine.io`/`socket.io-adapter` chain as fixed (these have non-major-version fixes available per the audit report).

- [ ] **Step 3: Re-run the full test suite to confirm nothing broke**

Run: `DATABASE_URL="postgresql://madamgy:madamgy@localhost:55432/madamgy" REDIS_URL="redis://localhost:56379" npm run test`
Expected: `Test Files 4 passed (4)`, `Tests 47 passed (47)` — same as before the dependency bump.

- [ ] **Step 4: Re-check remaining vulnerabilities**

Run: `npm audit`
Expected: only the `esbuild`/`vite`/`vite-node`/`vitest` chain remains (needs a major version bump — `vite@8`). This chain is dev-only tooling (build tool + test runner), never shipped to production, so it is lower priority than anything reachable at runtime.

- [ ] **Step 5: Attempt the major bump in isolation**

Run: `npm audit fix --force`
Expected: installs `vite@8.x` and updates `vitest`/`vite-node` accordingly.

- [ ] **Step 6: Re-run typecheck and tests after the major bump**

Run: `npm run typecheck`
Expected: all 3 workspaces pass (`api-client`, `server`, `web`).

Run: `DATABASE_URL="postgresql://madamgy:madamgy@localhost:55432/madamgy" REDIS_URL="redis://localhost:56379" npm run test`
Expected: `47 passed (47)`.

If either fails: run `git checkout -- package-lock.json packages/*/package.json` to revert the major bump, re-run `npm install`, and leave a note in this task's checkbox that the `vite@8` bump was deferred because it broke `<specific thing>` — do not force it through a failing build.

- [ ] **Step 7: Commit**

```bash
git add package-lock.json package.json packages/*/package.json
git commit -m "chore: update dependencies to resolve npm audit findings"
```

---

### Task 3: Shared auth attempt-lockout helper

**Files:**
- Create: `packages/server/src/lib/rate-limit.ts`
- Test: `packages/server/src/__tests__/rate-limit.test.ts`
- Modify: `packages/server/src/services/auth.service.ts` (refactor `loginPatient` to use the new helper instead of its inline Redis calls)

**Interfaces:**
- Produces: `checkAttemptLimit(key: string): Promise<void>` (throws `AppError(429, ...)` if the key has hit the limit), `recordFailedAttempt(key: string): Promise<void>`, `clearAttempts(key: string): Promise<void>` — all in `packages/server/src/lib/rate-limit.ts`. Tasks 4 and (implicitly) any future login hardening consume these.

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/__tests__/rate-limit.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { redis } from "../lib/redis.js";
import { checkAttemptLimit, clearAttempts, recordFailedAttempt } from "../lib/rate-limit.js";

describe("rate-limit", () => {
  const key = "test_attempts:9999999999";

  afterEach(async () => {
    await redis.del(key);
  });

  it("allows attempts under the limit", async () => {
    await expect(checkAttemptLimit(key)).resolves.toBeUndefined();
  });

  it("throws 429 after 5 failed attempts", async () => {
    for (let i = 0; i < 5; i++) {
      await recordFailedAttempt(key);
    }
    await expect(checkAttemptLimit(key)).rejects.toMatchObject({ statusCode: 429 });
  });

  it("clearAttempts resets the counter", async () => {
    for (let i = 0; i < 5; i++) {
      await recordFailedAttempt(key);
    }
    await clearAttempts(key);
    await expect(checkAttemptLimit(key)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `DATABASE_URL="postgresql://madamgy:madamgy@localhost:55432/madamgy" REDIS_URL="redis://localhost:56379" npx vitest run src/__tests__/rate-limit.test.ts`
Expected: FAIL — `Cannot find module '../lib/rate-limit.js'`

- [ ] **Step 3: Implement the helper**

Check `packages/server/src/middleware/error.middleware.ts` for the exact `AppError` constructor signature before writing this (it takes `(statusCode: number, message: string)` per existing usage in `admin.routes.ts` and elsewhere).

Create `packages/server/src/lib/rate-limit.ts`:

```ts
import { redis } from "./redis.js";
import { AppError } from "../middleware/error.middleware.js";

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 900;

export async function checkAttemptLimit(key: string): Promise<void> {
  const attempts = await redis.get(key);
  if (attempts && Number(attempts) >= MAX_ATTEMPTS) {
    throw new AppError(429, "Too many attempts. Try again in 15 minutes.");
  }
}

export async function recordFailedAttempt(key: string): Promise<void> {
  await redis.incr(key);
  await redis.expire(key, LOCKOUT_SECONDS);
}

export async function clearAttempts(key: string): Promise<void> {
  await redis.del(key);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `DATABASE_URL="postgresql://madamgy:madamgy@localhost:55432/madamgy" REDIS_URL="redis://localhost:56379" npx vitest run src/__tests__/rate-limit.test.ts`
Expected: `3 passed (3)`

- [ ] **Step 5: Refactor `loginPatient` to use the helper (DRY)**

In `packages/server/src/services/auth.service.ts`, replace:

```ts
export async function loginPatient(phone: string, pin: string) {
  const attemptsKey = `pin_attempts:${phone}`;
  const attempts = await redis.get(attemptsKey);
  if (attempts && Number(attempts) >= 5) {
    throw new AppError(429, "Account locked. Try again in 15 minutes.");
  }

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user || user.role !== "PATIENT" || !user.pinHash) {
    throw new AppError(401, "Invalid credentials");
  }
  if (user.disabled) {
    throw new AppError(403, "Account disabled");
  }

  const valid = await bcrypt.compare(pin, user.pinHash);
  if (!valid) {
    await redis.incr(attemptsKey);
    await redis.expire(attemptsKey, 900);
    throw new AppError(401, "Invalid credentials");
  }

  await redis.del(attemptsKey);
  return user;
}
```

with:

```ts
export async function loginPatient(phone: string, pin: string) {
  const attemptsKey = `pin_attempts:${phone}`;
  await checkAttemptLimit(attemptsKey);

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user || user.role !== "PATIENT" || !user.pinHash) {
    throw new AppError(401, "Invalid credentials");
  }
  if (user.disabled) {
    throw new AppError(403, "Account disabled");
  }

  const valid = await bcrypt.compare(pin, user.pinHash);
  if (!valid) {
    await recordFailedAttempt(attemptsKey);
    throw new AppError(401, "Invalid credentials");
  }

  await clearAttempts(attemptsKey);
  return user;
}
```

Add the import at the top of `auth.service.ts`: `import { checkAttemptLimit, clearAttempts, recordFailedAttempt } from "../lib/rate-limit.js";`. Remove the now-unused direct `redis` import if nothing else in the file uses it (check with `grep -n "redis\." packages/server/src/services/auth.service.ts` first).

- [ ] **Step 6: Run the full auth test file to confirm the refactor didn't change behavior**

Run: `DATABASE_URL="postgresql://madamgy:madamgy@localhost:55432/madamgy" REDIS_URL="redis://localhost:56379" npx vitest run src/__tests__/auth.test.ts`
Expected: `16 passed (16)` — identical to before the refactor.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/lib/rate-limit.ts packages/server/src/__tests__/rate-limit.test.ts packages/server/src/services/auth.service.ts
git commit -m "refactor: extract shared Redis attempt-lockout helper from patient PIN login"
```

---

### Task 4: Patient OTP login (additive, alongside existing PIN login)

**Files:**
- Modify: `packages/api-client/src/schemas/user.schema.ts`
- Modify: `packages/server/src/services/auth.service.ts`
- Modify: `packages/server/src/services/otp.service.ts` (add lockout to `verifyOtp`, used by both doctor and patient OTP paths)
- Modify: `packages/server/src/routes/auth.routes.ts`
- Test: `packages/server/src/__tests__/auth.test.ts`

**Interfaces:**
- Consumes: `checkAttemptLimit`, `recordFailedAttempt`, `clearAttempts` from Task 3.
- Produces: `POST /api/auth/patient/login/otp/initiate` and `POST /api/auth/patient/login/otp/verify`. The existing `POST /api/auth/patient/login` (PIN) is left untouched and fully functional — the frontend plan (status: READY as of 2026-07-21, see `2026-07-04-frontend-kiosk-client.md` Task 5) is responsible for cutting the UI over to the new endpoints, at which point a follow-up change can remove the PIN path.

- [ ] **Step 1: Make `pin` optional at registration (non-breaking schema change)**

In `packages/api-client/src/schemas/user.schema.ts`, change:

```ts
export const PatientRegisterSchema = z.object({
  phone: z.string().min(10).max(15),
  name: z.string().min(1).max(100),
  dob: DateOfBirthSchema,
  pin: z.string().length(4).regex(/^\d{4}$/),
});
```

to:

```ts
export const PatientRegisterSchema = z.object({
  phone: z.string().min(10).max(15),
  name: z.string().min(1).max(100),
  dob: DateOfBirthSchema,
  pin: z.string().length(4).regex(/^\d{4}$/).optional(),
});
```

Add two new schemas in the same file, after `PatientLoginSchema`:

```ts
export const PatientLoginOtpInitiateSchema = z.object({
  phone: z.string().min(10).max(15),
});
export type PatientLoginOtpInitiate = z.infer<typeof PatientLoginOtpInitiateSchema>;

export const PatientLoginOtpVerifySchema = z.object({
  phone: z.string().min(10).max(15),
  otp: z.string().length(6).regex(/^\d{6}$/),
});
export type PatientLoginOtpVerify = z.infer<typeof PatientLoginOtpVerifySchema>;
```

- [ ] **Step 2: Rebuild api-client**

Run (from repo root): `npm run build --workspace @madamgy/api-client`
Expected: `tsc` completes with no errors, `packages/api-client/dist/index.d.ts` timestamp updates.

- [ ] **Step 3: Write the failing test**

In `packages/server/src/__tests__/auth.test.ts`, find the existing `describe("Patient auth", ...)` block (check its exact name with `grep -n "describe(" src/__tests__/auth.test.ts` first) and add a new nested block after the existing PIN login tests:

```ts
  describe("Patient OTP login", () => {
    it("registers a patient with no pin, then logs in via OTP", async () => {
      const phone = "8888500001";
      const register = await request(app).post("/api/auth/patient/register").send({
        phone,
        name: "OTP Patient",
        dob: "15/06/1985",
      });
      expect(register.status).toBe(201);

      const initiate = await request(app).post("/api/auth/patient/login/otp/initiate").send({ phone });
      expect(initiate.status).toBe(200);

      const verify = await request(app).post("/api/auth/patient/login/otp/verify").send({ phone, otp: "000000" });
      expect(verify.status).toBe(200);
      expect(verify.body.user.role).toBe("PATIENT");
      expect(verify.body.accessToken).toBeTruthy();
    });

    it("rejects a wrong OTP and locks out after 5 attempts", async () => {
      const phone = "8888500002";
      await request(app).post("/api/auth/patient/register").send({
        phone,
        name: "OTP Lockout Patient",
        dob: "15/06/1985",
      });
      await request(app).post("/api/auth/patient/login/otp/initiate").send({ phone });

      for (let i = 0; i < 5; i++) {
        const attempt = await request(app)
          .post("/api/auth/patient/login/otp/verify")
          .send({ phone, otp: "111111" });
        expect(attempt.status).toBe(401);
      }

      const locked = await request(app)
        .post("/api/auth/patient/login/otp/verify")
        .send({ phone, otp: "111111" });
      expect(locked.status).toBe(429);
    });
  });
```

Also add both new phone numbers (`"888850"` prefix) to the existing `afterAll` cleanup's `startsWith` filter — check the exact cleanup block with `grep -n "startsWith" src/__tests__/auth.test.ts` and extend its phone-prefix filter to cover `8888` (it should already, if the existing tests use an `8888`-prefixed range; if the existing filter is narrower, e.g. `startsWith: "88881"`, broaden it or add a second `deleteMany` call for `"88885"`).

- [ ] **Step 4: Run it to verify it fails**

Run: `DATABASE_URL="postgresql://madamgy:madamgy@localhost:55432/madamgy" REDIS_URL="redis://localhost:56379" npx vitest run src/__tests__/auth.test.ts`
Expected: FAIL — `404` on `/api/auth/patient/login/otp/initiate` (route doesn't exist yet).

- [ ] **Step 5: Add lockout to `verifyOtp`**

In `packages/server/src/services/otp.service.ts`, this function currently has no attempt limit at all — a 6-digit OTP within its 300s TTL can be brute-forced unthrottled. Change:

```ts
export async function verifyOtp(phone: string, code: string): Promise<boolean> {
  const stored = await redis.call("GETDEL", otpKey(phone));
  return stored === code;
}
```

to a version that does NOT itself throw (callers decide when to lock, since doctor and patient callers both need to call `checkAttemptLimit` first) — leave `verifyOtp` as a pure boolean check, and add the lockout at the call site instead (Step 6 below), matching how `loginPatient` already does it in `auth.service.ts`. No change needed to `otp.service.ts` itself — skip to Step 6.

- [ ] **Step 6: Implement the service functions**

In `packages/server/src/services/auth.service.ts`, replace `registerPatient` with a version that makes `pin` optional:

```ts
export async function registerPatient(data: {
  phone: string;
  name: string;
  dob: string;
  pin?: string;
}) {
  const existing = await prisma.user.findUnique({ where: { phone: data.phone } });
  if (existing) {
    throw new AppError(409, "Phone already registered");
  }

  const dob = parseDateOfBirth(data.dob);
  const pinHash = data.pin ? await bcrypt.hash(data.pin, 12) : null;
  return prisma.user.create({
    data: {
      phone: data.phone,
      name: data.name,
      role: "PATIENT",
      pinHash,
      patientProfile: { create: { dob } },
    },
  });
}

export async function findActivePatientByPhone(phone: string) {
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user || user.role !== "PATIENT") {
    throw new AppError(401, "Invalid credentials");
  }
  if (user.disabled) {
    throw new AppError(403, "Account disabled");
  }
  return user;
}
```

(`findActivePatientByPhone` is a new export — add it, don't replace anything else in the file.)

- [ ] **Step 7: Add the routes**

In `packages/server/src/routes/auth.routes.ts`, add these imports:

```ts
import {
  AdminLoginSchema,
  DoctorLoginInitiateSchema,
  DoctorLoginVerifySchema,
  DoctorRegisterSchema,
  PatientLoginSchema,
  PatientLoginOtpInitiateSchema,
  PatientLoginOtpVerifySchema,
  PatientRegisterSchema,
} from "@madamgy/api-client";
import { checkAttemptLimit, clearAttempts, recordFailedAttempt } from "../lib/rate-limit.js";
import {
  findActivePatientByPhone,
  loginAdmin,
  loginDoctorInitiate,
  loginPatient,
  registerDoctor,
  registerPatient,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../services/auth.service.js";
```

Add the two routes after the existing `authRouter.post("/patient/login", ...)` block:

```ts
authRouter.post(
  "/patient/login/otp/initiate",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { phone } = PatientLoginOtpInitiateSchema.parse(req.body);
      await findActivePatientByPhone(phone);
      const otp = await storeOtp(phone);
      await sendOtpSms(phone, otp);
      res.json({ message: "OTP sent" });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post(
  "/patient/login/otp/verify",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { phone, otp } = PatientLoginOtpVerifySchema.parse(req.body);
      const attemptKey = `otp_attempts:${phone}`;
      await checkAttemptLimit(attemptKey);

      const valid = await verifyOtp(phone, otp);
      if (!valid) {
        await recordFailedAttempt(attemptKey);
        throw new AppError(401, "Invalid or expired OTP");
      }
      await clearAttempts(attemptKey);

      const user = await findActivePatientByPhone(phone);
      const payload = { sub: user.id, role: user.role };
      const accessToken = signAccessToken(payload);
      const refreshToken = signRefreshToken(payload);
      setRefreshCookie(res, refreshToken);
      res.json({ accessToken, user: { id: user.id, name: user.name, role: user.role } });
    } catch (error) {
      next(error);
    }
  },
);
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `DATABASE_URL="postgresql://madamgy:madamgy@localhost:55432/madamgy" REDIS_URL="redis://localhost:56379" npx vitest run src/__tests__/auth.test.ts`
Expected: all tests in the file pass, including the 2 new ones.

- [ ] **Step 9: Run the full suite to confirm no regressions**

Run: `DATABASE_URL="postgresql://madamgy:madamgy@localhost:55432/madamgy" REDIS_URL="redis://localhost:56379" npm run test`
Expected: `Tests 49 passed (49)` (47 existing + 2 new).

- [ ] **Step 10: Commit**

```bash
git add packages/api-client/src/schemas/user.schema.ts packages/api-client/dist packages/server/src/services/auth.service.ts packages/server/src/routes/auth.routes.ts packages/server/src/__tests__/auth.test.ts
git commit -m "feat: add patient OTP login alongside existing PIN login"
```

---

### Task 5: Unify call-completion and wallet crediting

**Files:**
- Create: `packages/server/src/services/call-completion.service.ts`
- Modify: `packages/server/src/socket/call.handler.ts`
- Modify: `packages/server/src/workers/render-pdf.worker.ts`
- Test: `packages/server/src/__tests__/call-completion.test.ts`

**Interfaces:**
- Produces: `completeCall(callSessionId: string): Promise<void>` — idempotent; ends the call, frees the doctor, and credits commission exactly once regardless of whether it's called from the socket `call:end` path or the PDF-render worker. Task 6's stale-call reaper also consumes this.

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/__tests__/call-completion.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma.js";
import { completeCall } from "../services/call-completion.service.js";

describe("completeCall", () => {
  let patientId: string;
  let doctorId: string;
  let callId: string;

  beforeAll(async () => {
    const patient = await prisma.user.create({
      data: { phone: "8888600001", name: "Completion Patient", role: "PATIENT" },
    });
    patientId = patient.id;

    const doctor = await prisma.user.create({
      data: {
        phone: "8888600002",
        name: "Completion Doctor",
        role: "DOCTOR",
        doctorProfile: {
          create: { degree: "MBBS", regNumber: "COMPLETION-REG-1", isApproved: true, isAvailable: false },
        },
      },
    });
    doctorId = doctor.id;

    const call = await prisma.callSession.create({
      data: { patientId, doctorId, status: "ACTIVE", livekitRoom: "room-completion-test", startedAt: new Date() },
    });
    callId = call.id;
  });

  afterAll(async () => {
    await prisma.walletTransaction.deleteMany({ where: { doctorId } });
    await prisma.callSession.deleteMany({ where: { id: callId } });
    await prisma.doctorProfile.deleteMany({ where: { userId: doctorId } });
    await prisma.user.deleteMany({ where: { id: { in: [patientId, doctorId] } } });
  });

  it("ends an ACTIVE call with no prescription and still credits commission once", async () => {
    await completeCall(callId);

    const call = await prisma.callSession.findUniqueOrThrow({ where: { id: callId } });
    expect(call.status).toBe("ENDED");
    expect(call.endedAt).not.toBeNull();

    const profile = await prisma.doctorProfile.findUniqueOrThrow({ where: { userId: doctorId } });
    expect(profile.isAvailable).toBe(true);
    expect(Number(profile.walletBalance)).toBeGreaterThan(0);

    const transactions = await prisma.walletTransaction.findMany({ where: { callSessionId: callId } });
    expect(transactions).toHaveLength(1);
    expect(transactions[0].type).toBe("CREDIT");
  });

  it("is idempotent — calling it again does not double-credit or throw", async () => {
    await completeCall(callId);

    const transactions = await prisma.walletTransaction.findMany({ where: { callSessionId: callId } });
    expect(transactions).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `DATABASE_URL="postgresql://madamgy:madamgy@localhost:55432/madamgy" REDIS_URL="redis://localhost:56379" npx vitest run src/__tests__/call-completion.test.ts`
Expected: FAIL — `Cannot find module '../services/call-completion.service.js'`

- [ ] **Step 3: Implement `completeCall`**

Create `packages/server/src/services/call-completion.service.ts`:

```ts
import { prisma } from "../lib/prisma.js";
import { io } from "../index.js";

const CONSULTATION_FEE = Number(process.env.CONSULTATION_FEE ?? "200");
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
        const profile = await tx.doctorProfile.findUnique({ where: { userId: call.doctorId } });
        const commissionRate = Number(profile?.commissionRate ?? 0.8);
        const earning = Number((CONSULTATION_FEE * commissionRate).toFixed(2));
        await tx.walletTransaction.create({
          data: {
            doctorId: call.doctorId,
            callSessionId,
            amount: earning,
            type: "CREDIT",
            status: "COMPLETED",
            description: `Consultation fee - ${callSessionId}`,
          },
        });
        await tx.doctorProfile.update({
          where: { userId: call.doctorId },
          data: { walletBalance: { increment: earning } },
        });
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

- [ ] **Step 4: Run the test to verify it passes**

Run: `DATABASE_URL="postgresql://madamgy:madamgy@localhost:55432/madamgy" REDIS_URL="redis://localhost:56379" npx vitest run src/__tests__/call-completion.test.ts`
Expected: `2 passed (2)`

- [ ] **Step 5: Wire `call:end` to use it**

In `packages/server/src/socket/call.handler.ts`, add the import: `import { completeCall } from "../services/call-completion.service.js";`

Replace the entire `socket.on("call:end", ...)` handler body with:

```ts
  socket.on("call:end", async ({ callSessionId }: { callSessionId: string }) => {
    try {
      const call = await prisma.callSession.findUnique({ where: { id: callSessionId } });
      if (!call || (call.patientId !== userId && call.doctorId !== userId)) {
        return;
      }

      await completeCall(callSessionId);
    } catch (error) {
      console.error("call:end error", error);
    }
  });
```

The `Prisma` type import at the top of the file (`import type { Prisma } from "@prisma/client";`) is no longer used by this handler if it was only used for the removed `operations` array — check with `grep -n "Prisma\." packages/server/src/socket/call.handler.ts` and remove the import if nothing else in the file references `Prisma.`.

- [ ] **Step 6: Simplify the PDF worker to delegate ending/crediting**

In `packages/server/src/workers/render-pdf.worker.ts`, add the import: `import { completeCall } from "../services/call-completion.service.js";`

Replace the `$transaction` block and the emits after it:

```ts
      const transactionResult = await prisma.$transaction(async (tx) => {
        await tx.prescription.update({
          where: { id: prescriptionId },
          data: { objectKey, pdfReady: true },
        });
        const healthFile = await tx.healthFile.create({
          data: {
            userId: prescription.patientId,
            prescriptionId,
            name: `Prescription - ${new Date(prescription.createdAt).toLocaleDateString("en-IN")}`,
            type: "PRESCRIPTION",
            objectKey,
            sizeBytes: buffer.length,
          },
        });
        await tx.walletTransaction.create({
          data: {
            doctorId: prescription.doctorId,
            callSessionId: prescription.callSessionId,
            amount: earning,
            type: "CREDIT",
            status: "COMPLETED",
            description: `Consultation fee - ${prescription.callSession.id}`,
          },
        });
        await tx.doctorProfile.update({
          where: { userId: prescription.doctorId },
          data: { walletBalance: { increment: earning }, isAvailable: true },
        });
        await tx.callSession.update({
          where: { id: prescription.callSessionId },
          data: { status: "ENDED", endedAt: new Date() },
        });

        return { healthFile };
      });

      io.to(`user:${prescription.patientId}`).emit("prescription:ready", {
        callSessionId: prescription.callSessionId,
        healthFileId: transactionResult.healthFile.id,
      });
      io.to(`user:${prescription.patientId}`).emit("call:ended", {
        callSessionId: prescription.callSessionId,
      });
      io.to(`user:${prescription.doctorId}`).emit("call:ended", {
        callSessionId: prescription.callSessionId,
      });
```

with:

```ts
      const { healthFile } = await prisma.$transaction(async (tx) => {
        await tx.prescription.update({
          where: { id: prescriptionId },
          data: { objectKey, pdfReady: true },
        });
        const createdHealthFile = await tx.healthFile.create({
          data: {
            userId: prescription.patientId,
            prescriptionId,
            name: `Prescription - ${new Date(prescription.createdAt).toLocaleDateString("en-IN")}`,
            type: "PRESCRIPTION",
            objectKey,
            sizeBytes: buffer.length,
          },
        });

        return { healthFile: createdHealthFile };
      });

      await completeCall(prescription.callSessionId);

      io.to(`user:${prescription.patientId}`).emit("prescription:ready", {
        callSessionId: prescription.callSessionId,
        healthFileId: healthFile.id,
      });
```

The `earning`/`commissionRate` calculation lines above this block are now dead code (moved into `completeCall`) — delete the two lines computing `commissionRate` and `earning` from this file.

- [ ] **Step 7: Run the prescriptions test file to confirm the refactor preserves behavior**

Note: `packages/server/src/index.ts` disables workers under `NODE_ENV=test`, so `prescriptions.test.ts` does not exercise `render-pdf.worker.ts` directly today (confirmed in the prior audit) — this step verifies the route-level contract is unchanged, not the worker body. The worker body is exercised by Task 11's new end-to-end test.

Run: `DATABASE_URL="postgresql://madamgy:madamgy@localhost:55432/madamgy" REDIS_URL="redis://localhost:56379" npx vitest run src/__tests__/prescriptions.test.ts`
Expected: `6 passed (6)`

- [ ] **Step 8: Run the full suite**

Run: `DATABASE_URL="postgresql://madamgy:madamgy@localhost:55432/madamgy" REDIS_URL="redis://localhost:56379" npm run test`
Expected: `49 passed (49)`

- [ ] **Step 9: Commit**

```bash
git add packages/server/src/services/call-completion.service.ts packages/server/src/socket/call.handler.ts packages/server/src/workers/render-pdf.worker.ts packages/server/src/__tests__/call-completion.test.ts
git commit -m "fix: unify call-ending and wallet crediting into one idempotent function"
```

---

### Task 6: Doctor presence heartbeat and stale-call reaper

**Files:**
- Modify: `packages/server/src/socket/presence.handler.ts`
- Modify: `packages/server/src/socket/index.ts:41-43`
- Create: `packages/server/src/workers/stale-call-reaper.worker.ts`
- Modify: `packages/server/src/index.ts`
- Test: `packages/server/src/__tests__/stale-call-reaper.test.ts`

**Interfaces:**
- Consumes: `completeCall` from Task 5.
- Produces: `reapStaleCalls(): Promise<number>` (returns the count of calls it ended) and `startStaleCallReaper(intervalMs?: number): ReturnType<typeof setInterval>` in `packages/server/src/workers/stale-call-reaper.worker.ts`.
- **Frontend dependency**: this only works once the doctor-side client emits `presence:ping` on an interval (e.g. every 20s) while the doctor dashboard is open. Today nothing calls it. This is tracked as a required task in the companion frontend plan — until that ships, this reaper will end every `ACTIVE` call after ~45 seconds because no heartbeat will ever be recorded. Do not enable this in production before the frontend heartbeat ships, or gate it with `STALE_CALL_REAPER_ENABLED=false` initially (see Step 6).

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/__tests__/stale-call-reaper.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";
import { reapStaleCalls } from "../workers/stale-call-reaper.worker.js";

describe("reapStaleCalls", () => {
  let patientId: string;
  let doctorId: string;
  let callId: string;

  beforeAll(async () => {
    const patient = await prisma.user.create({
      data: { phone: "8888700001", name: "Reaper Patient", role: "PATIENT" },
    });
    patientId = patient.id;

    const doctor = await prisma.user.create({
      data: {
        phone: "8888700002",
        name: "Reaper Doctor",
        role: "DOCTOR",
        doctorProfile: { create: { degree: "MBBS", regNumber: "REAPER-REG-1", isApproved: true } },
      },
    });
    doctorId = doctor.id;

    const call = await prisma.callSession.create({
      data: { patientId, doctorId, status: "ACTIVE", livekitRoom: "room-reaper-test", startedAt: new Date() },
    });
    callId = call.id;
  });

  afterAll(async () => {
    await redis.del(`doctor_heartbeat:${doctorId}`);
    await prisma.walletTransaction.deleteMany({ where: { doctorId } });
    await prisma.callSession.deleteMany({ where: { id: callId } });
    await prisma.doctorProfile.deleteMany({ where: { userId: doctorId } });
    await prisma.user.deleteMany({ where: { id: { in: [patientId, doctorId] } } });
  });

  it("ends an ACTIVE call whose doctor has no heartbeat", async () => {
    const reaped = await reapStaleCalls();
    expect(reaped).toBeGreaterThanOrEqual(1);

    const call = await prisma.callSession.findUniqueOrThrow({ where: { id: callId } });
    expect(call.status).toBe("ENDED");
  });

  it("leaves an ACTIVE call alone if the doctor has a fresh heartbeat", async () => {
    const call2 = await prisma.callSession.create({
      data: { patientId, doctorId, status: "ACTIVE", livekitRoom: "room-reaper-test-2", startedAt: new Date() },
    });
    await redis.set(`doctor_heartbeat:${doctorId}`, "1", "EX", 45);

    await reapStaleCalls();

    const refreshed = await prisma.callSession.findUniqueOrThrow({ where: { id: call2.id } });
    expect(refreshed.status).toBe("ACTIVE");

    await prisma.callSession.deleteMany({ where: { id: call2.id } });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `DATABASE_URL="postgresql://madamgy:madamgy@localhost:55432/madamgy" REDIS_URL="redis://localhost:56379" npx vitest run src/__tests__/stale-call-reaper.test.ts`
Expected: FAIL — `Cannot find module '../workers/stale-call-reaper.worker.js'`

- [ ] **Step 3: Implement the reaper**

Create `packages/server/src/workers/stale-call-reaper.worker.ts`:

```ts
import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";
import { completeCall } from "../services/call-completion.service.js";

export async function reapStaleCalls(): Promise<number> {
  const activeCalls = await prisma.callSession.findMany({
    where: { status: "ACTIVE", doctorId: { not: null } },
  });

  let reaped = 0;
  for (const call of activeCalls) {
    const heartbeat = await redis.get(`doctor_heartbeat:${call.doctorId}`);
    if (!heartbeat) {
      await completeCall(call.id);
      reaped++;
    }
  }
  return reaped;
}

export function startStaleCallReaper(intervalMs = 30_000): ReturnType<typeof setInterval> {
  return setInterval(() => {
    reapStaleCalls().catch((error: unknown) => console.error("stale-call-reaper error", error));
  }, intervalMs);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `DATABASE_URL="postgresql://madamgy:madamgy@localhost:55432/madamgy" REDIS_URL="redis://localhost:56379" npx vitest run src/__tests__/stale-call-reaper.test.ts`
Expected: `2 passed (2)`

- [ ] **Step 5: Wire the real heartbeat write in `presence.handler.ts`**

Replace the entire contents of `packages/server/src/socket/presence.handler.ts`:

```ts
import type { Socket } from "socket.io";
import { redis } from "../lib/redis.js";

const HEARTBEAT_TTL_SECONDS = 45;

export function registerPresenceHandlers(socket: Socket, userId: string, userRole: string): void {
  socket.on("presence:ping", () => {
    socket.emit("presence:pong");
    if (userRole === "DOCTOR") {
      void redis.set(`doctor_heartbeat:${userId}`, "1", "EX", HEARTBEAT_TTL_SECONDS);
    }
  });
}
```

Update the call site in `packages/server/src/socket/index.ts` — change:

```ts
    registerPresenceHandlers(socket);
```

to:

```ts
    registerPresenceHandlers(socket, userId, userRole);
```

- [ ] **Step 6: Wire the reaper into server startup, behind a flag defaulting to off**

In `packages/server/src/index.ts`, add the import: `import { startStaleCallReaper } from "./workers/stale-call-reaper.worker.js";`

In the `if (process.env.NODE_ENV !== "test") { ... }` block that starts the other two workers, add:

```ts
  if (process.env.STALE_CALL_REAPER_ENABLED === "true") {
    startStaleCallReaper();
    console.log("Stale call reaper started");
  }
```

Add to `.env.example`: `STALE_CALL_REAPER_ENABLED=false` with a comment: `# set to true only after the frontend plan's doctor-heartbeat task has shipped — otherwise every ACTIVE call gets ended after ~45s with no heartbeat ever recorded`.

- [ ] **Step 7: Run the full suite**

Run: `DATABASE_URL="postgresql://madamgy:madamgy@localhost:55432/madamgy" REDIS_URL="redis://localhost:56379" npm run test`
Expected: `51 passed (51)`

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/socket/presence.handler.ts packages/server/src/socket/index.ts packages/server/src/workers/stale-call-reaper.worker.ts packages/server/src/index.ts packages/server/src/__tests__/stale-call-reaper.test.ts .env.example
git commit -m "feat: add doctor presence heartbeat and stale-call reaper, off by default"
```

---

### Task 7: Razorpay payment gateway for patient consultation fee

**Files:**
- Modify: `packages/server/src/prisma/schema.prisma`
- Create: `packages/server/src/services/payment.service.ts`
- Create: `packages/server/src/routes/payments.routes.ts`
- Modify: `packages/server/src/routes/calls.routes.ts`
- Modify: `packages/server/src/workers/assign-doctor.worker.ts`
- Modify: `packages/server/src/index.ts`
- Modify: `packages/server/package.json` (new dependency)
- Modify: `.env.example`
- Test: `packages/server/src/__tests__/payments.test.ts`

**Interfaces:**
- Produces: `createPaymentOrder(patientId)`, `verifyWebhookSignature(rawBody, signature)`, `markPaymentPaid(razorpayOrderId, razorpayPaymentId)`, `refundPayment(paymentId)` in `payment.service.ts`. Routes: `POST /api/payments/order`, `POST /api/payments/webhook`, `GET /api/payments/:id`.
- **Breaking-change note**: gating `POST /api/calls` on a paid `Payment` is a real contract change the current frontend does not implement (it posts with no body today). This is shipped **behind `REQUIRE_PAYMENT_FOR_CALLS`, defaulting to `"false"`** so the live, already-verified consult flow keeps working until the companion frontend plan's payment checkout task ships. Flip the env var only after that frontend work is deployed.

**Assumption to confirm before starting this task:** you need a free Razorpay test-mode account (dashboard.razorpay.com → Test Mode) with a Test Key ID/Secret and a webhook secret configured against a tunnel (e.g. `ngrok http 3900` → paste the forwarding URL + `/api/payments/webhook` into the Razorpay webhook dashboard for local testing). If you don't have one yet, get it before Step 1 — the order-creation test makes a real call to Razorpay's sandbox API, consistent with this codebase's existing convention of testing against real dependencies (Postgres/Redis/MinIO) rather than mocks.

- [ ] **Step 1: Add the Razorpay SDK dependency**

Run (from `packages/server/`): `npm install razorpay@2`
Expected: `package.json` gains `"razorpay": "^2.x.x"` under `dependencies`.

- [ ] **Step 2: Add the Payment model**

In `packages/server/src/prisma/schema.prisma`, add a new enum near the other enums:

```prisma
enum PaymentStatus {
  CREATED
  PAID
  FAILED
  REFUNDED
}
```

Add a new model after `CallSession`:

```prisma
model Payment {
  id                String        @id @default(cuid())
  patientId         String
  callSessionId     String?       @unique
  amount            Decimal       @db.Decimal(10, 2)
  razorpayOrderId   String        @unique
  razorpayPaymentId String?
  status            PaymentStatus @default(CREATED)
  createdAt         DateTime      @default(now())

  patient     User         @relation(fields: [patientId], references: [id])
  callSession CallSession? @relation(fields: [callSessionId], references: [id])

  @@index([patientId])
}
```

Add the back-relations. In `model User`, add: `payments Payment[]`
In `model CallSession`, add: `payment Payment?`

- [ ] **Step 3: Run the migration**

Run (from `packages/server/`): `DATABASE_URL="postgresql://madamgy:madamgy@localhost:55432/madamgy" npx prisma migrate dev --name add_payment_model --schema src/prisma/schema.prisma`
Expected: `Applying migration ... The following migration(s) have been applied: migrations/<timestamp>_add_payment_model/` and the Prisma Client regenerates automatically.

- [ ] **Step 4: Write the failing tests**

Create `packages/server/src/__tests__/payments.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../index.js";
import { prisma } from "../lib/prisma.js";
import { signAccessToken } from "../services/auth.service.js";
import { markPaymentPaid, refundPayment, verifyWebhookSignature } from "../services/payment.service.js";
import crypto from "crypto";

describe("Payments", () => {
  let patientId: string;
  let patientToken: string;

  beforeAll(async () => {
    const patient = await prisma.user.create({
      data: { phone: "8888800001", name: "Payment Patient", role: "PATIENT" },
    });
    patientId = patient.id;
    patientToken = signAccessToken({ sub: patient.id, role: "PATIENT" });
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { patientId } });
    await prisma.user.deleteMany({ where: { id: patientId } });
  });

  it("creates a real Razorpay order and a CREATED payment row", async () => {
    const response = await request(app)
      .post("/api/payments/order")
      .set("Authorization", `Bearer ${patientToken}`);

    expect(response.status).toBe(201);
    expect(response.body.razorpayOrderId).toMatch(/^order_/);
    expect(response.body.amount).toBe(200);

    const payment = await prisma.payment.findUniqueOrThrow({
      where: { razorpayOrderId: response.body.razorpayOrderId },
    });
    expect(payment.status).toBe("CREATED");
  });

  it("verifies a webhook signature correctly and rejects a tampered one", () => {
    const body = JSON.stringify({ event: "payment.captured" });
    const validSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
      .update(body)
      .digest("hex");

    expect(verifyWebhookSignature(body, validSignature)).toBe(true);
    expect(verifyWebhookSignature(body, "deadbeef")).toBe(false);
  });

  it("marks a payment paid and can refund it", async () => {
    const order = await request(app)
      .post("/api/payments/order")
      .set("Authorization", `Bearer ${patientToken}`);

    const paid = await markPaymentPaid(order.body.razorpayOrderId, "pay_test_fake_id_for_status_only");
    expect(paid.status).toBe("PAID");

    // refundPayment calls the real Razorpay refund API, which will reject a fake payment id —
    // this assertion only checks that our code surfaces a clear error rather than an unhandled crash.
    await expect(refundPayment(paid.id)).rejects.toThrow();
  });
});
```

Note the last test's honesty about its limitation: refunding a fake `razorpayPaymentId` will fail against the real sandbox API (there's no real payment to refund), so it asserts the failure is a clean thrown error, not a false-positive "success." A true refund-success path is exercised manually once, by completing one real Test Mode checkout via the frontend (companion plan) and refunding it from the admin/ops side — automating a full card-capture-then-refund cycle in CI is out of scope for this task.

- [ ] **Step 5: Run it to verify it fails**

Run: `DATABASE_URL="postgresql://madamgy:madamgy@localhost:55432/madamgy" REDIS_URL="redis://localhost:56379" RAZORPAY_KEY_ID=<your test key id> RAZORPAY_KEY_SECRET=<your test key secret> RAZORPAY_WEBHOOK_SECRET=<your webhook secret> npx vitest run src/__tests__/payments.test.ts`
Expected: FAIL — `Cannot find module '../services/payment.service.js'`

- [ ] **Step 6: Implement the service**

Create `packages/server/src/services/payment.service.ts`:

```ts
import Razorpay from "razorpay";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../middleware/error.middleware.js";

const CONSULTATION_FEE = Number(process.env.CONSULTATION_FEE ?? "200");

function getRazorpayClient(): Razorpay {
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
  });
}

export async function createPaymentOrder(patientId: string) {
  const razorpay = getRazorpayClient();
  const order = await razorpay.orders.create({
    amount: CONSULTATION_FEE * 100,
    currency: "INR",
    receipt: `consult_${patientId}_${Date.now()}`,
  });

  const payment = await prisma.payment.create({
    data: {
      patientId,
      amount: CONSULTATION_FEE,
      razorpayOrderId: order.id,
      status: "CREATED",
    },
  });

  return {
    paymentId: payment.id,
    razorpayOrderId: order.id,
    amount: CONSULTATION_FEE,
    keyId: process.env.RAZORPAY_KEY_ID,
  };
}

export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
    .update(rawBody)
    .digest("hex");
  return expected === signature;
}

export async function markPaymentPaid(razorpayOrderId: string, razorpayPaymentId: string) {
  return prisma.payment.update({
    where: { razorpayOrderId },
    data: { status: "PAID", razorpayPaymentId },
  });
}

export async function refundPayment(paymentId: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || !payment.razorpayPaymentId) {
    throw new AppError(400, "Payment not eligible for refund");
  }

  const razorpay = getRazorpayClient();
  await razorpay.payments.refund(payment.razorpayPaymentId, {});
  return prisma.payment.update({ where: { id: paymentId }, data: { status: "REFUNDED" } });
}
```

- [ ] **Step 7: Implement the routes**

Create `packages/server/src/routes/payments.routes.ts`:

```ts
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { createPaymentOrder, markPaymentPaid, verifyWebhookSignature } from "../services/payment.service.js";

export const paymentsRouter = Router();

paymentsRouter.post("/order", requireAuth("PATIENT"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await createPaymentOrder(req.user!.sub);
    res.status(201).json(order);
  } catch (error) {
    next(error);
  }
});

paymentsRouter.post("/webhook", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const rawBody = (req.body as Buffer).toString("utf-8");
    if (typeof signature !== "string" || !verifyWebhookSignature(rawBody, signature)) {
      res.status(400).json({ message: "Invalid signature" });
      return;
    }

    const event = JSON.parse(rawBody) as { event: string; payload: { payment: { entity: { order_id: string; id: string } } } };
    if (event.event === "payment.captured") {
      const { order_id: orderId, id: paymentId } = event.payload.payment.entity;
      await markPaymentPaid(orderId, paymentId);
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

paymentsRouter.get("/:id", requireAuth("PATIENT"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payment = await prisma.payment.findUnique({ where: { id: req.params.id } });
    if (!payment || payment.patientId !== req.user!.sub) {
      res.status(404).json({ message: "Payment not found" });
      return;
    }
    res.json(payment);
  } catch (error) {
    next(error);
  }
});
```

- [ ] **Step 8: Wire the router, with the webhook route on raw body parsing**

In `packages/server/src/index.ts`, this is a real gotcha: Razorpay's webhook signature is computed over the raw request bytes, so the webhook path must NOT go through the global `express.json()` parser. Add the import: `import { paymentsRouter } from "./routes/payments.routes.js";`

Change the middleware order — before the existing `app.use(express.json({ limit: "2mb" }));` line, add:

```ts
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));
```

This must be registered *before* the blanket `express.json()` call so Express applies raw parsing specifically to that path first. Then register the router alongside the others:

```ts
app.use("/api/payments", paymentsRouter);
```

- [ ] **Step 9: Gate call creation on payment, behind the flag**

In `packages/server/src/routes/calls.routes.ts`, add the import: `import { z } from "zod";` (if not already imported — check first) and change the `POST /` handler:

```ts
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

    let paymentId: string | undefined;
    if (process.env.REQUIRE_PAYMENT_FOR_CALLS === "true") {
      const body = z.object({ paymentId: z.string() }).parse(req.body);
      const payment = await prisma.payment.findUnique({ where: { id: body.paymentId } });
      if (!payment || payment.patientId !== patientId || payment.status !== "PAID" || payment.callSessionId) {
        res.status(402).json({ message: "Valid unused paid payment required" });
        return;
      }
      paymentId = payment.id;
    }

    const call = await prisma.callSession.create({
      data: { patientId, livekitRoom: `room-${randomUUID()}`, status: "QUEUED" },
    });

    if (paymentId) {
      await prisma.payment.update({ where: { id: paymentId }, data: { callSessionId: call.id } });
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

- [ ] **Step 10: Auto-refund on `NO_DOCTOR`**

In `packages/server/src/workers/assign-doctor.worker.ts`, add the import: `import { refundPayment } from "../services/payment.service.js";`

In `handleAssignDoctorFailed`, after the `CallSession` is updated to `NO_DOCTOR`:

```ts
export function handleAssignDoctorFailed(worker: Worker<AssignDoctorJobData>): void {
  worker.on("failed", async (job, error) => {
    if (!job || error.message !== "no_doctor") {
      return;
    }

    const attempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < attempts) {
      return;
    }

    const call = await prisma.callSession.update({
      where: { id: job.data.callSessionId },
      data: { status: "NO_DOCTOR" },
    });

    const payment = await prisma.payment.findUnique({ where: { callSessionId: job.data.callSessionId } });
    if (payment && payment.status === "PAID") {
      await refundPayment(payment.id).catch((refundError: unknown) => {
        console.error("auto-refund failed for callSession", job.data.callSessionId, refundError);
      });
    }

    io.to(`user:${call.patientId}`).emit("call:no_doctor_available", {
      callSessionId: job.data.callSessionId,
    });
  });
}
```

- [ ] **Step 11: Add env vars**

In `.env.example`, add:

```
RAZORPAY_KEY_ID=your-razorpay-test-key-id
RAZORPAY_KEY_SECRET=your-razorpay-test-key-secret
RAZORPAY_WEBHOOK_SECRET=your-razorpay-webhook-secret
REQUIRE_PAYMENT_FOR_CALLS=false
```

- [ ] **Step 12: Run the test to verify it passes**

Run: `DATABASE_URL="postgresql://madamgy:madamgy@localhost:55432/madamgy" REDIS_URL="redis://localhost:56379" RAZORPAY_KEY_ID=<your test key id> RAZORPAY_KEY_SECRET=<your test key secret> RAZORPAY_WEBHOOK_SECRET=<your webhook secret> npx vitest run src/__tests__/payments.test.ts`
Expected: `3 passed (3)`

- [ ] **Step 13: Run the full suite with `REQUIRE_PAYMENT_FOR_CALLS` unset, confirming the flag default keeps `calls.test.ts` passing unchanged**

Run: `DATABASE_URL="postgresql://madamgy:madamgy@localhost:55432/madamgy" REDIS_URL="redis://localhost:56379" npm run test`
Expected: `52 passed (52)` — `calls.test.ts` still creates calls with no payment body, since the flag defaults to `"false"`.

- [ ] **Step 14: Add the same env vars to the CI workflow**

In `.github/workflows/ci.yml`, under the `test-server` job's `env:` block, add:

```yaml
      RAZORPAY_KEY_ID: ${{ secrets.RAZORPAY_TEST_KEY_ID }}
      RAZORPAY_KEY_SECRET: ${{ secrets.RAZORPAY_TEST_KEY_SECRET }}
      RAZORPAY_WEBHOOK_SECRET: ${{ secrets.RAZORPAY_TEST_WEBHOOK_SECRET }}
```

Note in a PR description (not code) that these 3 GitHub Actions repository secrets must be configured manually in the repo settings before this CI job will pass — they cannot be set from inside this plan.

- [ ] **Step 15: Commit**

```bash
git add packages/server/src/prisma packages/server/src/services/payment.service.ts packages/server/src/routes/payments.routes.ts packages/server/src/routes/calls.routes.ts packages/server/src/workers/assign-doctor.worker.ts packages/server/src/index.ts packages/server/package.json packages/server/package-lock.json .env.example .github/workflows/ci.yml packages/server/src/__tests__/payments.test.ts
git commit -m "feat: add Razorpay payment gateway, gated behind REQUIRE_PAYMENT_FOR_CALLS"
```

---

### Task 8: Admin audit log

**Files:**
- Modify: `packages/server/src/prisma/schema.prisma`
- Create: `packages/server/src/services/audit-log.service.ts`
- Modify: `packages/server/src/routes/admin.routes.ts`
- Test: `packages/server/src/__tests__/audit-log.test.ts`

**Interfaces:**
- Produces: `recordAuditLog(actorId: string, action: string, targetId?: string, metadata?: Prisma.InputJsonValue): Promise<void>`.

- [ ] **Step 1: Add the schema**

In `packages/server/src/prisma/schema.prisma`, add:

```prisma
model AuditLog {
  id        String   @id @default(cuid())
  actorId   String
  action    String
  targetId  String?
  metadata  Json?
  createdAt DateTime @default(now())

  actor User @relation(fields: [actorId], references: [id])

  @@index([actorId, createdAt])
}
```

Add to `model User`: `auditLogs AuditLog[]`

- [ ] **Step 2: Run the migration**

Run (from `packages/server/`): `DATABASE_URL="postgresql://madamgy:madamgy@localhost:55432/madamgy" npx prisma migrate dev --name add_audit_log --schema src/prisma/schema.prisma`
Expected: migration applied, client regenerated.

- [ ] **Step 3: Write the failing test**

Create `packages/server/src/__tests__/audit-log.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../index.js";
import { prisma } from "../lib/prisma.js";
import { signAccessToken } from "../services/auth.service.js";

describe("Audit log", () => {
  let adminId: string;
  let adminToken: string;
  let doctorId: string;

  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: { phone: "8888900001", name: "Audit Admin", role: "ADMIN", passwordHash: "unused" },
    });
    adminId = admin.id;
    adminToken = signAccessToken({ sub: admin.id, role: "ADMIN" });

    const doctor = await prisma.user.create({
      data: {
        phone: "8888900002",
        name: "Audit Doctor",
        role: "DOCTOR",
        doctorProfile: { create: { degree: "MBBS", regNumber: "AUDIT-REG-1" } },
      },
    });
    doctorId = doctor.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { actorId: adminId } });
    await prisma.doctorProfile.deleteMany({ where: { userId: doctorId } });
    await prisma.user.deleteMany({ where: { id: { in: [adminId, doctorId] } } });
  });

  it("records an audit log entry when an admin approves a doctor", async () => {
    const response = await request(app)
      .put(`/api/admin/doctors/${doctorId}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(response.status).toBe(200);

    const logs = await prisma.auditLog.findMany({ where: { actorId: adminId, action: "doctor.approve" } });
    expect(logs).toHaveLength(1);
    expect(logs[0].targetId).toBe(doctorId);
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `DATABASE_URL="postgresql://madamgy:madamgy@localhost:55432/madamgy" REDIS_URL="redis://localhost:56379" npx vitest run src/__tests__/audit-log.test.ts`
Expected: FAIL — `0` logs found, since nothing writes them yet.

- [ ] **Step 5: Implement the service**

Create `packages/server/src/services/audit-log.service.ts`:

```ts
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export async function recordAuditLog(
  actorId: string,
  action: string,
  targetId?: string,
  metadata?: Prisma.InputJsonValue,
): Promise<void> {
  await prisma.auditLog.create({ data: { actorId, action, targetId, metadata } });
}
```

- [ ] **Step 6: Wire it into admin actions**

In `packages/server/src/routes/admin.routes.ts`, add the import: `import { recordAuditLog } from "../services/audit-log.service.js";`

In the doctor approve route, after the `io.to(...).emit(...)` line, add:

```ts
    await recordAuditLog(req.user!.sub, "doctor.approve", req.params.id);
```

In the user disable route, after `await prisma.user.update(...)`, add:

```ts
    await recordAuditLog(req.user!.sub, disabled ? "user.disable" : "user.enable", req.params.id);
```

In the withdrawal complete route, after `const transaction = await completeWithdrawal(req.params.id);`, add:

```ts
    await recordAuditLog(req.user!.sub, "withdrawal.complete", transaction.id, { amount: transaction.amount.toString() });
```

In the withdrawal reject route, after `const transaction = await rejectWithdrawal(req.params.id);`, add:

```ts
    await recordAuditLog(req.user!.sub, "withdrawal.reject", transaction.id);
```

Add a read endpoint, after the existing `/wallet/withdrawals/:id/reject` route:

```ts
adminRouter.get("/audit-log", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(Number(req.query.page ?? "1"), 1);
    const limit = 50;
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: { actor: { select: { id: true, name: true, role: true } } },
      }),
      prisma.auditLog.count(),
    ]);
    res.json({ logs, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    next(error);
  }
});
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `DATABASE_URL="postgresql://madamgy:madamgy@localhost:55432/madamgy" REDIS_URL="redis://localhost:56379" npx vitest run src/__tests__/audit-log.test.ts`
Expected: `1 passed (1)`

- [ ] **Step 8: Run the full suite**

Run: `DATABASE_URL="postgresql://madamgy:madamgy@localhost:55432/madamgy" REDIS_URL="redis://localhost:56379" npm run test`
Expected: `53 passed (53)`

- [ ] **Step 9: Commit**

```bash
git add packages/server/src/prisma packages/server/src/services/audit-log.service.ts packages/server/src/routes/admin.routes.ts packages/server/src/__tests__/audit-log.test.ts
git commit -m "feat: add admin audit log for doctor approval, user disable, and withdrawal actions"
```

---

### Task 9: Doctor registration document upload (verification)

**Files:**
- Modify: `packages/server/src/prisma/schema.prisma`
- Modify: `packages/server/src/routes/auth.routes.ts`
- Modify: `packages/server/src/services/auth.service.ts`
- Modify: `packages/server/src/routes/admin.routes.ts`
- Test: `packages/server/src/__tests__/doctor-verification.test.ts`

**Interfaces:**
- Produces: `POST /api/auth/doctor/register` now accepts `multipart/form-data` with a `data` field (JSON-encoded `DoctorRegisterSchema`) and an optional `licenseDocument` file field. `GET /api/admin/doctors/:id/license` returns `{ url: string }`, a presigned MinIO URL, or `404` if no document was uploaded. **Frontend contract note**: the companion frontend plan's doctor registration form must switch from a plain JSON POST to a multipart POST matching this shape.

- [ ] **Step 1: Add the schema field**

In `packages/server/src/prisma/schema.prisma`, add to `model DoctorProfile`: `licenseDocKey String?`

- [ ] **Step 2: Run the migration**

Run (from `packages/server/`): `DATABASE_URL="postgresql://madamgy:madamgy@localhost:55432/madamgy" npx prisma migrate dev --name add_doctor_license_doc --schema src/prisma/schema.prisma`
Expected: migration applied, client regenerated.

- [ ] **Step 3: Write the failing test**

Create `packages/server/src/__tests__/doctor-verification.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../index.js";
import { prisma } from "../lib/prisma.js";
import { signAccessToken } from "../services/auth.service.js";

describe("Doctor verification document upload", () => {
  const phone = "8889000001";

  afterAll(async () => {
    const user = await prisma.user.findUnique({ where: { phone } });
    if (user) {
      await prisma.doctorProfile.deleteMany({ where: { userId: user.id } });
      await prisma.user.deleteMany({ where: { id: user.id } });
    }
  });

  it("stores the uploaded license document and exposes it to admin", async () => {
    const registerResponse = await request(app)
      .post("/api/auth/doctor/register")
      .field("data", JSON.stringify({
        phone,
        name: "Verification Doctor",
        password: "password123",
        degree: "MBBS",
        regNumber: "VERIFY-REG-1",
      }))
      .attach("licenseDocument", Buffer.from("%PDF-1.4 fake license content"), "license.pdf");

    expect(registerResponse.status).toBe(201);

    const user = await prisma.user.findUniqueOrThrow({ where: { phone }, include: { doctorProfile: true } });
    expect(user.doctorProfile?.licenseDocKey).toBeTruthy();

    const admin = await prisma.user.create({
      data: { phone: "8889000099", name: "Verify Admin", role: "ADMIN", passwordHash: "unused" },
    });
    const adminToken = signAccessToken({ sub: admin.id, role: "ADMIN" });

    const licenseResponse = await request(app)
      .get(`/api/admin/doctors/${user.id}/license`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(licenseResponse.status).toBe(200);
    expect(licenseResponse.body.url).toContain("http");

    await prisma.user.deleteMany({ where: { id: admin.id } });
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `DATABASE_URL="postgresql://madamgy:madamgy@localhost:55432/madamgy" REDIS_URL="redis://localhost:56379" MINIO_ENDPOINT=localhost MINIO_PORT=19000 MINIO_ACCESS_KEY=madamgy MINIO_SECRET_KEY=madamgy123 MINIO_BUCKET=madamgy MINIO_USE_SSL=false npx vitest run src/__tests__/doctor-verification.test.ts`
Expected: FAIL — `expected 400 to be 201` (route doesn't accept multipart yet, `DoctorRegisterSchema.parse(req.body)` fails against the raw multipart fields).

- [ ] **Step 5: Implement multer + service changes**

In `packages/server/src/services/auth.service.ts`, add the import: `import { uploadBuffer } from "./storage.service.js";` and change `registerDoctor`:

```ts
export async function registerDoctor(
  data: {
    phone: string;
    name: string;
    password: string;
    degree: string;
    regNumber: string;
    specialization?: string;
  },
  licenseFile?: { buffer: Buffer; mimetype: string },
) {
  const existing = await prisma.user.findUnique({ where: { phone: data.phone } });
  if (existing) {
    throw new AppError(409, "Phone already registered");
  }

  const existingProfile = await prisma.doctorProfile.findUnique({
    where: { regNumber: data.regNumber },
  });
  if (existingProfile) {
    throw new AppError(409, "Registration number already in use");
  }

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

  if (licenseFile) {
    const objectKey = `doctor-verification/${user.id}.pdf`;
    await uploadBuffer(objectKey, licenseFile.buffer, licenseFile.mimetype);
    await prisma.doctorProfile.update({ where: { userId: user.id }, data: { licenseDocKey: objectKey } });
  }

  return user;
}
```

Check `packages/server/src/services/storage.service.ts` first for the exact exported name and signature of the upload function (the plan assumes `uploadBuffer(objectKey: string, buffer: Buffer, contentType: string)` based on its existing usage in `render-pdf.worker.ts` — confirm with `grep -n "export" packages/server/src/services/storage.service.ts` before writing this).

- [ ] **Step 6: Switch the route to multipart**

In `packages/server/src/routes/auth.routes.ts`, add imports:

```ts
import multer from "multer";
```

Add near the top of the file, after `export const authRouter = Router();`:

```ts
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
```

Replace the `/doctor/register` route:

```ts
authRouter.post(
  "/doctor/register",
  upload.single("licenseDocument"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = DoctorRegisterSchema.parse(JSON.parse(req.body.data));
      const user = await registerDoctor(
        body,
        req.file ? { buffer: req.file.buffer, mimetype: req.file.mimetype } : undefined,
      );
      io.to("admins").emit("doctor:new_registration", { doctorId: user.id, name: user.name });
      res.status(201).json({ message: "Registration submitted, awaiting admin approval" });
    } catch (error) {
      next(error);
    }
  },
);
```

- [ ] **Step 7: Add the admin license endpoint**

In `packages/server/src/routes/admin.routes.ts`, add the import: `import { getPresignedUrl } from "../services/storage.service.js";` (confirm this exact export name first with `grep -n "export" packages/server/src/services/storage.service.ts`, matching how `prescriptions.routes.ts` already imports it).

Add the route, after the `GET /doctors` route:

```ts
adminRouter.get("/doctors/:id/license", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = await prisma.doctorProfile.findUnique({ where: { userId: req.params.id } });
    if (!profile?.licenseDocKey) {
      throw new AppError(404, "No license document uploaded");
    }

    const url = await getPresignedUrl(profile.licenseDocKey);
    res.json({ url });
  } catch (error) {
    next(error);
  }
});
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `DATABASE_URL="postgresql://madamgy:madamgy@localhost:55432/madamgy" REDIS_URL="redis://localhost:56379" MINIO_ENDPOINT=localhost MINIO_PORT=19000 MINIO_ACCESS_KEY=madamgy MINIO_SECRET_KEY=madamgy123 MINIO_BUCKET=madamgy MINIO_USE_SSL=false npx vitest run src/__tests__/doctor-verification.test.ts`
Expected: `1 passed (1)`

- [ ] **Step 9: Run the full suite (MinIO env vars now required for every run, since this test needs them)**

Run: `DATABASE_URL="postgresql://madamgy:madamgy@localhost:55432/madamgy" REDIS_URL="redis://localhost:56379" MINIO_ENDPOINT=localhost MINIO_PORT=19000 MINIO_ACCESS_KEY=madamgy MINIO_SECRET_KEY=madamgy123 MINIO_BUCKET=madamgy MINIO_USE_SSL=false npm run test`
Expected: `54 passed (54)`

- [ ] **Step 10: Add MinIO env vars to CI if not already present**

Check `.github/workflows/ci.yml`'s `test-server` job env block — it currently has no `MINIO_*` vars even though it starts a MinIO container. Add:

```yaml
      MINIO_ENDPOINT: localhost
      MINIO_PORT: "19000"
      MINIO_ACCESS_KEY: madamgy
      MINIO_SECRET_KEY: madamgy123
      MINIO_BUCKET: madamgy
      MINIO_USE_SSL: "false"
```

- [ ] **Step 11: Commit**

```bash
git add packages/server/src/prisma packages/server/src/routes/auth.routes.ts packages/server/src/services/auth.service.ts packages/server/src/routes/admin.routes.ts packages/server/src/__tests__/doctor-verification.test.ts .github/workflows/ci.yml
git commit -m "feat: require doctor registration to accept a license document for admin verification"
```

---

### Task 10: Patient consent capture

**Files:**
- Modify: `packages/server/src/prisma/schema.prisma`
- Modify: `packages/api-client/src/schemas/user.schema.ts`
- Modify: `packages/server/src/services/auth.service.ts`
- Test: `packages/server/src/__tests__/auth.test.ts`

**Interfaces:**
- Produces: `PatientRegisterSchema` now requires `consent: z.literal(true)`. `PatientProfile.consentGivenAt` is stamped at registration. **Frontend contract note**: the companion frontend plan's registration form must add a consent checkbox that sends `consent: true`.

- [ ] **Step 1: Add the schema field**

In `packages/server/src/prisma/schema.prisma`, add to `model PatientProfile`: `consentGivenAt DateTime?`

- [ ] **Step 2: Run the migration**

Run (from `packages/server/`): `DATABASE_URL="postgresql://madamgy:madamgy@localhost:55432/madamgy" npx prisma migrate dev --name add_patient_consent --schema src/prisma/schema.prisma`
Expected: migration applied, client regenerated.

- [ ] **Step 3: Update the Zod schema**

In `packages/api-client/src/schemas/user.schema.ts`, change:

```ts
export const PatientRegisterSchema = z.object({
  phone: z.string().min(10).max(15),
  name: z.string().min(1).max(100),
  dob: DateOfBirthSchema,
  pin: z.string().length(4).regex(/^\d{4}$/).optional(),
});
```

to:

```ts
export const PatientRegisterSchema = z.object({
  phone: z.string().min(10).max(15),
  name: z.string().min(1).max(100),
  dob: DateOfBirthSchema,
  pin: z.string().length(4).regex(/^\d{4}$/).optional(),
  consent: z.literal(true),
});
```

- [ ] **Step 4: Rebuild api-client**

Run (from repo root): `npm run build --workspace @madamgy/api-client`
Expected: no errors.

- [ ] **Step 5: Write the failing test**

In `packages/server/src/__tests__/auth.test.ts`, find the existing `describe("Patient auth", ...)` registration test (the one posting to `/api/auth/patient/register` with a valid body) and check its exact request body — it currently does NOT send `consent`, so it will now fail once the schema requires it. This is intentional: fix the existing test's request body (add `consent: true`) rather than adding a new test, since this is a required-field addition to an existing flow, not a new flow. Also add one new test:

```ts
  it("rejects patient registration without consent", async () => {
    const response = await request(app).post("/api/auth/patient/register").send({
      phone: "8889100001",
      name: "No Consent Patient",
      dob: "01/01/1990",
    });
    expect(response.status).toBe(400);
  });
```

Add `"88891"` to the cleanup filter.

- [ ] **Step 6: Run it to verify the existing test now fails and the new one is red for the wrong reason**

Run: `DATABASE_URL="postgresql://madamgy:madamgy@localhost:55432/madamgy" REDIS_URL="redis://localhost:56379" npx vitest run src/__tests__/auth.test.ts`
Expected: the pre-existing registration test now fails with `expected 201 to be 401` or similar (since it wasn't yet updated) — confirming the schema change took effect. Now go back and add `consent: true` to that existing test's request body per Step 5.

- [ ] **Step 7: Stamp `consentGivenAt` at registration**

In `packages/server/src/services/auth.service.ts`, change `registerPatient`:

```ts
export async function registerPatient(data: {
  phone: string;
  name: string;
  dob: string;
  pin?: string;
}) {
  const existing = await prisma.user.findUnique({ where: { phone: data.phone } });
  if (existing) {
    throw new AppError(409, "Phone already registered");
  }

  const dob = parseDateOfBirth(data.dob);
  const pinHash = data.pin ? await bcrypt.hash(data.pin, 12) : null;
  return prisma.user.create({
    data: {
      phone: data.phone,
      name: data.name,
      role: "PATIENT",
      pinHash,
      patientProfile: { create: { dob, consentGivenAt: new Date() } },
    },
  });
}
```

(The `consent: true` boolean itself is not persisted — only the timestamp is, since a `true` requirement carries no information once validated; `consentGivenAt` is the durable record.)

- [ ] **Step 8: Run the full auth test file**

Run: `DATABASE_URL="postgresql://madamgy:madamgy@localhost:55432/madamgy" REDIS_URL="redis://localhost:56379" npx vitest run src/__tests__/auth.test.ts`
Expected: all pass, including the new consent-rejection test.

- [ ] **Step 9: Run the full suite**

Run: `DATABASE_URL="postgresql://madamgy:madamgy@localhost:55432/madamgy" REDIS_URL="redis://localhost:56379" MINIO_ENDPOINT=localhost MINIO_PORT=19000 MINIO_ACCESS_KEY=madamgy MINIO_SECRET_KEY=madamgy123 MINIO_BUCKET=madamgy MINIO_USE_SSL=false npm run test`
Expected: `55 passed (55)`

- [ ] **Step 10: Commit**

```bash
git add packages/server/src/prisma packages/api-client/src/schemas/user.schema.ts packages/api-client/dist packages/server/src/services/auth.service.ts packages/server/src/__tests__/auth.test.ts
git commit -m "feat: require and record patient teleconsultation consent at registration"
```

---

### Task 11: Real end-to-end integration test (workers + sockets, no mocks)

**Files:**
- Create: `packages/server/src/__tests__/e2e-consult-flow.test.ts`
- Modify: `packages/server/package.json` (new devDependency: `socket.io-client`)
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: every route and service touched by Tasks 1–10. This test boots the real compiled/dev server as a child process (`NODE_ENV=development`, workers enabled) rather than importing `app` directly, since the existing fast test suite deliberately disables workers under `NODE_ENV=test` and this test's entire purpose is to cover what that suite cannot.

- [ ] **Step 1: Add the test-only dependency**

Run (from `packages/server/`): `npm install -D socket.io-client@4`
Expected: `package.json` gains `"socket.io-client": "^4.x.x"` under `devDependencies`.

- [ ] **Step 2: Write the test**

Create `packages/server/src/__tests__/e2e-consult-flow.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type ChildProcess, spawn } from "child_process";
import axios, { type AxiosInstance } from "axios";
import { io as ioClient, type Socket } from "socket.io-client";

const PORT = 3901;
const BASE = `http://localhost:${PORT}/api`;

let serverProcess: ChildProcess;
let api: AxiosInstance;

async function waitForHealth(): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await axios.get(`${BASE}/health`, { timeout: 1000 });
      if (response.status === 200) {
        return;
      }
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("server did not become healthy in time");
}

describe("Full consult flow (real workers + sockets, no mocks)", () => {
  beforeAll(async () => {
    serverProcess = spawn("npx", ["tsx", "src/index.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "development",
        PORT: String(PORT),
        DATABASE_URL: "postgresql://madamgy:madamgy@localhost:55432/madamgy",
        REDIS_URL: "redis://localhost:56379",
        JWT_ACCESS_SECRET: "e2e-test-access-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        JWT_REFRESH_SECRET: "e2e-test-refresh-secret-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        LIVEKIT_HOST: "ws://localhost:7880",
        LIVEKIT_API_KEY: "devkey",
        LIVEKIT_API_SECRET: "devsecretdevsecretdevsecret",
        MINIO_ENDPOINT: "localhost",
        MINIO_PORT: "19000",
        MINIO_ACCESS_KEY: "madamgy",
        MINIO_SECRET_KEY: "madamgy123",
        MINIO_BUCKET: "madamgy",
        MINIO_USE_SSL: "false",
        CONSULTATION_FEE: "200",
        WEB_URL: "*",
        REQUIRE_PAYMENT_FOR_CALLS: "false",
        STALE_CALL_REAPER_ENABLED: "false",
      },
      stdio: "pipe",
    });

    api = axios.create({ baseURL: BASE, validateStatus: () => true });
    await waitForHealth();
  }, 30_000);

  afterAll(() => {
    serverProcess.kill();
  });

  it("drives registration through wallet credit end to end", async () => {
    const rand = Math.floor(Math.random() * 1e8);
    const patientPhone = `70001${rand}`.slice(0, 12);
    const doctorPhone = `80001${rand}`.slice(0, 12);

    const patientRegister = await api.post("/auth/patient/register", {
      phone: patientPhone,
      name: "E2E Patient",
      dob: "01/01/1990",
      consent: true,
    });
    expect(patientRegister.status).toBe(201);
    const patientToken: string = patientRegister.data.accessToken;

    const doctorRegister = await api.post("/auth/doctor/register", {
      phone: doctorPhone,
      name: "E2E Doctor",
      password: "password123",
      degree: "MBBS",
      regNumber: `E2E-REG-${rand}`,
    });
    expect(doctorRegister.status).toBe(201);

    const adminLogin = await api.post("/auth/admin/login", { phone: "9000000000", password: "admin123" });
    expect(adminLogin.status).toBe(200);
    const adminToken: string = adminLogin.data.accessToken;

    const doctors = await api.get("/admin/doctors", { headers: { Authorization: `Bearer ${adminToken}` } });
    const doctor = doctors.data.find((d: { phone: string }) => d.phone === doctorPhone);
    expect(doctor).toBeTruthy();

    const approve = await api.put(`/admin/doctors/${doctor.id}/approve`, {}, { headers: { Authorization: `Bearer ${adminToken}` } });
    expect(approve.status).toBe(200);

    await api.post("/auth/doctor/login/initiate", { phone: doctorPhone, password: "password123" });
    const doctorLogin = await api.post("/auth/doctor/login/verify", { phone: doctorPhone, otp: "000000" });
    expect(doctorLogin.status).toBe(200);
    const doctorToken: string = doctorLogin.data.accessToken;

    const patientSocket: Socket = ioClient(`http://localhost:${PORT}`, { auth: { token: patientToken } });
    const doctorSocket: Socket = ioClient(`http://localhost:${PORT}`, { auth: { token: doctorToken } });

    await new Promise<void>((resolve, reject) => {
      let connected = 0;
      const done = () => {
        connected++;
        if (connected === 2) resolve();
      };
      patientSocket.on("connect", done);
      doctorSocket.on("connect", done);
      patientSocket.on("connect_error", reject);
      doctorSocket.on("connect_error", reject);
      setTimeout(() => reject(new Error("socket connect timeout")), 5000);
    });

    doctorSocket.emit("doctor:toggle_available", { isAvailable: true });
    await new Promise((resolve) => setTimeout(resolve, 300));

    const incomingPromise = new Promise<{ callSession: { id: string } }>((resolve, reject) => {
      doctorSocket.once("call:incoming", resolve);
      setTimeout(() => reject(new Error("call:incoming timeout")), 8000);
    });

    const createCall = await api.post("/calls", {}, { headers: { Authorization: `Bearer ${patientToken}` } });
    expect(createCall.status).toBe(201);
    const callSessionId: string = createCall.data.id;

    const incoming = await incomingPromise;
    expect(incoming.callSession.id).toBe(callSessionId);

    const acceptedPromise = new Promise<void>((resolve, reject) => {
      let got = 0;
      const check = () => {
        got++;
        if (got === 2) resolve();
      };
      patientSocket.once("call:accepted", check);
      doctorSocket.once("call:accepted", check);
      setTimeout(() => reject(new Error("call:accepted timeout")), 5000);
    });
    doctorSocket.emit("call:accept", { callSessionId });
    await acceptedPromise;

    const endedPromise = new Promise<void>((resolve, reject) => {
      patientSocket.once("call:ended", () => resolve());
      setTimeout(() => reject(new Error("call:ended timeout")), 15000);
    });

    const submitRx = await api.post(
      "/prescriptions",
      { callSessionId, content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Rest and fluids" }] }] } },
      { headers: { Authorization: `Bearer ${doctorToken}` } },
    );
    expect(submitRx.status).toBe(202);

    await endedPromise;

    const wallet = await api.get("/doctor/wallet", { headers: { Authorization: `Bearer ${doctorToken}` } });
    expect(Number(wallet.data.balance)).toBeGreaterThan(0);

    patientSocket.close();
    doctorSocket.close();
  }, 30_000);
});
```

- [ ] **Step 3: Run it to verify it passes**

Run (with the docker services from Global Constraints already up): `DATABASE_URL="postgresql://madamgy:madamgy@localhost:55432/madamgy" REDIS_URL="redis://localhost:56379" npx vitest run src/__tests__/e2e-consult-flow.test.ts`
Expected: `1 passed (1)` — this may take 5-10 real seconds since it waits on actual queue processing, unlike the mocked-timing-free fast suite.

- [ ] **Step 4: Run the full suite**

Run: `DATABASE_URL="postgresql://madamgy:madamgy@localhost:55432/madamgy" REDIS_URL="redis://localhost:56379" MINIO_ENDPOINT=localhost MINIO_PORT=19000 MINIO_ACCESS_KEY=madamgy MINIO_SECRET_KEY=madamgy123 MINIO_BUCKET=madamgy MINIO_USE_SSL=false npm run test`
Expected: `56 passed (56)`

- [ ] **Step 5: Wire into CI**

The `test-server` job in `.github/workflows/ci.yml` already runs `npm run test --workspace @madamgy/server`, which picks up this new file automatically (Vitest globs `__tests__/*.test.ts`). Add an `ADMIN_PHONE`/`ADMIN_PASSWORD`-seeded admin (already present in the job) and confirm the job's `env:` block also has `LIVEKIT_HOST`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `WEB_URL`, `REQUIRE_PAYMENT_FOR_CALLS: "false"`, `STALE_CALL_REAPER_ENABLED: "false"` — the spawned child process in this test does not read the outer Vitest process's env unless explicitly passed, but here it does inherit via `...process.env` plus overrides, so anything missing from the job's `env:` block will be missing for the child too. Add any of the above not already present.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/__tests__/e2e-consult-flow.test.ts packages/server/package.json packages/server/package-lock.json .github/workflows/ci.yml
git commit -m "test: add real end-to-end consult flow test exercising workers and sockets"
```

---

### Task 12: CI dependency-vulnerability gate

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `.github/dependabot.yml`

- [ ] **Step 1: Add an audit job**

In `.github/workflows/ci.yml`, add a new job alongside `lint-typecheck` and `test-server`:

```yaml
  dependency-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm audit --omit=dev --audit-level=high
```

`--omit=dev` excludes the `vite`/`vitest` dev-tooling chain (Task 2 noted this as lower priority, not shippable to production) so this gate only fails on vulnerabilities reachable from production dependencies.

- [ ] **Step 2: Verify it locally**

Run: `npm audit --omit=dev --audit-level=high`
Expected: exit code `0` if Task 2 was completed first (no remaining high/critical production vulnerabilities); if Task 2 hasn't run yet, this will correctly fail, demonstrating the gate works.

- [ ] **Step 3: Add Dependabot config**

Create `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
  - package-ecosystem: "npm"
    directory: "/packages/server"
    schedule:
      interval: "weekly"
  - package-ecosystem: "npm"
    directory: "/packages/web"
    schedule:
      interval: "weekly"
  - package-ecosystem: "npm"
    directory: "/packages/api-client"
    schedule:
      interval: "weekly"
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml .github/dependabot.yml
git commit -m "ci: add dependency-vulnerability gate and Dependabot config"
```

---

### Task 13: Automated database backups

**Files:**
- Create: `scripts/backup-db.fish`
- Create: `docs/superpowers/specs/2026-07-04-backup-restore-runbook.md`

- [ ] **Step 1: Write the backup script**

Create `scripts/backup-db.fish`:

```fish
#!/usr/bin/env fish
# Dumps the database to a timestamped, gzipped file and prunes to the 7 most recent.
# Requires DATABASE_URL to be set in the environment.

if not set -q DATABASE_URL
    echo "DATABASE_URL is not set."
    exit 1
end

set script_dir (dirname (status --current-filename))
set backup_dir $script_dir/../backups
mkdir -p $backup_dir

set timestamp (date +%Y%m%d-%H%M%S)
set filename $backup_dir/madamgy-$timestamp.sql.gz

pg_dump $DATABASE_URL | gzip > $filename
echo "Backup written to $filename"

set existing_backups (ls -1t $backup_dir/madamgy-*.sql.gz 2>/dev/null)
set count (count $existing_backups)
if test $count -gt 7
    set old_backups $existing_backups[8..-1]
    for f in $old_backups
        rm $f
        echo "Pruned old backup: $f"
    end
end
```

Make it executable: `chmod +x scripts/backup-db.fish`

- [ ] **Step 2: Verify it works**

Run: `DATABASE_URL="postgresql://madamgy:madamgy@localhost:55432/madamgy" fish scripts/backup-db.fish`
Expected: `Backup written to .../backups/madamgy-<timestamp>.sql.gz`

Run: `ls -la backups/`
Expected: one `.sql.gz` file, non-zero size.

- [ ] **Step 3: Verify pruning**

Run: `for i in (seq 1 9); touch backups/madamgy-fake-$i.sql.gz; end && DATABASE_URL="postgresql://madamgy:madamgy@localhost:55432/madamgy" fish scripts/backup-db.fish && ls backups/ | wc -l`
Expected: `8` (7 kept + 1 just created; the fake empty files plus the real one exceed 7 before pruning, so several `fake-N` entries print as `Pruned old backup: ...` and only the 7 most recent + this run's new file remain). Clean up the fake files afterward: `rm backups/madamgy-fake-*.sql.gz` if any survived (they're the oldest-by-mtime among identically-named touch'd files, so this is a rough manual check — the important assertion is that `ls backups/ | wc -l` doesn't grow unbounded across repeated runs).

- [ ] **Step 4: Write the restore runbook**

Create `docs/superpowers/specs/2026-07-04-backup-restore-runbook.md`:

```markdown
# Backup & Restore Runbook

## Backing up

Run `fish scripts/backup-db.fish` with `DATABASE_URL` set to the production database. Schedule it via cron (e.g. `0 */6 * * * cd /path/to/new && DATABASE_URL=... fish scripts/backup-db.fish >> /var/log/madamgy-backup.log 2>&1`) for a 6-hourly cadence. Backups land in `backups/`, gzipped, pruned to the 7 most recent.

## Restoring

1. Stop the API server so nothing writes during restore: `docker compose stop api`
2. Pick the backup file to restore from `backups/madamgy-<timestamp>.sql.gz`
3. Drop and recreate the target database (only on a genuine disaster-recovery restore, never on a live database with data you want to keep):
   `docker compose exec postgres psql -U madamgy -c "DROP DATABASE madamgy;"`
   `docker compose exec postgres psql -U madamgy -c "CREATE DATABASE madamgy;"`
4. Restore: `gunzip -c backups/madamgy-<timestamp>.sql.gz | docker compose exec -T postgres psql -U madamgy madamgy`
5. Restart the API: `docker compose start api`
6. Verify: `docker compose exec postgres psql -U madamgy madamgy -c "SELECT count(*) FROM \"User\";"` returns a plausible row count.

## MinIO (prescription PDFs, lab reports, doctor license documents)

MinIO data lives in the `minidata` docker volume. Back it up separately with:
`docker run --rm -v new_minidata:/data -v $(pwd)/backups:/backup alpine tar czf /backup/minio-$(date +%Y%m%d).tar.gz -C /data .`

Restore by reversing the tar command into a fresh `minidata` volume before starting the `minio` service.

## Retention

Medical records (prescriptions, lab reports) should be retained indefinitely or per applicable local medical-records-retention regulation — do not apply a deletion policy to MinIO objects without confirming the retention requirement first; this is a compliance question, not a technical one.
```

- [ ] **Step 5: Commit**

```bash
git add scripts/backup-db.fish docs/superpowers/specs/2026-07-04-backup-restore-runbook.md
git commit -m "ops: add database backup script and restore runbook"
```

---

### Task 14: Monitoring — deep health check

**Files:**
- Modify: `packages/server/src/index.ts`
- Test: manual verification only (see Step 4 — automatically testing the "down" branch requires stopping a live docker service mid-test-run, which is disruptive to run as part of the normal suite; this is a documented manual check instead of a placeholder)

**Interfaces:**
- Produces: `GET /api/health` now returns `{ ok: boolean, checks: { db: boolean, redis: boolean, minio: boolean } }` with HTTP `200` if all checks pass, `503` otherwise.

- [ ] **Step 1: Implement the checks**

In `packages/server/src/index.ts`, add the imports: `import { redis } from "./lib/redis.js";` and `import { minioClient } from "./services/storage.service.js";` (confirm the exact exported client name first with `grep -n "export" packages/server/src/services/storage.service.ts` — the plan assumes a `minioClient` export since `ensureBucket`/`uploadBuffer`/`getPresignedUrl` all need a client instance somewhere in that file).

Replace:

```ts
app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});
```

with:

```ts
app.get("/api/health", async (_req, res) => {
  const checks = { db: false, redis: false, minio: false };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = true;
  } catch {
    checks.db = false;
  }

  try {
    const pong = await redis.ping();
    checks.redis = pong === "PONG";
  } catch {
    checks.redis = false;
  }

  try {
    checks.minio = await minioClient.bucketExists(process.env.MINIO_BUCKET ?? "madamgy");
  } catch {
    checks.minio = false;
  }

  const ok = checks.db && checks.redis && checks.minio;
  res.status(ok ? 200 : 503).json({ ok, checks });
});
```

Add the import: `import { prisma } from "./lib/prisma.js";` if not already present at the top of `index.ts` (check first — it likely isn't, since routes import it directly rather than `index.ts`).

- [ ] **Step 2: Verify the happy path manually**

Run (with docker services up): from `packages/server/`, `DATABASE_URL="postgresql://madamgy:madamgy@localhost:55432/madamgy" REDIS_URL="redis://localhost:56379" MINIO_ENDPOINT=localhost MINIO_PORT=19000 MINIO_ACCESS_KEY=madamgy MINIO_SECRET_KEY=madamgy123 MINIO_BUCKET=madamgy MINIO_USE_SSL=false JWT_ACCESS_SECRET=test JWT_REFRESH_SECRET=test PORT=3902 npx tsx src/index.ts &`

Then: `curl -s http://localhost:3902/api/health | python3 -m json.tool`
Expected: `{"ok": true, "checks": {"db": true, "redis": true, "minio": true}}`

Kill the background server: `kill %1`

- [ ] **Step 3: Run the full test suite to confirm the route change doesn't break existing tests**

Run: `DATABASE_URL="postgresql://madamgy:madamgy@localhost:55432/madamgy" REDIS_URL="redis://localhost:56379" MINIO_ENDPOINT=localhost MINIO_PORT=19000 MINIO_ACCESS_KEY=madamgy MINIO_SECRET_KEY=madamgy123 MINIO_BUCKET=madamgy MINIO_USE_SSL=false npm run test`
Expected: `56 passed (56)` (no test file currently asserts on `/api/health`'s exact shape, per the earlier audit — confirm with `grep -rn "api/health" packages/server/src/__tests__` before this step; if one exists, update its assertion to match the new response shape).

- [ ] **Step 4: Manually verify the degraded path**

Run: `docker compose stop redis`

Re-run the server from Step 2, then: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3902/api/health`
Expected: `503`

Run: `curl -s http://localhost:3902/api/health | python3 -m json.tool`
Expected: `{"ok": false, "checks": {"db": true, "redis": false, "minio": true}}`

Restore: `docker compose start redis`, kill the background server.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/index.ts
git commit -m "feat: extend health check to verify db, redis, and minio connectivity"
```

---

## Self-Review Notes

- **Spec coverage**: every gap listed in `STATUS_REPORT_2026-07-04.md`'s "Gaps found" section has a task above, except the two the user explicitly decided against acting on this pass (doctor payout automation — kept manual; patient PIN removal — kept alongside OTP) and items explicitly out of scope for an engineering plan (legal/regulatory review of prescribable-drug restrictions, multi-language UI — tracked in the frontend plan as a deferred bullet, not a task, since it's a content/design concern).
- **Task ordering**: 1 → 2 are independent quick wins; 3 → 4 are a dependency pair; 5 → 6 → 7 build on `completeCall`; 8, 9, 10 are independent additions; 11 depends on everything before it and must run last among functional tasks; 12, 13, 14 are ops tasks that can run anytime but are ordered last since they depend on nothing functional changing further.
- **Type/name consistency checked**: `completeCall` (Task 5) is the exact name used by Task 6's reaper and referenced in Task 5's own test — verified consistent. `checkAttemptLimit`/`recordFailedAttempt`/`clearAttempts` (Task 3) are the exact names used in Task 4's OTP verify route. `createPaymentOrder`/`markPaymentPaid`/`refundPayment`/`verifyWebhookSignature` (Task 7) are used identically in its own routes and in Task 7's own test.
