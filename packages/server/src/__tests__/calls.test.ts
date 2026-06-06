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
