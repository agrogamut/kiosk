import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma.js";
import { completeCall } from "../services/call-completion.service.js";

describe("completeCall", () => {
  let patientId: string;
  let doctorId: string;
  let callId: string;
  let nullDoctorCallId: string | undefined;
  let concurrentCallId: string | undefined;

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
    const extraCallIds = [nullDoctorCallId, concurrentCallId].filter((id): id is string => Boolean(id));
    await prisma.walletTransaction.deleteMany({ where: { userId: doctorId } });
    await prisma.callSession.deleteMany({ where: { id: { in: [callId, ...extraCallIds] } } });
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

  it("ends a call with no assigned doctor without crashing and credits no one", async () => {
    const call = await prisma.callSession.create({
      data: {
        patientId,
        doctorId: null,
        status: "QUEUED",
        livekitRoom: "room-completion-null-doctor",
      },
    });
    nullDoctorCallId = call.id;

    await expect(completeCall(call.id)).resolves.not.toThrow();

    const updated = await prisma.callSession.findUniqueOrThrow({ where: { id: call.id } });
    expect(updated.status).toBe("ENDED");

    const transactions = await prisma.walletTransaction.findMany({ where: { callSessionId: call.id } });
    expect(transactions).toHaveLength(0);
  });

  it("credits exactly once when completeCall is invoked concurrently on the same ACTIVE call", async () => {
    const call = await prisma.callSession.create({
      data: {
        patientId,
        doctorId,
        status: "ACTIVE",
        livekitRoom: "room-completion-concurrent",
        startedAt: new Date(),
      },
    });
    concurrentCallId = call.id;

    await Promise.all([completeCall(call.id), completeCall(call.id)]);

    const updated = await prisma.callSession.findUniqueOrThrow({ where: { id: call.id } });
    expect(updated.status).toBe("ENDED");

    const transactions = await prisma.walletTransaction.findMany({
      where: { callSessionId: call.id, type: "CREDIT" },
    });
    expect(transactions).toHaveLength(1);
  });
});
