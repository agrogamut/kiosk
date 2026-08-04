# Call Reconnect & Room-Close Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A network drop during a video consult no longer ends the call. The room stays open until the doctor explicitly closes it, or sits with nobody connected for 2 minutes — and either party can rejoin after a live drop or a full page reload.

**Architecture:** LiveKit owns "is the room empty" via a per-room `departureTimeout` (120s) set at room-creation time, and reports back through a `room_finished` webhook that the backend uses to end the call. Client-side `onDisconnected` handlers stop touching the server entirely (today one of them wrongly ends the call outright) and instead show a manual "Rejoin" control. Rejoin — whether from a live drop or a full reload — goes through one new `GET /calls/active` endpoint that returns the caller's in-progress call plus a fresh LiveKit token.

**Tech Stack:** Express + Prisma + Socket.IO (backend), React + React Router + Zustand + `@livekit/components-react` (frontend), `livekit-server-sdk` (`RoomServiceClient`, `WebhookReceiver`), Vitest + Supertest (backend tests only — the frontend package has no test runner configured).

## Global Constraints

- Once a call is `ACTIVE`, only the doctor may end it (`call:end`); the patient's existing pre-`ACTIVE` (`QUEUED`/`RINGING`) cancel behavior is unchanged.
- No DB schema changes — everything is built on the existing `CallSession.status` / `CallSession.livekitRoom` fields.
- `livekitService.createRoom()` must be best-effort: if it fails (LiveKit unreachable/misconfigured), log and continue rather than blocking `call:accept` — LiveKit still auto-creates the room on first join with its own (shorter) default departure timeout, so a call can still connect.
- Backend needs a new env var `LIVEKIT_HOST` (an `http(s)://` or `ws(s)://` URL — `livekit-server-sdk` auto-converts `ws`→`http`). CI already defines `LIVEKIT_HOST: "ws://localhost:7880"` in `.github/workflows/ci.yml:59` (unused today); no CI changes are needed for this plan.

---

## Backend

### Task 1: `livekitService.createRoom()` with an explicit 2-minute departure timeout

**Files:**
- Modify: `packages/server/src/services/livekit.service.ts`
- Modify: `packages/server/src/socket/call.handler.ts:8-33` (the `call:accept` handler)
- Modify: `.env.example` (add `LIVEKIT_HOST`)
- Test: `packages/server/src/__tests__/livekit-service.test.ts` (new)

**Interfaces:**
- Produces: `livekitService.createRoom(room: string): Promise<void>` — never throws.

- [ ] **Step 1: Write the failing test**

`RoomServiceClient` makes a real network call, so this test mocks the `livekit-server-sdk` module rather than hitting a live server (the repo's e2e test already covers the real-network path for token generation; this test only needs to prove our wrapper calls `createRoom` with the right args and swallows errors).

```typescript
// packages/server/src/__tests__/livekit-service.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";

const createRoomMock = vi.fn();

vi.mock("livekit-server-sdk", async () => {
  const actual = await vi.importActual<typeof import("livekit-server-sdk")>("livekit-server-sdk");
  return {
    ...actual,
    RoomServiceClient: vi.fn().mockImplementation(() => ({
      createRoom: createRoomMock,
    })),
  };
});

describe("livekitService.createRoom", () => {
  afterEach(() => {
    createRoomMock.mockReset();
  });

  it("creates the room with a 2-minute departure timeout", async () => {
    createRoomMock.mockResolvedValueOnce(undefined);
    const { livekitService } = await import("../services/livekit.service.js");

    await livekitService.createRoom("room-test-1");

    expect(createRoomMock).toHaveBeenCalledWith({ name: "room-test-1", departureTimeout: 120 });
  });

  it("swallows errors instead of throwing", async () => {
    createRoomMock.mockRejectedValueOnce(new Error("connection refused"));
    const { livekitService } = await import("../services/livekit.service.js");

    await expect(livekitService.createRoom("room-test-2")).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @madamgy/server -- livekit-service` (from repo root)
Expected: FAIL — `livekitService.createRoom is not a function`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/server/src/services/livekit.service.ts
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

const roomService = new RoomServiceClient(
  process.env.LIVEKIT_HOST!,
  process.env.LIVEKIT_API_KEY!,
  process.env.LIVEKIT_API_SECRET!,
);

export const livekitService = {
  async generateToken(room: string, participantId: string): Promise<string> {
    const token = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, {
      identity: participantId,
      ttl: "2h",
    });

    token.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });

    return token.toJwt();
  },

  // Best-effort: keeps the room open for 2 minutes after the last participant leaves, giving
  // either side time to rejoin after a network drop. If this call fails, LiveKit still
  // auto-creates the room on first join with its own (shorter) default departure timeout, so a
  // call can still connect -- this must never block call:accept.
  async createRoom(room: string): Promise<void> {
    try {
      await roomService.createRoom({ name: room, departureTimeout: 120 });
    } catch (error) {
      console.error("livekit createRoom failed, falling back to implicit room creation", room, error);
    }
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace @madamgy/server -- livekit-service`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire it into `call:accept`**

In `packages/server/src/socket/call.handler.ts`, the `call:accept` handler currently goes straight from the status update to generating tokens:

```typescript
      await prisma.callSession.update({
        where: { id: callSessionId },
        data: { status: "ACTIVE", startedAt: new Date() },
      });

      const [doctorToken, patientToken] = await Promise.all([
```

Insert a room-creation call between those two blocks so the room exists with the 2-minute departure timeout before either client connects:

```typescript
      await prisma.callSession.update({
        where: { id: callSessionId },
        data: { status: "ACTIVE", startedAt: new Date() },
      });

      await livekitService.createRoom(call.livekitRoom);

      const [doctorToken, patientToken] = await Promise.all([
```

Add the import at the top of the file: `import { livekitService } from "../services/livekit.service.js";`

- [ ] **Step 6: Add `LIVEKIT_HOST` to `.env.example`**

In `.env.example`, next to the existing `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` lines (around line 21-24), add:

```
LIVEKIT_HOST=ws://localhost:7880
```

- [ ] **Step 7: Run the full server test suite to confirm no regression**

Run: `npm run test --workspace @madamgy/server`
Expected: PASS, including the existing `e2e-consult-flow.test.ts` (its spawned server doesn't set `LIVEKIT_HOST`, so `createRoom` will fail with a connection error and be swallowed — the test should be unaffected since it never asserted anything about room creation).

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/services/livekit.service.ts packages/server/src/socket/call.handler.ts packages/server/src/__tests__/livekit-service.test.ts .env.example
git commit -m "feat: create LiveKit rooms with a 2-minute departure timeout"
```

---

### Task 2: Doctor-only `call:end` once a call is ACTIVE

**Files:**
- Modify: `packages/server/src/socket/call.handler.ts:35-46` (the `call:end` handler)
- Test: `packages/server/src/__tests__/e2e-consult-flow.test.ts` (append a new `it` block — this is the only test file in the repo that drives socket handlers over a real connection)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new (behavior-only change to an existing handler).

- [ ] **Step 1: Write the failing test**

Append this test inside the existing `describe("Full consult flow (real workers + sockets, no mocks)", ...)` block in `e2e-consult-flow.test.ts`, after the first `it(...)` block (the file already has a working pattern for standing up a patient + doctor + accepted call — reuse it, then assert the new authorization rule):

```typescript
  it("only lets the doctor end an ACTIVE call, not the patient", async () => {
    const rand = Math.floor(Math.random() * 1e8);
    const patientPhone = `70003${rand}`.slice(0, 12);
    const doctorPhone = `80003${rand}`.slice(0, 12);
    const { phone: adminPhone, password: adminPassword } = await ensureAdmin();

    const patientRegister = await api.post("/auth/patient/register", {
      phone: patientPhone,
      name: "E2E Guard Patient",
      dob: "01/01/1990",
      consent: true,
    });
    const patientToken: string = patientRegister.data.accessToken;

    const doctorForm = new FormData();
    doctorForm.append(
      "data",
      JSON.stringify({
        phone: doctorPhone,
        name: "E2E Guard Doctor",
        password: "password123",
        degree: "MBBS",
        regNumber: `E2E-REG-GUARD-${rand}`,
        regYear: "2015",
        regType: "Medical Council of India",
        email: "e2e-guard-doctor@example.com",
        gender: "MALE",
        dob: "01/01/1990",
        experienceYears: 5,
        city: "Mumbai",
        state: "Maharashtra",
        address: "123 Health St",
        about: "Experienced general physician.",
        specializations: ["General Medicine"],
        educations: [{ degree: "MBBS", institution: "Grant Medical College", year: "2012" }],
      }),
    );
    await api.post("/auth/doctor/register", doctorForm, { headers: doctorForm.getHeaders() });

    const adminLogin = await api.post("/auth/admin/login", { phone: adminPhone, password: adminPassword });
    const adminToken: string = adminLogin.data.accessToken;
    const doctors = await api.get("/admin/doctors", { headers: { Authorization: `Bearer ${adminToken}` } });
    const doctor = doctors.data.find((d: { phone: string }) => d.phone === doctorPhone);
    await api.put(`/admin/doctors/${doctor.id}/approve`, {}, { headers: { Authorization: `Bearer ${adminToken}` } });

    await api.post("/auth/doctor/login/initiate", { phone: doctorPhone, password: "password123" });
    const doctorLogin = await api.post("/auth/doctor/login/verify", { phone: doctorPhone, otp: "000000" });
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

    doctorSocket.emit("presence:ping");
    await new Promise((resolve) => setTimeout(resolve, 300));

    const incomingPromise = new Promise<{ callSession: { id: string } }>((resolve, reject) => {
      doctorSocket.once("call:incoming", resolve);
      setTimeout(() => reject(new Error("call:incoming timeout")), 8000);
    });
    const createCall = await api.post("/calls", {}, { headers: { Authorization: `Bearer ${patientToken}` } });
    const callSessionId: string = createCall.data.id;
    await incomingPromise;

    const acceptedPromise = new Promise<void>((resolve, reject) => {
      let got = 0;
      const done = () => {
        got++;
        if (got === 2) resolve();
      };
      patientSocket.once("call:accepted", done);
      doctorSocket.once("call:accepted", done);
      setTimeout(() => reject(new Error("call:accepted timeout")), 5000);
    });
    doctorSocket.emit("call:accept", { callSessionId });
    await acceptedPromise;

    // Patient tries to end the now-ACTIVE call -- must be ignored, no call:ended fires.
    let endedFired = false;
    patientSocket.once("call:ended", () => {
      endedFired = true;
    });
    patientSocket.emit("call:end", { callSessionId });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(endedFired).toBe(false);

    const stillActive = await prisma.callSession.findUniqueOrThrow({ where: { id: callSessionId } });
    expect(stillActive.status).toBe("ACTIVE");

    // Doctor ends it -- must succeed.
    const doctorEndedPromise = new Promise<void>((resolve, reject) => {
      patientSocket.once("call:ended", () => resolve());
      setTimeout(() => reject(new Error("call:ended timeout")), 5000);
    });
    doctorSocket.emit("call:end", { callSessionId });
    await doctorEndedPromise;

    const ended = await prisma.callSession.findUniqueOrThrow({ where: { id: callSessionId } });
    expect(ended.status).toBe("ENDED");

    patientSocket.close();
    doctorSocket.close();
  }, 30_000);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @madamgy/server -- e2e-consult-flow`
Expected: FAIL on `expect(endedFired).toBe(false)` — today's handler lets the patient end an ACTIVE call.

- [ ] **Step 3: Write minimal implementation**

In `packages/server/src/socket/call.handler.ts`, the `call:end` handler:

```typescript
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

becomes:

```typescript
  socket.on("call:end", async ({ callSessionId }: { callSessionId: string }) => {
    try {
      const call = await prisma.callSession.findUnique({ where: { id: callSessionId } });
      if (!call || (call.patientId !== userId && call.doctorId !== userId)) {
        return;
      }
      // Once a call is ACTIVE, only the doctor may end it -- a network-dropped patient can only
      // leave (disconnect), not close the room. Pre-ACTIVE (QUEUED/RINGING) keeps the old
      // either-party behavior so the patient's existing Cancel button still works.
      if (call.status === "ACTIVE" && call.doctorId !== userId) {
        return;
      }

      await completeCall(callSessionId);
    } catch (error) {
      console.error("call:end error", error);
    }
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace @madamgy/server -- e2e-consult-flow`
Expected: PASS (all `it` blocks in the file, including the new one). This file runs real BullMQ workers so allow the full ~30s.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/socket/call.handler.ts packages/server/src/__tests__/e2e-consult-flow.test.ts
git commit -m "fix: only let the doctor end an ACTIVE call"
```

---

### Task 3: LiveKit `room_finished` webhook closes the call

**Files:**
- Create: `packages/server/src/routes/webhooks.routes.ts`
- Modify: `packages/server/src/index.ts` (raw-body middleware + router registration)
- Test: `packages/server/src/__tests__/webhooks-livekit.test.ts` (new)

**Interfaces:**
- Consumes: `completeCall(callSessionId: string): Promise<void>` from `packages/server/src/services/call-completion.service.ts` (already idempotent).
- Produces: `POST /api/webhooks/livekit` — no response body consumers elsewhere; verified only by this task's own tests.

- [ ] **Step 1: Write the failing test**

This constructs a real, validly-signed LiveKit webhook payload using the same `AccessToken`/`sha256` mechanism `WebhookReceiver` verifies against, so no live LiveKit server is needed.

```typescript
// packages/server/src/__tests__/webhooks-livekit.test.ts
import { createHash } from "node:crypto";
import request from "supertest";
import { AccessToken } from "livekit-server-sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../index.js";
import { prisma } from "../lib/prisma.js";

async function signedWebhookHeaders(bodyString: string): Promise<Record<string, string>> {
  const hash = createHash("sha256").update(bodyString).digest("base64");
  const token = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!);
  token.sha256 = hash;
  const jwt = await token.toJwt();
  return { Authorize: jwt, "Content-Type": "application/webhook+json" };
}

describe("POST /api/webhooks/livekit", () => {
  let patientId: string;
  let doctorId: string;
  let callId: string;

  beforeAll(async () => {
    const patient = await prisma.user.create({
      data: { phone: "8888800001", name: "Webhook Patient", role: "PATIENT" },
    });
    patientId = patient.id;
    const doctor = await prisma.user.create({
      data: {
        phone: "8888800002",
        name: "Webhook Doctor",
        role: "DOCTOR",
        doctorProfile: { create: { degree: "MBBS", regNumber: "WEBHOOK-REG-1", isApproved: true } },
      },
    });
    doctorId = doctor.id;
    const call = await prisma.callSession.create({
      data: { patientId, doctorId, status: "ACTIVE", livekitRoom: "room-webhook-test", startedAt: new Date() },
    });
    callId = call.id;
  });

  afterAll(async () => {
    await prisma.walletTransaction.deleteMany({ where: { userId: doctorId } });
    await prisma.callSession.deleteMany({ where: { id: callId } });
    await prisma.doctorProfile.deleteMany({ where: { userId: doctorId } });
    await prisma.user.deleteMany({ where: { id: { in: [patientId, doctorId] } } });
  });

  it("ends the call when its room's room_finished event arrives", async () => {
    const body = JSON.stringify({ event: "room_finished", room: { name: "room-webhook-test" } });
    const headers = await signedWebhookHeaders(body);

    const response = await request(app).post("/api/webhooks/livekit").set(headers).send(body);
    expect(response.status).toBe(200);

    const call = await prisma.callSession.findUniqueOrThrow({ where: { id: callId } });
    expect(call.status).toBe("ENDED");
  });

  it("rejects a payload with an invalid signature", async () => {
    const body = JSON.stringify({ event: "room_finished", room: { name: "room-webhook-test" } });

    const response = await request(app)
      .post("/api/webhooks/livekit")
      .set({ Authorize: "not-a-real-token", "Content-Type": "application/webhook+json" })
      .send(body);

    expect(response.status).toBe(400);
  });

  it("ignores events for rooms with no matching call session", async () => {
    const body = JSON.stringify({ event: "room_finished", room: { name: "room-does-not-exist" } });
    const headers = await signedWebhookHeaders(body);

    const response = await request(app).post("/api/webhooks/livekit").set(headers).send(body);
    expect(response.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @madamgy/server -- webhooks-livekit`
Expected: FAIL — 404 (route doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/server/src/routes/webhooks.routes.ts
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { WebhookReceiver } from "livekit-server-sdk";
import { prisma } from "../lib/prisma.js";
import { completeCall } from "../services/call-completion.service.js";

export const webhooksRouter = Router();

const receiver = new WebhookReceiver(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!);

webhooksRouter.post("/livekit", async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  try {
    const body = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body);
    const event = await receiver.receive(body, req.get("Authorize"));

    if (event.event === "room_finished" && event.room?.name) {
      const call = await prisma.callSession.findUnique({ where: { livekitRoom: event.room.name } });
      if (call && call.status === "ACTIVE") {
        await completeCall(call.id);
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error("livekit webhook error", error);
    res.status(400).json({ message: "invalid webhook payload" });
  }
});
```

In `packages/server/src/index.ts`, add the raw-body middleware next to the existing payments-webhook one (LiveKit's `WebhookReceiver.receive` needs the exact raw body bytes to verify the signature, so it must run before the generic `express.json()` parser):

```typescript
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));
app.use("/api/webhooks/livekit", express.raw({ type: "application/webhook+json" }));
app.use(express.json({ limit: "2mb" }));
```

Add the import and route registration alongside the other routers:

```typescript
import { webhooksRouter } from "./routes/webhooks.routes.js";
...
app.use("/api/webhooks", webhooksRouter);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace @madamgy/server -- webhooks-livekit`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full server test suite to confirm no regression**

Run: `npm run test --workspace @madamgy/server`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/routes/webhooks.routes.ts packages/server/src/index.ts packages/server/src/__tests__/webhooks-livekit.test.ts
git commit -m "feat: end calls when LiveKit reports their room as finished"
```

**Deployment note (not part of this task's code, flagging so it isn't forgotten):** the LiveKit project's webhook URL needs to be configured (in its dashboard, or `livekit.yaml` for the self-hosted `docker-compose.yml` instance) to point at `POST /api/webhooks/livekit` on the deployed backend, using the same API key/secret already set as `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET`.

---

### Task 4: `GET /calls/active` — rejoin endpoint

**Files:**
- Modify: `packages/server/src/services/call-completion.service.ts:10` (export `ACTIVE_STATUSES`)
- Modify: `packages/server/src/routes/calls.routes.ts`
- Test: `packages/server/src/__tests__/calls.test.ts` (append)

**Interfaces:**
- Produces: `GET /api/calls/active` (auth required, any role) → `{ callSession: CallSession | null, livekitToken: string | null }`. `livekitToken` is populated only when the call is `ACTIVE`.
- Consumes: `ACTIVE_STATUSES` (exported by this task), `livekitService.generateToken` (existing, from Task 1's file).

- [ ] **Step 1: Write the failing test**

Append to `packages/server/src/__tests__/calls.test.ts` (it already has `patientToken`/`patientId` set up in `beforeAll` — reuse them):

```typescript
describe("GET /calls/active", () => {
  it("returns null when the patient has no in-progress call", async () => {
    const response = await request(app).get("/api/calls/active").set("Authorization", `Bearer ${patientToken}`);
    expect(response.status).toBe(200);
    expect(response.body.callSession).toBeNull();
    expect(response.body.livekitToken).toBeNull();
  });

  it("returns the call and a fresh token when the patient has an ACTIVE call", async () => {
    const doctor = await prisma.user.create({
      data: {
        phone: "9999100099",
        name: "Active Call Doctor",
        role: "DOCTOR",
        doctorProfile: { create: { degree: "MBBS", regNumber: "ACTIVE-CALL-REG-1", isApproved: true } },
      },
    });
    const call = await prisma.callSession.create({
      data: { patientId, doctorId: doctor.id, status: "ACTIVE", livekitRoom: "room-active-test", startedAt: new Date() },
    });

    const response = await request(app).get("/api/calls/active").set("Authorization", `Bearer ${patientToken}`);
    expect(response.status).toBe(200);
    expect(response.body.callSession.id).toBe(call.id);
    expect(typeof response.body.livekitToken).toBe("string");
    expect(response.body.livekitToken.length).toBeGreaterThan(20);

    await prisma.callSession.deleteMany({ where: { id: call.id } });
    await prisma.doctorProfile.deleteMany({ where: { userId: doctor.id } });
    await prisma.user.deleteMany({ where: { id: doctor.id } });
  });

  it("returns no token for a QUEUED call", async () => {
    const call = await prisma.callSession.create({
      data: { patientId, status: "QUEUED", livekitRoom: "room-queued-test" },
    });

    const response = await request(app).get("/api/calls/active").set("Authorization", `Bearer ${patientToken}`);
    expect(response.status).toBe(200);
    expect(response.body.callSession.id).toBe(call.id);
    expect(response.body.livekitToken).toBeNull();

    await prisma.callSession.deleteMany({ where: { id: call.id } });
  });

  it("requires auth", async () => {
    const response = await request(app).get("/api/calls/active");
    expect(response.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @madamgy/server -- calls`
Expected: FAIL — 404 (route doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

In `packages/server/src/services/call-completion.service.ts`, export the existing constant:

```typescript
export const ACTIVE_STATUSES = ["QUEUED", "RINGING", "ACTIVE"];
```

In `packages/server/src/routes/calls.routes.ts`, add the new route (after the existing `/history` route) and the two new imports:

```typescript
import { ACTIVE_STATUSES } from "../services/call-completion.service.js";
import { livekitService } from "../services/livekit.service.js";
```

```typescript
callsRouter.get("/active", requireAuth(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.sub;
    const role = req.user!.role;

    const where: Prisma.CallSessionWhereInput =
      role === "DOCTOR"
        ? { doctorId: userId, status: { in: ACTIVE_STATUSES } }
        : { patientId: userId, status: { in: ACTIVE_STATUSES } };

    const call = await prisma.callSession.findFirst({ where, orderBy: { createdAt: "desc" } });
    if (!call) {
      res.json({ callSession: null, livekitToken: null });
      return;
    }

    const livekitToken = call.status === "ACTIVE" ? await livekitService.generateToken(call.livekitRoom, userId) : null;
    res.json({ callSession: call, livekitToken });
  } catch (error) {
    next(error);
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace @madamgy/server -- calls`
Expected: PASS.

- [ ] **Step 5: Run the full server test suite to confirm no regression**

Run: `npm run test --workspace @madamgy/server`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/services/call-completion.service.ts packages/server/src/routes/calls.routes.ts packages/server/src/__tests__/calls.test.ts
git commit -m "feat: add GET /calls/active for rejoining an in-progress call"
```

---

### Task 5: Remove the heartbeat-based reaper (superseded by Task 3's webhook)

**Files:**
- Modify: `packages/server/src/workers/stale-call-reaper.worker.ts`
- Delete: `packages/server/src/__tests__/stale-call-reaper.test.ts`

**Interfaces:**
- Removes: `reapStaleCalls(): Promise<number>` (no longer exported or defined).
- Unaffected: `reapRingingTimeouts(): Promise<number>` and `startStaleCallReaper()` (both stay, `startStaleCallReaper` just calls one function now instead of two).

- [ ] **Step 1: Delete the now-obsolete test file**

```bash
git rm packages/server/src/__tests__/stale-call-reaper.test.ts
```

This file only tests `reapStaleCalls`, which this task deletes — there is nothing in it worth keeping (Task 3's `webhooks-livekit.test.ts` is its replacement coverage for "an ACTIVE call gets ended when nobody's left in it").

- [ ] **Step 2: Remove `reapStaleCalls` from the worker**

In `packages/server/src/workers/stale-call-reaper.worker.ts`, delete the `reapStaleCalls` function entirely and drop its now-unused imports (`redis`, `completeCall`), leaving:

```typescript
import { prisma } from "../lib/prisma.js";
import { requeueRingingCall } from "../services/call-queue.service.js";

const RING_TIMEOUT_MS = 25_000;

export async function reapRingingTimeouts(): Promise<number> {
  const stuckCalls = await prisma.callSession.findMany({
    where: { status: "RINGING", doctorId: { not: null }, ringingAt: { lt: new Date(Date.now() - RING_TIMEOUT_MS) } },
  });

  for (const call of stuckCalls) {
    await requeueRingingCall(call.id, call.doctorId!, call.patientId);
  }
  return stuckCalls.length;
}

export function startStaleCallReaper(intervalMs = 30_000): ReturnType<typeof setInterval> {
  return setInterval(() => {
    reapRingingTimeouts().catch((error: unknown) => console.error("ringing-timeout-reaper error", error));
  }, intervalMs);
}
```

- [ ] **Step 3: Run the full server test suite to confirm no regression**

Run: `npm run test --workspace @madamgy/server`
Expected: PASS (the deleted test file's cases are gone, nothing else references `reapStaleCalls`).

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck --workspace @madamgy/server`
Expected: PASS (confirms no other file imports the now-removed `reapStaleCalls`).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/workers/stale-call-reaper.worker.ts
git commit -m "refactor: remove heartbeat-based call reaper, superseded by the LiveKit webhook"
```

---

## Frontend

### Task 6: Shared `fetchActiveCall()` client + boot-time redirect for a full reload

**Files:**
- Create: `packages/web/src/lib/activeCall.ts`
- Create: `packages/web/src/hooks/useActiveCallRedirect.ts`
- Modify: `packages/web/src/components/layout/PatientShell.tsx`
- Modify: `packages/web/src/components/layout/DoctorShell.tsx`

**Interfaces:**
- Produces: `fetchActiveCall(): Promise<{ callSession: CallSession | null; livekitToken: string | null }>` — used here and reused by Tasks 7 and 8's rejoin buttons.
- Produces: `useActiveCallRedirect(): void` — a hook with no return value; call it once per shell.
- Consumes: `useCallStore` (`setCall`, `setLivekitToken`, both already defined in `packages/web/src/store/call.store.ts`), `useAuthStore` (`state.user?.role`, already defined in `packages/web/src/store/auth.store.ts`).

No backend server needed to verify this task in isolation — it's a thin client wrapper plus routing logic. Verification is by `tsc` (no test runner exists for this package) and a manual browser check described in Step 4.

- [ ] **Step 1: Create the shared fetcher**

```typescript
// packages/web/src/lib/activeCall.ts
import type { CallSession } from "@madamgy/api-client";
import { api } from "./api";

export interface ActiveCallResponse {
  callSession: CallSession | null;
  livekitToken: string | null;
}

export async function fetchActiveCall(): Promise<ActiveCallResponse> {
  const response = await api.get<ActiveCallResponse>("/calls/active");
  return response.data;
}
```

- [ ] **Step 2: Create the boot-redirect hook**

```typescript
// packages/web/src/hooks/useActiveCallRedirect.ts
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchActiveCall } from "../lib/activeCall";
import { useAuthStore } from "../store/auth.store";
import { useCallStore } from "../store/call.store";

// A full page reload wipes useCallStore (it's in-memory only), so a patient/doctor who reloads
// while they have an in-progress call lands on their normal dashboard with no way back in. This
// runs once per shell mount and, if the server still has an in-progress call for this user,
// hydrates the store and routes them straight back into it.
export function useActiveCallRedirect(): void {
  const navigate = useNavigate();
  const role = useAuthStore((state) => state.user?.role);
  const setCall = useCallStore((state) => state.setCall);
  const setLivekitToken = useCallStore((state) => state.setLivekitToken);

  useEffect(() => {
    if (role !== "PATIENT" && role !== "DOCTOR") {
      return;
    }

    fetchActiveCall()
      .then(({ callSession, livekitToken }) => {
        if (!callSession) {
          return;
        }

        setCall(callSession);
        if (livekitToken) {
          setLivekitToken(livekitToken);
        }

        navigate(role === "DOCTOR" ? `/doctor/call/${callSession.id}` : "/consult");
      })
      .catch(() => {
        // No active call, or a transient error -- stay on the current page either way.
      });
    // Intentionally runs once per shell mount, not on every role/navigate identity change --
    // this is a one-shot "did I reload into an orphaned call" check, not a poller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
```

- [ ] **Step 3: Wire it into both shells**

In `packages/web/src/components/layout/PatientShell.tsx`, add the import and call it at the top of the component body:

```typescript
import { useActiveCallRedirect } from "../../hooks/useActiveCallRedirect";
```

```typescript
export function PatientShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useActiveCallRedirect();
  ...
```

In `packages/web/src/components/layout/DoctorShell.tsx`, same pattern:

```typescript
import { useActiveCallRedirect } from "../../hooks/useActiveCallRedirect";
```

```typescript
export function DoctorShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  useActiveCallRedirect();
  ...
```

- [ ] **Step 4: Typecheck and manually verify**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: PASS.

Manual check (needs Task 4's backend endpoint deployed/running locally): start a consult as a patient, get to the ACTIVE video screen, then reload the tab. Confirm you're redirected to `/consult` with the video reconnecting rather than dropped on `/dashboard`. Repeat logged in as the doctor mid-call, reloading while on `/doctor` (not `/doctor/call/:id`) — confirm redirect to `/doctor/call/:id`.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/activeCall.ts packages/web/src/hooks/useActiveCallRedirect.ts packages/web/src/components/layout/PatientShell.tsx packages/web/src/components/layout/DoctorShell.tsx
git commit -m "feat: redirect back into an in-progress call after a full reload"
```

---

### Task 7: Patient side — stop killing the call on disconnect, add manual rejoin

**Files:**
- Modify: `packages/web/src/pages/kiosk/Consult.tsx`

**Interfaces:**
- Consumes: `fetchActiveCall()` from Task 6.

- [ ] **Step 1: Import the new dependencies**

Add to the top of `packages/web/src/pages/kiosk/Consult.tsx`:

```typescript
import { Button } from "../../components/ui/button";
import { fetchActiveCall } from "../../lib/activeCall";
```

- [ ] **Step 2: Bootstrap from an active call before creating a new one**

Replace the existing effect body (currently: if `callSession` is set, bail; otherwise define `createCallWithPayment`/`payAndCreateCall`/`startConsult` and call `startConsult()`) so it checks for an in-progress call first. Keep `createCallWithPayment`, `payAndCreateCall`, and `startConsult` exactly as they are today; only change what runs at the end of the effect:

```typescript
    async function bootstrap(): Promise<void> {
      const active = await fetchActiveCall().catch(() => ({ callSession: null, livekitToken: null }));
      if (active.callSession) {
        setCall(active.callSession);
        if (active.livekitToken) {
          setLivekitToken(active.livekitToken);
        }
        return;
      }

      await startConsult();
    }

    void bootstrap().finally(() => setLoading(false));
  }, [callSession, navigate, setCall, setLivekitToken]);
```

(This replaces the existing final line `void startConsult().finally(() => setLoading(false));` and its dependency array.)

Destructure `setLivekitToken` from the store alongside the existing `callSession, livekitToken, setCall, clearCall`:

```typescript
  const { callSession, livekitToken, setCall, setLivekitToken, clearCall } = useCallStore();
```

- [ ] **Step 3: Add rejoin state and handlers**

Add after the existing `const [loading, setLoading] = useState(!callSession);`:

```typescript
  const [connectionLost, setConnectionLost] = useState(false);
  const [rejoinKey, setRejoinKey] = useState(0);

  function handleDisconnected(): void {
    setConnectionLost(true);
  }

  async function handleRejoin(): Promise<void> {
    const active = await fetchActiveCall().catch(() => ({ callSession: null, livekitToken: null }));
    if (!active.callSession || active.callSession.status !== "ACTIVE" || !active.livekitToken) {
      toast("The call has ended");
      clearCall();
      navigate("/dashboard");
      return;
    }

    setLivekitToken(active.livekitToken);
    setConnectionLost(false);
    setRejoinKey((key) => key + 1);
  }
```

- [ ] **Step 4: Replace the disconnect-kills-the-call wiring**

The active-call render branch currently is:

```tsx
  if (livekitToken && callSession) {
    return (
      <div className="flex min-h-screen flex-col bg-background lg:flex-row">
        <div className="h-[60vh] min-h-0 lg:h-screen lg:flex-1">
          <KioskCallView
            token={livekitToken}
            serverUrl={import.meta.env.VITE_LIVEKIT_URL ?? "ws://localhost:7880"}
            onDisconnected={cancel}
          />
        </div>
        <div className="h-[40vh] p-3 lg:h-screen lg:w-96">
          <CallChatPanel callSessionId={callSession.id} />
        </div>
      </div>
    );
  }
```

Replace it with:

```tsx
  if (livekitToken && callSession) {
    return (
      <div className="flex min-h-screen flex-col bg-background lg:flex-row">
        <div className="h-[60vh] min-h-0 lg:h-screen lg:flex-1">
          {connectionLost ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 bg-background p-8 text-center">
              <p className="text-xl text-foreground">Connection lost</p>
              <p className="text-muted-foreground">The room is still open. Rejoin when you're ready.</p>
              <Button onClick={() => void handleRejoin()}>Rejoin call</Button>
            </div>
          ) : (
            <KioskCallView
              key={rejoinKey}
              token={livekitToken}
              serverUrl={import.meta.env.VITE_LIVEKIT_URL ?? "ws://localhost:7880"}
              onDisconnected={handleDisconnected}
            />
          )}
        </div>
        <div className="h-[40vh] p-3 lg:h-screen lg:w-96">
          <CallChatPanel callSessionId={callSession.id} />
        </div>
      </div>
    );
  }
```

This is the actual bug fix: `onDisconnected` no longer calls `cancel()` (which used to emit `call:end` and kill the room on any network blip). `cancel()` itself is untouched and still used by the pre-ACTIVE waiting screens' Cancel buttons.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: PASS.

- [ ] **Step 6: Manually verify in the browser**

Start a consult through to the ACTIVE video screen as a patient. Open DevTools → Network → set to "Offline" for a few seconds, then back online. Confirm: the call is NOT ended (no redirect to `/dashboard`), and if LiveKit's own reconnection doesn't recover it, a "Connection lost / Rejoin call" screen appears with a working Rejoin button that restores video.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/pages/kiosk/Consult.tsx
git commit -m "fix: network drop no longer ends the patient's call, add rejoin"
```

---

### Task 8: Doctor side — stop navigating away on disconnect, add rejoin and a "Close room" button

**Files:**
- Modify: `packages/web/src/pages/doctor/Call.tsx`

**Interfaces:**
- Consumes: `fetchActiveCall()` from Task 6.

- [ ] **Step 1: Import the new dependencies**

Add to the top of `packages/web/src/pages/doctor/Call.tsx`:

```typescript
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../components/ui/alert-dialog";
import { fetchActiveCall } from "../../lib/activeCall";
import { getSocket } from "../../lib/socket";
```

(`connectSocket` is already imported; add `getSocket` alongside it in the same `from "../../lib/socket"` import.)

- [ ] **Step 2: Destructure `setLivekitToken` and add rejoin/bootstrap state**

Change:

```typescript
  const storedLivekitToken = useCallStore((state) => state.livekitToken);
  const clearCall = useCallStore((state) => state.clearCall);
```

to:

```typescript
  const storedLivekitToken = useCallStore((state) => state.livekitToken);
  const setLivekitToken = useCallStore((state) => state.setLivekitToken);
  const clearCall = useCallStore((state) => state.clearCall);
  const [connectionLost, setConnectionLost] = useState(false);
  const [rejoinKey, setRejoinKey] = useState(0);
```

- [ ] **Step 3: Bootstrap a token on mount if one is missing (covers a reload while already on this page)**

Add a new effect near the existing `call:ended` listener effect:

```typescript
  useEffect(() => {
    if (storedLivekitToken || !callSessionId) {
      return;
    }

    fetchActiveCall()
      .then((active) => {
        if (active.callSession?.id === callSessionId && active.livekitToken) {
          setLivekitToken(active.livekitToken);
        } else {
          toast.error("This call is no longer active");
          navigate("/doctor");
        }
      })
      .catch(() => {
        toast.error("Could not reconnect to the call");
        navigate("/doctor");
      });
  }, [storedLivekitToken, callSessionId, navigate, setLivekitToken]);
```

- [ ] **Step 4: Add rejoin and close-room handlers**

```typescript
  async function handleRejoin(): Promise<void> {
    const active = await fetchActiveCall().catch(() => ({ callSession: null, livekitToken: null }));
    if (!active.callSession || active.callSession.status !== "ACTIVE" || !active.livekitToken) {
      toast("The call has ended");
      clearCall();
      navigate("/doctor");
      return;
    }

    setLivekitToken(active.livekitToken);
    setConnectionLost(false);
    setRejoinKey((key) => key + 1);
  }

  function closeRoom(): void {
    if (!callSessionId) {
      return;
    }
    getSocket().emit("call:end", { callSessionId });
  }
```

- [ ] **Step 5: Replace the disconnect-navigates-away wiring and add the Close room button**

The video area currently is:

```tsx
      <div className="h-[55vh] lg:h-[70vh]">
        <DoctorCallView
          token={storedLivekitToken}
          serverUrl={import.meta.env.VITE_LIVEKIT_URL ?? "ws://localhost:7880"}
          onDisconnected={() => navigate("/doctor")}
        />
      </div>
```

Replace it with:

```tsx
      <div className="relative h-[55vh] lg:h-[70vh]">
        <div className="absolute right-3 top-3 z-20">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                Close room
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Close this room?</AlertDialogTitle>
                <AlertDialogDescription>
                  This ends the call for the patient immediately and can't be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={closeRoom}>Close room</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        {connectionLost ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 bg-background p-8 text-center">
            <p className="text-xl text-foreground">Connection lost</p>
            <p className="text-muted-foreground">The room is still open. Rejoin when you're ready.</p>
            <Button onClick={() => void handleRejoin()}>Rejoin call</Button>
          </div>
        ) : (
          <DoctorCallView
            key={rejoinKey}
            token={storedLivekitToken}
            serverUrl={import.meta.env.VITE_LIVEKIT_URL ?? "ws://localhost:7880"}
            onDisconnected={() => setConnectionLost(true)}
          />
        )}
      </div>
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: PASS.

- [ ] **Step 7: Manually verify in the browser**

As the doctor, accept a call through to the ACTIVE video screen. Confirm the "Close room" button asks for confirmation and, once confirmed, ends the call for both sides (patient gets redirected). Separately, start a fresh call, drop the doctor's network via DevTools, confirm the doctor is NOT bounced back to `/doctor` automatically and instead can Rejoin. Reload the doctor's tab while still on `/doctor/call/:id` mid-call and confirm it reconnects instead of hanging on "Waiting for connection...".

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/pages/doctor/Call.tsx
git commit -m "feat: doctor Close room button, network drop no longer ends the call"
```

---

## Self-Review Notes

- **Spec coverage:** empty-room detection via LiveKit webhook (Task 3) / room creation with `departureTimeout` (Task 1); old reaper removed (Task 5); manual rejoin, not silent auto-retry (Tasks 7, 8's `connectionLost` UI); reload survival (Task 6, plus Tasks 7/8's mount-time bootstrap for reload-while-already-on-the-call-page); doctor-only ACTIVE-call end (Task 2); deployment dependency called out under Task 3. All five brainstorming decisions and both bug fixes from the spec are covered.
- **Corrected from the spec:** the spec's original prescription-submission section was based on a wrong assumption (thinking the call was left to expire via reaper/timeout). Re-reading `render-pdf.worker.ts` during planning showed `completeCall()` is already called there today, independent of the reaper — so no task touches prescription submission; the spec doc has already been corrected to say so.
- **Type/name consistency check:** `fetchActiveCall()` return shape (`{ callSession, livekitToken }`) is identical across Task 6's producer and Tasks 7/8's consumers. `ACTIVE_STATUSES` is exported once (Task 4) and only consumed there. `livekitService.createRoom`/`generateToken` names match between Task 1 (producer) and Tasks 3/4 (consumers of `generateToken` only — `createRoom` is only called from `call.handler.ts`, also Task 1).
