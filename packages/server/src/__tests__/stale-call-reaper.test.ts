import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";
import { reapStaleCalls } from "../workers/stale-call-reaper.worker.js";

describe("reapStaleCalls", () => {
  let patientId: string;
  let doctorId: string;
  let callId: string;

  beforeAll(async () => {
    const patient = await prisma.user.create({
      data: { phone: "8888700001", name: "Reaper Patient", role: "PATIENT" },
    });
    patientId = patient.id;

    const doctor = await prisma.user.create({
      data: {
        phone: "8888700002",
        name: "Reaper Doctor",
        role: "DOCTOR",
        doctorProfile: { create: { degree: "MBBS", regNumber: "REAPER-REG-1", isApproved: true } },
      },
    });
    doctorId = doctor.id;

    const call = await prisma.callSession.create({
      data: { patientId, doctorId, status: "ACTIVE", livekitRoom: "room-reaper-test", startedAt: new Date() },
    });
    callId = call.id;
  });

  afterAll(async () => {
    await redis.del(`doctor_heartbeat:${doctorId}`);
    await prisma.walletTransaction.deleteMany({ where: { doctorId } });
    await prisma.callSession.deleteMany({ where: { id: callId } });
    await prisma.doctorProfile.deleteMany({ where: { userId: doctorId } });
    await prisma.user.deleteMany({ where: { id: { in: [patientId, doctorId] } } });
  });

  it("ends an ACTIVE call whose doctor has no heartbeat", async () => {
    const reaped = await reapStaleCalls();
    expect(reaped).toBeGreaterThanOrEqual(1);

    const call = await prisma.callSession.findUniqueOrThrow({ where: { id: callId } });
    expect(call.status).toBe("ENDED");
  });

  it("leaves an ACTIVE call alone if the doctor has a fresh heartbeat", async () => {
    const call2 = await prisma.callSession.create({
      data: { patientId, doctorId, status: "ACTIVE", livekitRoom: "room-reaper-test-2", startedAt: new Date() },
    });
    await redis.set(`doctor_heartbeat:${doctorId}`, "1", "EX", 45);

    await reapStaleCalls();

    const refreshed = await prisma.callSession.findUniqueOrThrow({ where: { id: call2.id } });
    expect(refreshed.status).toBe("ACTIVE");

    await prisma.callSession.deleteMany({ where: { id: call2.id } });
  });
});
