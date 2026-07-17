import { randomUUID } from "crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../index.js";
import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";
import { signAccessToken } from "../services/auth.service.js";

let doctorToken: string;
let patientToken: string;
let otherPatientToken: string;
let callSessionId: string;
let doctorId: string;
let patientId: string;
let prescriptionId: string;

async function deletePrescriptionTestUsers(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { phone: { startsWith: "999920" } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);

  if (userIds.length === 0) {
    return;
  }

  const calls = await prisma.callSession.findMany({
    where: { OR: [{ patientId: { in: userIds } }, { doctorId: { in: userIds } }] },
    select: { id: true },
  });
  const callIds = calls.map((call) => call.id);

  await prisma.healthFile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.prescription.deleteMany({
    where: {
      OR: [{ patientId: { in: userIds } }, { doctorId: { in: userIds } }, { callSessionId: { in: callIds } }],
    },
  });
  await prisma.chatMessage.deleteMany({ where: { callSessionId: { in: callIds } } });
  await prisma.callSession.deleteMany({
    where: { OR: [{ patientId: { in: userIds } }, { doctorId: { in: userIds } }] },
  });
  await prisma.doctorProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.patientProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.walletTransaction.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.healthFile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

beforeAll(async () => {
  await deletePrescriptionTestUsers();
  const patient = await prisma.user.create({
    data: { phone: "9999200001", name: "Rx Patient", role: "PATIENT", pinHash: "x", patientProfile: { create: {} } },
  });
  patientId = patient.id;
  patientToken = signAccessToken({ sub: patient.id, role: "PATIENT" });

  const otherPatient = await prisma.user.create({
    data: { phone: "9999200003", name: "Other Rx Patient", role: "PATIENT", pinHash: "x", patientProfile: { create: {} } },
  });
  otherPatientToken = signAccessToken({ sub: otherPatient.id, role: "PATIENT" });

  const doctor = await prisma.user.create({
    data: {
      phone: "9999200002",
      name: "Rx Doctor",
      role: "DOCTOR",
      passwordHash: "x",
      doctorProfile: { create: { degree: "MBBS", regNumber: `TEST-${randomUUID()}`, isApproved: true } },
    },
  });
  doctorId = doctor.id;
  doctorToken = signAccessToken({ sub: doctor.id, role: "DOCTOR" });

  const call = await prisma.callSession.create({
    data: { patientId, doctorId, status: "ACTIVE", livekitRoom: `test-room-rx-${randomUUID()}`, startedAt: new Date() },
  });
  callSessionId = call.id;
});

afterAll(async () => {
  await deletePrescriptionTestUsers();
  await prisma.$disconnect();
  await redis.quit();
});

describe("POST /api/prescriptions", () => {
  it("doctor submits prescription", async () => {
    const response = await request(app)
      .post("/api/prescriptions")
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({
        callSessionId,
        content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Rest and fluids" }] }] },
      });

    expect(response.status).toBe(202);
    expect(response.body.id).toBeTruthy();
    prescriptionId = response.body.id as string;
  });

  it("rejects duplicate prescription", async () => {
    const response = await request(app)
      .post("/api/prescriptions")
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({ callSessionId, content: { type: "doc" } });

    expect(response.status).toBe(409);
  });

  it("patient cannot submit prescription", async () => {
    const response = await request(app)
      .post("/api/prescriptions")
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ callSessionId, content: {} });

    expect(response.status).toBe(403);
  });

  it("rejects prescriptions for missing or inactive calls", async () => {
    const missingCall = await request(app)
      .post("/api/prescriptions")
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({ callSessionId: randomUUID(), content: { type: "doc" } });
    const inactiveCall = await prisma.callSession.create({
      data: {
        patientId,
        doctorId,
        status: "ENDED",
        livekitRoom: `inactive-rx-${randomUUID()}`,
        startedAt: new Date(),
        endedAt: new Date(),
      },
    });
    const inactive = await request(app)
      .post("/api/prescriptions")
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({ callSessionId: inactiveCall.id, content: { type: "doc" } });

    expect(missingCall.status).toBe(404);
    expect(inactive.status).toBe(400);
  });
});

describe("GET /api/prescriptions/:id", () => {
  it("returns a prescription for the assigned doctor and patient", async () => {
    const doctorResponse = await request(app)
      .get(`/api/prescriptions/${prescriptionId}`)
      .set("Authorization", `Bearer ${doctorToken}`);
    const patientResponse = await request(app)
      .get(`/api/prescriptions/${prescriptionId}`)
      .set("Authorization", `Bearer ${patientToken}`);

    expect(doctorResponse.status).toBe(200);
    expect(doctorResponse.body.id).toBe(prescriptionId);
    expect(patientResponse.status).toBe(200);
    expect(patientResponse.body.id).toBe(prescriptionId);
  });

  it("rejects unrelated users and missing prescriptions", async () => {
    const forbidden = await request(app)
      .get(`/api/prescriptions/${prescriptionId}`)
      .set("Authorization", `Bearer ${otherPatientToken}`);
    const missing = await request(app).get(`/api/prescriptions/${randomUUID()}`).set("Authorization", `Bearer ${doctorToken}`);

    expect(forbidden.status).toBe(403);
    expect(missing.status).toBe(404);
  });
});
