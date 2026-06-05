import { randomUUID } from "crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../index.js";
import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";
import { signAccessToken } from "../services/auth.service.js";

let doctorToken: string;
let patientToken: string;
let callSessionId: string;
let doctorId: string;
let patientId: string;

beforeAll(async () => {
  await prisma.user.deleteMany({ where: { phone: { in: ["9999200001", "9999200002"] } } });
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
  await prisma.prescription.deleteMany({ where: { callSessionId } });
  await prisma.callSession.delete({ where: { id: callSessionId } });
  await prisma.doctorProfile.deleteMany({ where: { userId: doctorId } });
  await prisma.patientProfile.deleteMany({ where: { userId: patientId } });
  await prisma.user.deleteMany({ where: { id: { in: [patientId, doctorId] } } });
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
});
