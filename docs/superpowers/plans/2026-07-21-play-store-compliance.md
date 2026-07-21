# Play Store Compliance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make MadamGy submittable to the public Play Store as an app with user accounts that stores health data — account deletion (in-app and via a web page reachable without installing the app), a hosted privacy policy, a Data Safety form mapping ready to paste into Play Console, Play App Signing enrollment, and a store listing asset checklist.

**Architecture:** Account deletion **anonymizes rather than hard-deletes**. This is a real technical constraint, not just a policy preference: `CallSession`, `Prescription`, `ChatMessage`, `Payment`, `WalletTransaction`, `AuditLog`, and `HealthFile` all hold a foreign key to `User` with no cascade configured (confirmed by reading `schema.prisma` directly) — hard-deleting a `User` row with any call history fails on the FK constraint. Even if it didn't, hard-deleting a patient would blow away the *other* party's legitimate records (a doctor's prescription history for a patient they treated, per the health-folder panel this app just built), and hard-deleting a doctor would blow away a patient's own prescription/consult history. Anonymization — scrub identifying fields, keep the clinical/financial rows intact for the counter-party and for audit — is both what Google's policy actually requires (account deletion, not necessarily every associated record) and the only thing the schema will let you do safely.

One shared deletion path serves both entry points: a small `anonymizeUser(userId)` service function, called either directly (in-app, already-authenticated) or after phone+OTP verification (the public web page, no login). Reuses the existing OTP infrastructure (`otp.service.ts`, the same `checkAttemptLimit`/`recordFailedAttempt` rate-limiting already used by every other OTP flow in this codebase) rather than inventing a new one.

The public web deletion page and privacy policy page are new unauthenticated routes inside the existing `packages/web` React app, not a separate static site. This works whether they're reached through the Capacitor-bundled app or through a real public deployment of `packages/web` — see the open question in Task 3 about which one is live before this ships.

**Tech Stack:** Existing stack only — Express, Prisma/PostgreSQL, Zod (via `@madamgy/api-client`), Redis (OTP + rate-limit storage, already used), Vitest + Supertest, React Router. No new services, no new dependencies.

## Global Constraints

- **Anonymize, never hard-delete.** No task in this plan issues a raw `DELETE FROM "User"` for an account with any related rows.
- **Medical-record retention duration is NOT decided by this plan.** Task 1 implements a specific default (retain clinical/financial rows indefinitely, scrub only identity fields) and flags explicitly that this needs actual legal review for the jurisdictions MadamGy operates in — health-record retention law varies and can override a user's deletion request for a legally-mandated minimum period. Do not treat Task 1's default as a compliance sign-off.
- **Wallet balance blocks deletion for DOCTOR/ADMIN/SUPER_ADMIN.** A doctor or admin with `walletBalance > 0` has real unpaid money in the system; deletion must be blocked until they withdraw, not silently zeroed. PATIENT accounts never accrue `walletBalance` (confirmed: only `call-completion.service.ts` credits it, for doctor/admin earnings), so this guard never fires for patients.
- **ADMIN and SUPER_ADMIN cannot self-delete through the public flow.** These are internally-managed staff accounts; the public phone+OTP deletion path must reject them with a clear message, not silently process them.
- TypeScript `strict: true`, no `any`. Zod schemas that cross the client/server boundary live in `packages/api-client/src/schemas/` and are exported from `packages/api-client/src/index.ts` (existing convention — see `chat.schema.ts` for the shape to match).
- Server is CommonJS via `tsx`, uses `.js` extensions in relative imports (existing convention throughout `packages/server/src`).
- Every DB migration step in this plan must actually be run against the local dev DB (`postgresql://madamgy:madamgy@localhost:55432/madamgy` via docker compose) before its task is considered done — not just written and assumed.

---

### Task 1: Backend — account anonymization service + schema migration

**Files:**
- Modify: `packages/server/src/prisma/schema.prisma`
- Create: `packages/server/src/prisma/migrations/<timestamp>_add_user_deleted_at/migration.sql` (generated, not hand-written)
- Create: `packages/server/src/services/account-deletion.service.ts`
- Create: `packages/server/src/__tests__/account-deletion.test.ts`

**Interfaces:**
- Produces: `anonymizeUser(userId: string): Promise<void>` — throws `AppError(409, "Withdraw your wallet balance before deleting your account")` if `walletBalance > 0`; throws `AppError(404, "User not found")` if the user doesn't exist or is already deleted.

- [ ] **Step 1: Add `deletedAt` to the `User` model**

In `packages/server/src/prisma/schema.prisma`, find the `User` model (starts `model User {`) and add one field after `disabled`:

```prisma
model User {
  id           String   @id @default(cuid())
  phone        String   @unique
  name         String
  role         UserRole @default(PATIENT)
  pinHash      String?
  passwordHash String?
  disabled     Boolean  @default(false)
  deletedAt    DateTime?
  walletBalance Decimal @default(0) @db.Decimal(12, 2)
  createdAt    DateTime @default(now())
```

`disabled` already exists and is reused by every auth check (`requireAuth` and the socket middleware both reject `user.disabled`), so setting it `true` on deletion is what actually locks the account out everywhere for free. `deletedAt` is a separate marker so "temporarily disabled by an admin" and "permanently deleted" stay distinguishable, and so repeat deletion requests are idempotent (see Step 3).

- [ ] **Step 2: Generate and run the migration**

Run (from `packages/server/`):
```bash
DATABASE_URL=postgresql://madamgy:madamgy@localhost:55432/madamgy npx prisma migrate dev --schema src/prisma/schema.prisma --name add_user_deleted_at
```
Expected: creates `packages/server/src/prisma/migrations/<timestamp>_add_user_deleted_at/migration.sql` containing `ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);`, applies it, regenerates the Prisma client. If the local postgres container isn't running, start it first: `docker compose up -d postgres`.

- [ ] **Step 3: Write the anonymization service**

Create `packages/server/src/services/account-deletion.service.ts`:

```typescript
import { prisma } from "../lib/prisma.js";
import { AppError } from "../middleware/error.middleware.js";

export async function anonymizeUser(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) {
    throw new AppError(404, "User not found");
  }

  if (Number(user.walletBalance) > 0) {
    throw new AppError(409, "Withdraw your wallet balance before deleting your account");
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        name: "Deleted User",
        phone: `deleted-${userId}`,
        pinHash: null,
        passwordHash: null,
        disabled: true,
        deletedAt: new Date(),
      },
    });

    await tx.patientProfile.updateMany({
      where: { userId },
      data: { heightCm: null, weightKg: null, bloodType: null, dob: null, gender: null, email: null },
    });
  });
}
```

`phone` keeps its `@unique` constraint satisfied via the `deleted-${userId}` tombstone (guaranteed unique since `userId` is). `PatientProfile` demographic fields are scrubbed; `consentGivenAt` is deliberately left untouched — it's evidence the original consent was given, not personal data itself. `DoctorProfile.regNumber` is deliberately left untouched too — it's a professional license number needed for practice-history audit, not personal data the deletion right typically covers. `CallSession`, `Prescription`, `ChatMessage`, `HealthFile`, `Payment`, and `WalletTransaction` rows are untouched — see this plan's Architecture section and the Global Constraints note on medical-record retention for why.

- [ ] **Step 4: Write the test**

Create `packages/server/src/__tests__/account-deletion.test.ts`:

```typescript
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma.js";
import { anonymizeUser } from "../services/account-deletion.service.js";

async function makeTestPatient(phoneSuffix: string) {
  return prisma.user.create({
    data: {
      phone: `77770${phoneSuffix}`,
      name: "Delete Me",
      role: "PATIENT",
      patientProfile: { create: { email: "deleteme@example.com", gender: "OTHER" } },
    },
    include: { patientProfile: true },
  });
}

describe("anonymizeUser", () => {
  const createdIds: string[] = [];

  afterAll(async () => {
    await prisma.patientProfile.deleteMany({ where: { userId: { in: createdIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdIds } } });
  });

  it("scrubs identity fields and sets deletedAt/disabled", async () => {
    const user = await makeTestPatient("00001");
    createdIds.push(user.id);

    await anonymizeUser(user.id);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { patientProfile: true } });
    expect(updated.name).toBe("Deleted User");
    expect(updated.phone).toBe(`deleted-${user.id}`);
    expect(updated.disabled).toBe(true);
    expect(updated.deletedAt).not.toBeNull();
    expect(updated.patientProfile?.email).toBeNull();
    expect(updated.patientProfile?.gender).toBeNull();
  });

  it("rejects a second deletion of the same user", async () => {
    const user = await makeTestPatient("00002");
    createdIds.push(user.id);

    await anonymizeUser(user.id);
    await expect(anonymizeUser(user.id)).rejects.toThrow("User not found");
  });

  it("blocks deletion when walletBalance is positive", async () => {
    const user = await prisma.user.create({
      data: { phone: "7777000003", name: "Rich Doctor", role: "DOCTOR", walletBalance: 500 },
    });
    createdIds.push(user.id);

    await expect(anonymizeUser(user.id)).rejects.toThrow("Withdraw your wallet balance");
  });
});
```

- [ ] **Step 5: Run the tests**

Run (from `packages/server/`, with postgres/redis up):
```bash
DATABASE_URL=postgresql://madamgy:madamgy@localhost:55432/madamgy REDIS_URL=redis://localhost:56379 npx vitest run src/__tests__/account-deletion.test.ts
```
Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/prisma/schema.prisma packages/server/src/prisma/migrations packages/server/src/services/account-deletion.service.ts packages/server/src/__tests__/account-deletion.test.ts
git commit -m "feat: add account anonymization service for Play Store deletion compliance"
```

---

### Task 2: Backend — account deletion routes (in-app + public web-page path)

**Files:**
- Create: `packages/api-client/src/schemas/account.schema.ts`
- Modify: `packages/api-client/src/index.ts`
- Create: `packages/server/src/routes/account.routes.ts`
- Modify: `packages/server/src/index.ts`
- Create: `packages/server/src/__tests__/account-routes.test.ts`

**Interfaces:**
- Consumes: `anonymizeUser` from Task 1, `storeOtp`/`verifyOtp`/`sendOtpSms` from `packages/server/src/services/otp.service.ts`, `checkAttemptLimit`/`recordFailedAttempt`/`clearAttempts` from `packages/server/src/lib/rate-limit.ts`.
- Produces: `DELETE /api/account/me` (authenticated), `POST /api/account/delete/initiate` (public), `POST /api/account/delete/verify` (public) — these three exact paths are what Task 3 and Task 5 build UI against.

- [ ] **Step 1: Add the shared Zod schemas**

Create `packages/api-client/src/schemas/account.schema.ts`:

```typescript
import { z } from "zod";

export const AccountDeleteInitiateSchema = z.object({
  phone: z.string().min(10).max(15),
});
export type AccountDeleteInitiate = z.infer<typeof AccountDeleteInitiateSchema>;

export const AccountDeleteVerifySchema = z.object({
  phone: z.string().min(10).max(15),
  otp: z.string().length(6).regex(/^\d{6}$/),
});
export type AccountDeleteVerify = z.infer<typeof AccountDeleteVerifySchema>;
```

In `packages/api-client/src/index.ts`, add alongside the other `export *` lines:

```typescript
export * from "./schemas/account.schema.js";
```

- [ ] **Step 2: Write the routes**

Create `packages/server/src/routes/account.routes.ts`:

```typescript
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { AccountDeleteInitiateSchema, AccountDeleteVerifySchema } from "@madamgy/api-client";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { AppError } from "../middleware/error.middleware.js";
import { checkAttemptLimit, clearAttempts, recordFailedAttempt } from "../lib/rate-limit.js";
import { sendOtpSms, storeOtp, verifyOtp } from "../services/otp.service.js";
import { anonymizeUser } from "../services/account-deletion.service.js";

export const accountRouter = Router();

accountRouter.delete("/me", requireAuth(), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await anonymizeUser(req.user!.sub);
    res.json({ message: "Account deleted" });
  } catch (error) {
    next(error);
  }
});

accountRouter.post(
  "/delete/initiate",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { phone } = AccountDeleteInitiateSchema.parse(req.body);
      const attemptKey = `account_delete_initiate:${phone}:${req.ip}`;
      await checkAttemptLimit(attemptKey);

      const user = await prisma.user.findUnique({ where: { phone } });
      // Same response whether the phone exists or not -- don't let this endpoint
      // become a way to enumerate registered phone numbers.
      if (user && !user.deletedAt && user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
        const otp = await storeOtp(phone);
        await sendOtpSms(phone, otp);
      }

      res.json({ message: "If this phone number has an account, an OTP has been sent." });
    } catch (error) {
      next(error);
    }
  },
);

accountRouter.post(
  "/delete/verify",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { phone, otp } = AccountDeleteVerifySchema.parse(req.body);
      const attemptKey = `account_delete_verify:${phone}`;
      await checkAttemptLimit(attemptKey);

      const valid = await verifyOtp(phone, otp);
      if (!valid) {
        await recordFailedAttempt(attemptKey);
        throw new AppError(401, "Invalid or expired OTP");
      }
      await clearAttempts(attemptKey);

      const user = await prisma.user.findUnique({ where: { phone } });
      if (!user || user.role === "ADMIN" || user.role === "SUPER_ADMIN") {
        throw new AppError(404, "Account not found");
      }

      await anonymizeUser(user.id);
      res.json({ message: "Account deleted" });
    } catch (error) {
      next(error);
    }
  },
);
```

The `ADMIN`/`SUPER_ADMIN` exclusion is deliberate — see Global Constraints. The `initiate` endpoint's identical response regardless of whether the phone is registered prevents using it to enumerate real accounts (same reasoning as a "forgot password" endpoint that never reveals whether an email exists).

- [ ] **Step 3: Register the router**

In `packages/server/src/index.ts`, add the import alongside the other route imports:

```typescript
import { accountRouter } from "./routes/account.routes.js";
```

And mount it alongside the other `app.use("/api/...")` lines:

```typescript
app.use("/api/account", accountRouter);
```

- [ ] **Step 4: Write the tests**

Create `packages/server/src/__tests__/account-routes.test.ts`:

```typescript
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../index.js";
import { prisma } from "../lib/prisma.js";

async function registerTestPatient(phone: string) {
  const response = await request(app)
    .post("/api/auth/patient/register")
    .send({ phone, name: "Delete Route Test", dob: "01/01/1990", consent: true });
  return response.body as { accessToken: string; user: { id: string } };
}

describe("account deletion routes", () => {
  const createdIds: string[] = [];

  afterAll(async () => {
    await prisma.patientProfile.deleteMany({ where: { userId: { in: createdIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdIds } } });
  });

  it("DELETE /api/account/me deletes the authenticated user", async () => {
    const { accessToken, user } = await registerTestPatient("7778000001");
    createdIds.push(user.id);

    const response = await request(app).delete("/api/account/me").set("Authorization", `Bearer ${accessToken}`);
    expect(response.status).toBe(200);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.deletedAt).not.toBeNull();
  });

  it("rejects an unauthenticated DELETE /api/account/me", async () => {
    const response = await request(app).delete("/api/account/me");
    expect(response.status).toBe(401);
  });

  it("initiate always returns the same message, registered or not", async () => {
    const { user } = await registerTestPatient("7778000002");
    createdIds.push(user.id);

    const registered = await request(app).post("/api/account/delete/initiate").send({ phone: "7778000002" });
    const unregistered = await request(app).post("/api/account/delete/initiate").send({ phone: "7778999999" });

    expect(registered.body.message).toBe(unregistered.body.message);
  });

  it("verify with the dev OTP deletes the account by phone", async () => {
    const { user } = await registerTestPatient("7778000003");
    createdIds.push(user.id);

    await request(app).post("/api/account/delete/initiate").send({ phone: "7778000003" });
    const response = await request(app).post("/api/account/delete/verify").send({ phone: "7778000003", otp: "000000" });

    expect(response.status).toBe(200);
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.deletedAt).not.toBeNull();
  });

  it("verify with a wrong OTP is rejected", async () => {
    const { user } = await registerTestPatient("7778000004");
    createdIds.push(user.id);

    await request(app).post("/api/account/delete/initiate").send({ phone: "7778000004" });
    const response = await request(app).post("/api/account/delete/verify").send({ phone: "7778000004", otp: "111111" });

    expect(response.status).toBe(401);
  });
});
```

- [ ] **Step 5: Run the tests**

Run (from `packages/server/`, with postgres/redis up, `NODE_ENV` not `production` so the OTP is the fixed dev value):
```bash
DATABASE_URL=postgresql://madamgy:madamgy@localhost:55432/madamgy REDIS_URL=redis://localhost:56379 npx vitest run src/__tests__/account-routes.test.ts
```
Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
git add packages/api-client/src/schemas/account.schema.ts packages/api-client/src/index.ts packages/server/src/routes/account.routes.ts packages/server/src/index.ts packages/server/src/__tests__/account-routes.test.ts
git commit -m "feat: add account deletion routes (in-app and public OTP-verified path)"
```

---

### Task 3: Frontend — public "Delete my account" web page

**Files:**
- Create: `packages/web/src/pages/legal/DeleteAccount.tsx`
- Modify: `packages/web/src/App.tsx`

**Interfaces:**
- Consumes: `POST /api/account/delete/initiate`, `POST /api/account/delete/verify` from Task 2.

**Open question, not resolved by this task:** Google requires this page be "reachable without installing the app" — a real public URL. Today `packages/web` is bundled into the Capacitor APK (`webDir: '../web/dist'`) and there is no confirmed separate public deployment of it. This task builds the page as a normal route in the existing app either way (it costs nothing extra and works the moment `packages/web` gets a public deployment), but **do not check this task off as "Play Store ready" until you've confirmed `packages/web` is actually live at a public URL** — that's a deployment/hosting decision outside this plan's scope.

- [ ] **Step 1: Build the page**

Create `packages/web/src/pages/legal/DeleteAccount.tsx`:

```tsx
import { useState } from "react";
import toast from "react-hot-toast";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";

export default function DeleteAccount() {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp" | "done">("phone");
  const [submitting, setSubmitting] = useState(false);

  async function initiate(): Promise<void> {
    setSubmitting(true);
    try {
      await api.post("/account/delete/initiate", { phone });
      setStep("otp");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Something went wrong"));
    } finally {
      setSubmitting(false);
    }
  }

  async function verify(): Promise<void> {
    setSubmitting(true);
    try {
      await api.post("/account/delete/verify", { phone, otp });
      setStep("done");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Invalid or expired OTP"));
      setOtp("");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "done") {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900">Account deleted</h1>
        <p className="text-gray-600">
          Your MadamGy account and personal details have been removed. Any consultation or payment
          records tied to your account are retained only as required for medical record-keeping and
          financial audit.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-8">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-gray-900">Delete your MadamGy account</h1>
        <p className="text-gray-600">
          This permanently removes your name, contact details, and health profile from MadamGy. This
          cannot be undone. You don't need the app installed to do this.
        </p>
      </div>
      {step === "phone" ? (
        <div className="flex flex-col gap-4">
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="Phone number used to register"
            type="tel"
            className="w-full rounded-2xl border-2 p-4 text-lg"
          />
          <button
            type="button"
            disabled={submitting || phone.length < 10}
            onClick={() => void initiate()}
            className="rounded-2xl bg-red-600 py-4 text-lg font-semibold text-white disabled:opacity-40"
          >
            {submitting ? "Sending..." : "Send verification code"}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <input
            value={otp}
            onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="6-digit code"
            inputMode="numeric"
            className="w-full rounded-2xl border-2 p-4 text-center text-2xl tracking-widest"
          />
          <button
            type="button"
            disabled={submitting || otp.length !== 6}
            onClick={() => void verify()}
            className="rounded-2xl bg-red-600 py-4 text-lg font-semibold text-white disabled:opacity-40"
          >
            {submitting ? "Deleting..." : "Confirm deletion"}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the public route**

In `packages/web/src/App.tsx`, add the import near the other page imports:

```typescript
import DeleteAccount from "./pages/legal/DeleteAccount";
```

And add the route inside `<Routes>`, outside any `RequireRole` wrapper (this must work for a logged-out visitor):

```tsx
<Route path="/delete-account" element={<DeleteAccount />} />
```

- [ ] **Step 3: Typecheck and build**

Run (from repo root):
```bash
npm run typecheck --workspace @madamgy/web
npm run build --workspace @madamgy/web
```
Expected: both succeed with no errors.

- [ ] **Step 4: Manually verify**

Run `npm run dev`, navigate to `/delete-account` **while logged out**, confirm the page renders without redirecting to a login screen, enter a test patient's phone number, submit, confirm the OTP step appears, enter the dev OTP (`000000` when `NODE_ENV !== "production"`), confirm the "Account deleted" confirmation renders, then confirm that patient can no longer log in.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/pages/legal/DeleteAccount.tsx packages/web/src/App.tsx
git commit -m "feat: add public account-deletion web page"
```

---

### Task 4: Frontend — hosted privacy policy page

**Files:**
- Create: `packages/web/src/pages/legal/PrivacyPolicy.tsx`
- Modify: `packages/web/src/App.tsx`

**Interfaces:**
- Produces: a public route at `/privacy-policy`, linked from the Play Console listing and from `DeleteAccount.tsx`'s confirmation copy if desired.

**This is a draft, not legal sign-off.** The content below is grounded in the actual data model (every field named is real, cross-checked against `schema.prisma`) so it's accurate as an engineering starting point, but a real privacy policy for a health app needs actual legal review before publishing — this task produces the page and its content, not legal clearance.

- [ ] **Step 1: Build the page**

Create `packages/web/src/pages/legal/PrivacyPolicy.tsx`:

```tsx
export default function PrivacyPolicy() {
  return (
    <div className="mx-auto max-w-2xl p-8 text-gray-800">
      <h1 className="mb-6 text-3xl font-bold text-gray-900">Privacy Policy</h1>
      <p className="mb-4 text-sm text-gray-500">Last updated: check this date against the actual publish date before submitting to Play Console.</p>

      <h2 className="mb-2 mt-8 text-xl font-bold text-gray-900">What we collect</h2>
      <ul className="mb-4 list-disc space-y-2 pl-6">
        <li><strong>Account details:</strong> phone number, full name, date of birth.</li>
        <li><strong>Optional profile details:</strong> gender, email address, height, weight, blood type.</li>
        <li><strong>Health information:</strong> lab reports and other files you upload, prescriptions issued during a consultation, and vitals shared during a call.</li>
        <li><strong>Consultation content:</strong> chat messages (text, images, and documents) exchanged with your doctor during a call.</li>
        <li><strong>Payment metadata:</strong> consultation fee amount and payment status, processed via Razorpay. We do not store your card, UPI, or bank details — Razorpay handles that directly.</li>
        <li><strong>For doctors:</strong> degree, registration number, specialization, and license document, used for admin verification before approval.</li>
      </ul>

      <h2 className="mb-2 mt-8 text-xl font-bold text-gray-900">Who can access it</h2>
      <ul className="mb-4 list-disc space-y-2 pl-6">
        <li>The doctor assigned to your consultation can see your health profile, uploaded files, and prior prescriptions with MadamGy, so they can treat you safely.</li>
        <li>Platform administrators can access account and consultation records for support, safety, and compliance purposes.</li>
        <li>We do not sell your personal or health data to third parties.</li>
      </ul>

      <h2 className="mb-2 mt-8 text-xl font-bold text-gray-900">How long we keep it</h2>
      <p className="mb-4">
        We retain consultation and prescription records for as long as required by applicable medical
        record-keeping regulations, even after you delete your account, so your treating doctor's
        records remain complete and auditable. Your personal identifying details (name, phone, email,
        and profile information) are removed when you delete your account; consultation records
        associated with your account are retained but no longer linked to your identifying information
        beyond what's necessary for that retention requirement.
      </p>

      <h2 className="mb-2 mt-8 text-xl font-bold text-gray-900">Deleting your account</h2>
      <p className="mb-4">
        You can delete your account and personal data at any time from within the app, or without
        installing the app at <a href="/delete-account" className="text-blue-600 underline">/delete-account</a>.
      </p>

      <h2 className="mb-2 mt-8 text-xl font-bold text-gray-900">Contact</h2>
      <p className="mb-4">Replace this line with a real support contact email before publishing.</p>
    </div>
  );
}
```

- [ ] **Step 2: Add the public route**

In `packages/web/src/App.tsx`:

```typescript
import PrivacyPolicy from "./pages/legal/PrivacyPolicy";
```

```tsx
<Route path="/privacy-policy" element={<PrivacyPolicy />} />
```

- [ ] **Step 3: Typecheck and build**

Run:
```bash
npm run typecheck --workspace @madamgy/web
npm run build --workspace @madamgy/web
```
Expected: both succeed.

- [ ] **Step 4: Manually verify**

Run `npm run dev`, navigate to `/privacy-policy` while logged out, confirm it renders without requiring auth.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/pages/legal/PrivacyPolicy.tsx packages/web/src/App.tsx
git commit -m "feat: add hosted privacy policy page"
```

---

### Task 5: Frontend — in-app "Delete my account" entry points

**Files:**
- Modify: `packages/web/src/pages/kiosk/Dashboard.tsx`
- Modify: `packages/web/src/pages/doctor/Dashboard.tsx`

**Interfaces:**
- Consumes: `DELETE /api/account/me` from Task 2, existing `logout()` helper from `packages/web/src/lib/logout.ts`.

Google requires deletion be available **in-app**, not only on the web page. Both dashboards get a "Delete Account" control gated behind a confirmation step (this is irreversible), which logs the user out immediately after success.

- [ ] **Step 1: Add to the patient dashboard**

In `packages/web/src/pages/kiosk/Dashboard.tsx`, add the import:

```typescript
import { logout } from "../../lib/logout";
```

Add state and a handler inside `KioskDashboard`:

```typescript
const [confirmingDelete, setConfirmingDelete] = useState(false);

async function deleteAccount(): Promise<void> {
  try {
    await api.delete("/account/me");
    await logout();
    navigate("/");
  } catch (error) {
    toast.error(getApiErrorMessage(error, "Could not delete account"));
  }
}
```

Add the control near the bottom of the returned JSX, after the files list `</div>`:

```tsx
<div className="mt-8 border-t pt-6 text-center">
  {confirmingDelete ? (
    <div className="flex flex-col items-center gap-3">
      <p className="text-sm text-gray-600">This permanently deletes your account. This cannot be undone.</p>
      <div className="flex gap-3">
        <button type="button" onClick={() => void deleteAccount()} className="rounded-xl bg-red-600 px-4 py-2 font-semibold text-white">
          Yes, delete my account
        </button>
        <button type="button" onClick={() => setConfirmingDelete(false)} className="rounded-xl bg-gray-100 px-4 py-2 font-semibold text-gray-700">
          Cancel
        </button>
      </div>
    </div>
  ) : (
    <button type="button" onClick={() => setConfirmingDelete(true)} className="text-sm text-red-600 underline">
      Delete my account
    </button>
  )}
</div>
```

- [ ] **Step 2: Add to the doctor dashboard**

In `packages/web/src/pages/doctor/Dashboard.tsx`, add:

```typescript
const [confirmingDelete, setConfirmingDelete] = useState(false);

async function deleteAccount(): Promise<void> {
  try {
    await api.delete("/account/me");
    await logout();
    navigate("/doctor/login");
  } catch (error) {
    toast.error(getApiErrorMessage(error, "Could not delete account"));
  }
}
```

Add the same confirm-then-delete control near the bottom of the returned JSX, inside the `<div className="mx-auto max-w-2xl">` wrapper, after the incoming-call block:

```tsx
<div className="mt-8 border-t pt-6 text-center">
  {confirmingDelete ? (
    <div className="flex flex-col items-center gap-3">
      <p className="text-sm text-gray-600">
        This permanently deletes your account. Any wallet balance must be withdrawn first. This cannot be undone.
      </p>
      <div className="flex gap-3">
        <button type="button" onClick={() => void deleteAccount()} className="rounded-xl bg-red-600 px-4 py-2 font-semibold text-white">
          Yes, delete my account
        </button>
        <button type="button" onClick={() => setConfirmingDelete(false)} className="rounded-xl bg-gray-100 px-4 py-2 font-semibold text-gray-700">
          Cancel
        </button>
      </div>
    </div>
  ) : (
    <button type="button" onClick={() => setConfirmingDelete(true)} className="text-sm text-red-600 underline">
      Delete my account
    </button>
  )}
</div>
```

`logout` is imported already in this file (used by the existing `signOut` function) — no new import needed.

- [ ] **Step 3: Typecheck and build**

Run:
```bash
npm run typecheck --workspace @madamgy/web
npm run build --workspace @madamgy/web
```
Expected: both succeed.

- [ ] **Step 4: Manually verify**

Run `npm run dev`. Log in as a patient, click "Delete my account," confirm the two-step confirmation, confirm deletion logs you out and the account can no longer log back in. Repeat for a doctor with `walletBalance = 0` (should succeed) and, separately, confirm via a direct API call that a doctor with `walletBalance > 0` gets the 409 "withdraw first" error instead of succeeding.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/pages/kiosk/Dashboard.tsx packages/web/src/pages/doctor/Dashboard.tsx
git commit -m "feat: add in-app account deletion to patient and doctor dashboards"
```

---

### Task 6: Data Safety form mapping

**Files:**
- Create: `docs/superpowers/specs/2026-07-21-play-store-data-safety-mapping.md`

This is not a code task — Play Console's Data Safety questionnaire is a web form you fill in by hand. This task produces the exact mapping to paste into that form, derived from the real schema (re-verify against `packages/server/src/prisma/schema.prisma` at actual submission time, since the schema will keep changing).

- [ ] **Step 1: Write the mapping document**

Create `docs/superpowers/specs/2026-07-21-play-store-data-safety-mapping.md`:

```markdown
# Play Console Data Safety Form — MadamGy

Re-verify every row against `packages/server/src/prisma/schema.prisma` at submission
time before pasting into Play Console — this snapshot is dated 2026-07-21.

## Does your app collect or share any of the required user data types?
Yes.

## Data types collected

| Play Console category | Specific data | Collected? | Shared with third parties? | Purpose | Optional? | Deletable on request? |
|---|---|---|---|---|---|---|
| Personal info > Name | `User.name` | Yes | No | Account functionality | No | Yes (Task 1-2) |
| Personal info > Phone number | `User.phone` | Yes | No | Account functionality, OTP auth | No | Yes (tombstoned) |
| Personal info > Email address | `PatientProfile.email` | Yes | No | Account functionality | Yes | Yes |
| Personal info > Other (DOB, gender) | `PatientProfile.dob`, `PatientProfile.gender` | Yes | No | Account functionality | Gender: yes; DOB: no | Yes |
| Health and fitness > Health info | `PatientProfile.heightCm/weightKg/bloodType`, vitals in `ChatMessage.vitals`, `HealthFile`, `Prescription.content` | Yes | No (doctor treating the patient sees it; not a third party) | App functionality (telemedicine) | N/A | Personal identity yes; retained clinical records per Global Constraints |
| Financial info > Purchase history | `Payment` (amount, status) | Yes | Yes — Razorpay (payment processor) | Payment processing | No | Retained for financial audit |
| Financial info > Other | `WalletTransaction` (doctor/admin earnings) | Yes | No | App functionality (doctor payouts) | No | Retained for financial audit |
| Messages > In-app messages | `ChatMessage` (text, imageKey) | Yes | No | App functionality (consult chat) | No | Retained, tied to CallSession not identity after deletion |
| Photos and videos | Chat image attachments, lab report uploads (MinIO) | Yes | No | App functionality | Yes | Retained per above |
| App activity | Call session status/timing (`CallSession`) | Yes | No | App functionality | No | Retained |

## Security practices to declare
- Data is encrypted in transit (HTTPS/WSS).
- Users can request data deletion (`/delete-account`, in-app control — Tasks 3 and 5).
- Confirm with current infra whether data is encrypted at rest (check the Postgres/MinIO deployment config at submission time — not verified by this plan).

## Data collected but NOT covered above (verify still true at submission time)
- No location data collected.
- No contacts/calendar access.
- No advertising/analytics identifiers (no ad SDKs in `packages/web/package.json` as of this snapshot).
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-07-21-play-store-data-safety-mapping.md
git commit -m "docs: add Play Console Data Safety form mapping"
```

---

### Task 7: Play App Signing enrollment (ops runbook)

**Files:**
- Create: `docs/superpowers/specs/2026-07-21-play-app-signing-runbook.md` (the runbook itself; the actual keystore file and its password are explicitly **not** created inside this repo — see Step 1)

This task is a set of commands run once, outside CI, by whoever holds the Play Console account. It is documented here so it isn't done ad hoc and forgotten.

- [ ] **Step 1: Generate the upload keystore**

Run, from anywhere **outside this repository** (e.g. `~/madamgy-signing/`, not `packages/kiosk-android/`):

```bash
keytool -genkeypair -v -keystore madamgy-upload-key.jks -alias madamgy-upload -keyalg RSA -keysize 2048 -validity 9125
```

`keytool` will prompt for a keystore password, a key password, and identity details (name, org, country). Use a real password manager to generate and store both passwords — do not reuse an existing password, do not write it in this repo or in the runbook itself.

- [ ] **Step 2: Record where it lives, not what it is**

In `docs/superpowers/specs/2026-07-21-play-app-signing-runbook.md`, write:

```markdown
# Play App Signing Runbook — MadamGy

## Upload keystore
Generated 2026-07-21 via `keytool -genkeypair ... -keystore madamgy-upload-key.jks -alias madamgy-upload -keyalg RSA -keysize 2048 -validity 9125`.

Location: <fill in the actual secrets-manager/password-manager entry name here, e.g. "1Password: MadamGy > Play Upload Keystore" -- never a filesystem path or a value>
Alias: madamgy-upload
Key password and store password: stored in the same password manager entry, not here.

## Play App Signing enrollment steps
1. Play Console > your app > Setup > App signing.
2. Choose "Use Play App Signing" (Google-managed) rather than legacy full self-management --
   Google recommends this for new apps and it's the current default flow.
3. Upload the certificate generated from `madamgy-upload-key.jks` when prompted (Play Console
   walks through exporting the public certificate via `keytool -export`).
4. Confirm the SHA-1 and SHA-256 fingerprints shown in Play Console match a local
   `keytool -list -v -keystore madamgy-upload-key.jks` output before trusting the enrollment.

## Who has access
<fill in: which team members have the password-manager entry, so this isn't a single
point of failure if one person leaves>
```

- [ ] **Step 3: Commit only the runbook, never the keystore**

```bash
git add docs/superpowers/specs/2026-07-21-play-app-signing-runbook.md
git status
```
Confirm `git status` shows only the runbook staged — if `madamgy-upload-key.jks` or any `.jks`/`.keystore` file appears, stop and do not commit; add `*.jks` and `*.keystore` to the root `.gitignore` first.

```bash
git commit -m "docs: add Play App Signing enrollment runbook"
```

---

### Task 8: Store listing assets checklist

**Files:**
- Create: `docs/superpowers/specs/2026-07-21-play-store-listing-checklist.md`

**Sequencing:** do not produce final screenshots or the feature graphic until Task 14 (Visual & Brand Design pass, in the frontend plan) ships — they need the real designed UI, not the wiring-only version. The checklist itself can be written now.

- [ ] **Step 1: Write the checklist**

Create `docs/superpowers/specs/2026-07-21-play-store-listing-checklist.md`:

```markdown
# Play Store Listing Checklist — MadamGy

Re-check Play Console's current requirements at submission time -- exact pixel
dimensions and policy requirements (especially for "Medical" category apps)
change periodically.

## Assets (blocked on Task 14 -- frontend plan's visual design pass)
- [ ] App icon (512x512 PNG, 32-bit with alpha) -- use the icon Task 14 produces,
      not the default Capacitor placeholder in `packages/kiosk-android/android/app/src/main/res/mipmap-*`.
- [ ] Feature graphic (1024x500 PNG or JPEG).
- [ ] Phone screenshots, minimum 2, using the real designed UI: patient OTP login,
      patient dashboard, consult/video call screen, doctor dashboard, patient
      history panel.
- [ ] Short description (max 80 characters).
- [ ] Full description (max 4000 characters).

## Store listing metadata
- [ ] Category: likely "Medical" -- re-check Play's current Medical apps policy
      at submission time; it periodically adds certification/documentation
      requirements (e.g. proof of medical licensing/regulatory compliance in
      the operating region) beyond a normal app submission.
- [ ] Content rating questionnaire completed.
- [ ] Privacy policy URL: the public URL for the page built in Task 4
      (`/privacy-policy`) -- confirm it's actually publicly reachable before
      pasting the URL into Play Console, not just working in local dev.
- [ ] Data Safety form filled in from `2026-07-21-play-store-data-safety-mapping.md` (Task 6).
- [ ] App signing enrolled per `2026-07-21-play-app-signing-runbook.md` (Task 7).
- [ ] Target API level meets Play's current minimum (check against
      `packages/kiosk-android/android/variables.gradle`'s `targetSdkVersion`
      -- was 36 as of the Capacitor scaffold on 2026-07-21 -- against Play's
      current minimum requirement at submission time).

## Account deletion / data safety cross-links Play reviewers check
- [ ] Account deletion web URL (`/delete-account`, Task 3) is reachable and
      works without the app installed -- test from a browser Google's
      reviewers would plausibly use, not just localhost.
- [ ] In-app deletion control (Task 5) is reachable from a logged-in session
      without contacting support.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-07-21-play-store-listing-checklist.md
git commit -m "docs: add Play Store listing asset checklist"
```

---

## Questions

- **Medical-record retention duration**: Task 1's default (retain clinical/financial records indefinitely, scrub identity only) needs sign-off from whoever handles MadamGy's legal/regulatory compliance — health-record retention law is jurisdiction-specific and this plan does not have that answer.
- **Is `packages/web` deployed at a real public URL today?** Task 3 and Task 4 build pages that must be reachable without installing the app. If `packages/web` is only ever bundled into the Capacitor APK right now, those pages exist in the codebase but aren't yet "reachable without installing the app" in Google's sense until a public deployment exists.
- **Category-specific Play policy for health apps**: "Medical" category apps periodically get extra certification/documentation requirements from Google. Task 8 flags re-checking this at submission time rather than assuming today's requirements still hold.
