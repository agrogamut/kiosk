import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma.js";
import { completeCall } from "../services/call-completion.service.js";

describe("completeCall", () => {
  let patientId: string;
  let doctorId: string;
  let callId: string;

  beforeAll(async () => {
    const patient = await prisma.user.create({
      data: { phone: "9999300001", name: "Completion Patient", role: "PATIENT" },
    });
    patientId = patient.id;

    const doctor = await prisma.user.create({
      data: {
        phone: "9999300002",
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
