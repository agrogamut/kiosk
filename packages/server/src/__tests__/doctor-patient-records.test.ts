import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../index.js";
import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";
import { signAccessToken } from "../services/auth.service.js";

let doctorId: string;
let doctorToken: string;
let seenPatientId: string;
let strangerPatientId: string;
let callId: string;

async function cleanup(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { phone: { startsWith: "999940" } },
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
  await prisma.prescription.deleteMany({ where: { callSessionId: { in: callIds } } });
  await prisma.callSession.deleteMany({ where: { id: { in: callIds } } });
  await prisma.doctorProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.patientProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

beforeAll(async () => {
  await cleanup();

  const doctor = await prisma.user.create({
    data: {
      phone: "9999400001",
      name: "Records Test Doctor",
      role: "DOCTOR",
      doctorProfile: { create: { degree: "MBBS", regNumber: "RECORDS-TEST-REG-1", isApproved: true } },
    },
  });
  doctorId = doctor.id;
  doctorToken = signAccessToken({ sub: doctor.id, role: "DOCTOR" });

  const seenPatient = await prisma.user.create({
    data: {
      phone: "9999400002",
      name: "Seen Patient",
      role: "PATIENT",
      patientProfile: { create: {} },
    },
  });
  seenPatientId = seenPatient.id;

  const strangerPatient = await prisma.user.create({
    data: {
      phone: "9999400003",
      name: "Stranger Patient",
      role: "PATIENT",
      patientProfile: { create: {} },
    },
  });
  strangerPatientId = strangerPatient.id;

  const call = await prisma.callSession.create({
    data: {
      patientId: seenPatientId,
      doctorId,
      status: "ENDED",
      livekitRoom: "room-records-test",
      startedAt: new Date(),
      endedAt: new Date(),
    },
  });
  callId = call.id;

  await prisma.healthFile.create({
    data: {
      userId: seenPatientId,
      name: "Old Lab Report.pdf",
      type: "LAB_REPORT",
      objectKey: "health-files/records-test/old-lab-report.pdf",
      sizeBytes: 1234,
    },
  });

  await prisma.prescription.create({
    data: {
      callSessionId: callId,
      patientId: seenPatientId,
      doctorId,
      content: { type: "doc", content: [] },
    },
  });
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
  await redis.quit();
});

describe("GET /api/doctor/patients/:patientId/records", () => {
  it("returns health files and prescriptions for a patient the doctor has consulted", async () => {
    const response = await request(app)
      .get(`/api/doctor/patients/${seenPatientId}/records`)
      .set("Authorization", `Bearer ${doctorToken}`);

    expect(response.status).toBe(200);
    expect(response.body.healthFiles).toHaveLength(1);
    expect(response.body.healthFiles[0].name).toBe("Old Lab Report.pdf");
    expect(response.body.healthFiles[0].url).toContain("http");
    expect(response.body.prescriptions).toHaveLength(1);
    expect(response.body.prescriptions[0].callSessionId).toBe(callId);
  });

  it("rejects a patient the doctor has never consulted", async () => {
    const response = await request(app)
      .get(`/api/doctor/patients/${strangerPatientId}/records`)
      .set("Authorization", `Bearer ${doctorToken}`);

    expect(response.status).toBe(403);
  });

  it("requires doctor authentication", async () => {
    const response = await request(app).get(`/api/doctor/patients/${seenPatientId}/records`);
    expect(response.status).toBe(401);
  });
});
