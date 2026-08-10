import { randomUUID } from "crypto";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../index.js";
import { prisma } from "../lib/prisma.js";
import { signAccessToken } from "../services/auth.service.js";

describe("doctor availability", () => {
  let doctorId: string;
  let doctorToken: string;
  let patientId: string;

  beforeAll(async () => {
    const doctor = await prisma.user.create({
      data: {
        phone: "9999600001",
        name: "Duty Doctor",
        role: "DOCTOR",
        doctorProfile: { create: { degree: "MBBS", regNumber: "DUTY-REG-1", isApproved: true } },
      },
    });
    doctorId = doctor.id;
    doctorToken = signAccessToken({ sub: doctorId, role: "DOCTOR" });

    const patient = await prisma.user.create({
      data: { phone: "9999600002", name: "Duty Patient", role: "PATIENT" },
    });
    patientId = patient.id;
  });

  beforeEach(async () => {
    await prisma.callSession.deleteMany({ where: { doctorId } });
    await prisma.doctorProfile.update({
      where: { userId: doctorId },
      data: { isOnDuty: true, isAvailable: true },
    });
  });

  afterAll(async () => {
    await prisma.callSession.deleteMany({ where: { doctorId } });
    await prisma.doctorProfile.deleteMany({ where: { userId: doctorId } });
    await prisma.user.deleteMany({ where: { id: { in: [doctorId, patientId] } } });
  });

  it("reports a free approved doctor as reachable", async () => {
    const response = await request(app)
      .get("/api/doctor/availability")
      .set("Authorization", `Bearer ${doctorToken}`)
      .expect(200);

    expect(response.body).toEqual({ isOnDuty: true, isInCall: false, reachable: true });
  });

  it("distinguishes being on a call from being off duty", async () => {
    // isAvailable is false for the whole of a call, so on its own it would read as "off duty"
    // to a doctor who is simply busy.
    await prisma.doctorProfile.update({ where: { userId: doctorId }, data: { isAvailable: false } });

    const response = await request(app)
      .get("/api/doctor/availability")
      .set("Authorization", `Bearer ${doctorToken}`)
      .expect(200);

    expect(response.body).toEqual({ isOnDuty: true, isInCall: true, reachable: false });
  });

  it("going off duty hides the doctor from patients without touching isAvailable", async () => {
    await request(app)
      .put("/api/doctor/availability")
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({ isOnDuty: false })
      .expect(200);

    const profile = await prisma.doctorProfile.findUniqueOrThrow({ where: { userId: doctorId } });
    expect(profile.isOnDuty).toBe(false);
    expect(profile.isAvailable).toBe(true);

    const patientToken = signAccessToken({ sub: patientId, role: "PATIENT" });
    const listed = await request(app)
      .get("/api/doctors/available")
      .set("Authorization", `Bearer ${patientToken}`)
      .expect(200);
    expect(listed.body.some((doctor: { id: string }) => doctor.id === doctorId)).toBe(false);
  });

  it("coming back on duty clears an isAvailable left stuck by an unclean call", async () => {
    // The only recovery a doctor can perform for themselves -- previously this needed a
    // database edit.
    await prisma.doctorProfile.update({
      where: { userId: doctorId },
      data: { isOnDuty: false, isAvailable: false },
    });

    const response = await request(app)
      .put("/api/doctor/availability")
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({ isOnDuty: true })
      .expect(200);

    expect(response.body).toEqual({ isOnDuty: true, isInCall: false, reachable: true });
  });

  it("does not free a doctor who is genuinely on a call", async () => {
    // Otherwise the next assignment would ring them in the middle of the consultation they are
    // already in.
    await prisma.callSession.create({
      data: {
        patientId,
        doctorId,
        status: "ACTIVE",
        livekitRoom: `duty-room-${randomUUID()}`,
        startedAt: new Date(),
      },
    });
    await prisma.doctorProfile.update({
      where: { userId: doctorId },
      data: { isOnDuty: false, isAvailable: false },
    });

    const response = await request(app)
      .put("/api/doctor/availability")
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({ isOnDuty: true })
      .expect(200);

    expect(response.body).toEqual({ isOnDuty: true, isInCall: true, reachable: false });
    const profile = await prisma.doctorProfile.findUniqueOrThrow({ where: { userId: doctorId } });
    expect(profile.isAvailable).toBe(false);
  });

  it("rejects a non-boolean value", async () => {
    await request(app)
      .put("/api/doctor/availability")
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({ isOnDuty: "yes" })
      .expect(400);
  });

  it("refuses a patient", async () => {
    const patientToken = signAccessToken({ sub: patientId, role: "PATIENT" });

    await request(app)
      .get("/api/doctor/availability")
      .set("Authorization", `Bearer ${patientToken}`)
      .expect(403);
  });
});
