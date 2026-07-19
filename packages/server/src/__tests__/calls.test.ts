import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../index.js";
import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";
import { signAccessToken } from "../services/auth.service.js";

let patientToken: string;
let patientId: string;

async function deleteTestPatient(): Promise<void> {
  const users = await prisma.user.findMany({ where: { phone: "9999100001" }, select: { id: true } });
  const userIds = users.map((user) => user.id);

  if (userIds.length === 0) {
    return;
  }

  const calls = await prisma.callSession.findMany({ where: { patientId: { in: userIds } }, select: { id: true } });
  const callIds = calls.map((call) => call.id);

  await prisma.prescription.deleteMany({ where: { callSessionId: { in: callIds } } });
  await prisma.chatMessage.deleteMany({ where: { callSessionId: { in: callIds } } });
  await prisma.payment.deleteMany({ where: { patientId: { in: userIds } } });
  await prisma.callSession.deleteMany({ where: { patientId: { in: userIds } } });
  await prisma.patientProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

beforeAll(async () => {
  await deleteTestPatient();
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
  await deleteTestPatient();
  await prisma.$disconnect();
  await redis.quit();
});

describe("POST /api/calls", () => {
  it("creates a call session for a patient", async () => {
    const response = await request(app).post("/api/calls").set("Authorization", `Bearer ${patientToken}`);

    expect(response.status).toBe(201);
    expect(response.body.status).toBe("QUEUED");
    expect(response.body.patientId).toBe(patientId);
  });

  it("returns 409 if patient already has an active call", async () => {
    const response = await request(app).post("/api/calls").set("Authorization", `Bearer ${patientToken}`);

    expect(response.status).toBe(409);
  });

  it("returns 401 without token", async () => {
    const response = await request(app).post("/api/calls");

    expect(response.status).toBe(401);
  });
});

describe("GET /api/calls/history", () => {
  it("returns paginated call history for the authenticated patient", async () => {
    const response = await request(app).get("/api/calls/history").set("Authorization", `Bearer ${patientToken}`);

    expect(response.status).toBe(200);
    expect(response.body.calls).toHaveLength(1);
    expect(response.body.calls[0].patientId).toBe(patientId);
    expect(response.body.total).toBe(1);
  });

  it("returns 401 without a token", async () => {
    const response = await request(app).get("/api/calls/history");

    expect(response.status).toBe(401);
  });
});

describe("POST /api/calls with REQUIRE_PAYMENT_FOR_CALLS=true", () => {
  const previousFlag = process.env.REQUIRE_PAYMENT_FOR_CALLS;

  beforeAll(async () => {
    process.env.REQUIRE_PAYMENT_FOR_CALLS = "true";
    // Earlier tests in this file leave an active call for this patient; resolve it so it
    // doesn't trip the "active call already exists" 409 check in this describe block.
    await prisma.callSession.updateMany({
      where: { patientId, status: { in: ["QUEUED", "RINGING", "ACTIVE"] } },
      data: { status: "ENDED" },
    });
  });

  afterAll(() => {
    if (previousFlag === undefined) {
      delete process.env.REQUIRE_PAYMENT_FOR_CALLS;
    } else {
      process.env.REQUIRE_PAYMENT_FOR_CALLS = previousFlag;
    }
  });

  async function createPaidPayment(): Promise<string> {
    const payment = await prisma.payment.create({
      data: {
        patientId,
        amount: "100.00",
        razorpayOrderId: `order_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        status: "PAID",
      },
    });
    return payment.id;
  }

  it("claims the payment and links it to the created call session", async () => {
    const paymentId = await createPaidPayment();

    const response = await request(app)
      .post("/api/calls")
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ paymentId });

    expect(response.status).toBe(201);
    const callId = response.body.id;

    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    expect(payment?.callSessionId).toBe(callId);

    // Free up the patient so subsequent tests aren't blocked by an "active call" 409.
    await prisma.callSession.update({ where: { id: callId }, data: { status: "ENDED" } });
  });

  it("rejects reuse of an already-claimed payment and leaves no orphan call session", async () => {
    const paymentId = await createPaidPayment();

    const first = await request(app)
      .post("/api/calls")
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ paymentId });

    expect(first.status).toBe(201);
    const firstCallId = first.body.id;

    // Resolve the first call so the "active call already exists" check doesn't short-circuit.
    await prisma.callSession.update({ where: { id: firstCallId }, data: { status: "ENDED" } });

    const second = await request(app)
      .post("/api/calls")
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ paymentId });

    expect(second.status).toBe(402);

    const orphan = await prisma.callSession.findFirst({
      where: { patientId, id: { not: firstCallId }, status: "QUEUED" },
    });
    expect(orphan).toBeNull();

    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    expect(payment?.callSessionId).toBe(firstCallId);
  });

  it("returns 402 when the payment does not exist or is not PAID", async () => {
    const response = await request(app)
      .post("/api/calls")
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ paymentId: "nonexistent-payment-id" });

    expect(response.status).toBe(402);
  });

  it("rejects an empty-string paymentId instead of silently skipping payment enforcement", async () => {
    const response = await request(app)
      .post("/api/calls")
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ paymentId: "" });

    expect(response.status).toBe(400);

    const orphan = await prisma.callSession.findFirst({ where: { patientId, status: "QUEUED" } });
    expect(orphan).toBeNull();
  });
});

describe("POST /api/calls device attribution", () => {
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
});
