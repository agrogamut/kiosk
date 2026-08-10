import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { io } from "../index.js";
import { assignDoctorQueue } from "../lib/queues.js";
import { prisma } from "../lib/prisma.js";
import { reapRingingTimeouts } from "../workers/stale-call-reaper.worker.js";

// This reaper is the only thing that ever frees a doctor whose ring went unanswered:
// assign-doctor.worker sets isAvailable=false, and completeCall/requeueRingingCall are the only
// paths back, neither of which fires while a call is still RINGING. If it stops running, the
// first unanswered call leaves that doctor unavailable forever -- and invisible in
// GET /api/doctors/available, so patients can no longer reach them at all.
describe("reapRingingTimeouts", () => {
  let patientId: string;
  // A partial unique index allows a patient only one QUEUED/RINGING/ACTIVE call at a time, and
  // the first test leaves its call QUEUED, so the second test needs a patient of its own.
  let secondPatientId: string;
  let doctorId: string;
  const callIds: string[] = [];

  function emittedEvents(): { room: string; event: string }[] {
    const events: { room: string; event: string }[] = [];
    vi.spyOn(io, "to").mockImplementation(((room: string) => ({
      emit: (event: string) => {
        events.push({ room, event });
        return true;
      },
    })) as unknown as typeof io.to);
    return events;
  }

  async function createRingingCall(ringingSecondsAgo: number, forPatientId = patientId): Promise<string> {
    const call = await prisma.callSession.create({
      data: {
        patientId: forPatientId,
        doctorId,
        status: "RINGING",
        livekitRoom: `room-reaper-${ringingSecondsAgo}-${Date.now()}`,
        ringingAt: new Date(Date.now() - ringingSecondsAgo * 1000),
      },
    });
    callIds.push(call.id);
    return call.id;
  }

  beforeAll(async () => {
    const patient = await prisma.user.create({
      data: { phone: "9999400001", name: "Reaper Patient", role: "PATIENT" },
    });
    patientId = patient.id;

    const secondPatient = await prisma.user.create({
      data: { phone: "9999400003", name: "Reaper Patient Two", role: "PATIENT" },
    });
    secondPatientId = secondPatient.id;

    const doctor = await prisma.user.create({
      data: {
        phone: "9999400002",
        name: "Reaper Doctor",
        role: "DOCTOR",
        doctorProfile: {
          create: { degree: "MBBS", regNumber: "REAPER-REG-1", isApproved: true, isAvailable: false },
        },
      },
    });
    doctorId = doctor.id;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await Promise.all(callIds.map((id) => assignDoctorQueue.remove(id)));
    await prisma.callSession.deleteMany({ where: { id: { in: callIds } } });
    await prisma.doctorProfile.deleteMany({ where: { userId: doctorId } });
    await prisma.user.deleteMany({ where: { id: { in: [patientId, secondPatientId, doctorId] } } });
  });

  it("requeues a call that rang past the timeout and makes the doctor available again", async () => {
    const events = emittedEvents();
    const callId = await createRingingCall(60);

    const reaped = await reapRingingTimeouts();
    expect(reaped).toBeGreaterThanOrEqual(1);

    const call = await prisma.callSession.findUniqueOrThrow({ where: { id: callId } });
    expect(call.status).toBe("QUEUED");
    expect(call.doctorId).toBeNull();

    const profile = await prisma.doctorProfile.findUniqueOrThrow({ where: { userId: doctorId } });
    expect(profile.isAvailable).toBe(true);

    // The doctor's dashboard is still showing an incoming-call card for a call the server would
    // now refuse to accept, so it has to be told the call is gone.
    expect(events).toContainEqual({ room: `user:${doctorId}`, event: "call:ended" });
    expect(events).toContainEqual({ room: `user:${patientId}`, event: "call:rejected" });
  });

  it("leaves a call that only just started ringing alone", async () => {
    emittedEvents();
    await prisma.doctorProfile.update({ where: { userId: doctorId }, data: { isAvailable: false } });
    const callId = await createRingingCall(2, secondPatientId);

    await reapRingingTimeouts();

    const call = await prisma.callSession.findUniqueOrThrow({ where: { id: callId } });
    expect(call.status).toBe("RINGING");
    expect(call.doctorId).toBe(doctorId);
  });
});
