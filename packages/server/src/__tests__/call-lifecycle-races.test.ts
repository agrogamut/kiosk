import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { io } from "../index.js";
import { assignDoctorQueue } from "../lib/queues.js";
import { prisma } from "../lib/prisma.js";
import { acceptRingingCall, requeueRingingCall, restoreDoctorAvailability } from "../services/call-queue.service.js";
import { completeCall } from "../services/call-completion.service.js";
import { reapRingingTimeouts } from "../workers/stale-call-reaper.worker.js";

// Every test here is a state transition that used to be a read-then-write. Each one is reachable
// in production because two independent actors touch the same CallSession row: the doctor's
// socket, the ring-timeout reaper, the assign-doctor worker, and the patient. The symptom they
// produced together was a call session that came back to life after it had been answered -- a
// doctor being shown an "incoming call" nobody had requested, and no wallet credit for the
// consultation that had actually taken place.
describe("call lifecycle races", () => {
  let patientId: string;
  let doctorId: string;
  let otherDoctorId: string;
  const callIds: string[] = [];
  let seq = 0;

  function captureEmits(): { room: string; event: string }[] {
    const events: { room: string; event: string }[] = [];
    vi.spyOn(io, "to").mockImplementation(((room: string) => ({
      emit: (event: string) => {
        events.push({ room, event });
        return true;
      },
    })) as unknown as typeof io.to);
    return events;
  }

  async function ensureActors(): Promise<void> {
    if (patientId) {
      return;
    }
    const patient = await prisma.user.create({
      data: { phone: "9999410001", name: "Race Patient", role: "PATIENT" },
    });
    patientId = patient.id;

    const doctor = await prisma.user.create({
      data: {
        phone: "9999410002",
        name: "Race Doctor",
        role: "DOCTOR",
        doctorProfile: {
          create: { degree: "MBBS", regNumber: "RACE-REG-1", isApproved: true, isAvailable: false },
        },
      },
    });
    doctorId = doctor.id;

    const other = await prisma.user.create({
      data: {
        phone: "9999410003",
        name: "Race Doctor Two",
        role: "DOCTOR",
        doctorProfile: {
          create: { degree: "MBBS", regNumber: "RACE-REG-2", isApproved: true, isAvailable: false },
        },
      },
    });
    otherDoctorId = other.id;
  }

  async function createCall(data: {
    status: "QUEUED" | "RINGING" | "ACTIVE" | "ENDED";
    ringingSecondsAgo?: number;
    startedAt?: Date | null;
    withDoctor?: boolean;
  }): Promise<string> {
    seq += 1;
    const call = await prisma.callSession.create({
      data: {
        patientId,
        doctorId: data.withDoctor === false ? null : doctorId,
        status: data.status,
        livekitRoom: `room-race-${seq}-${Date.now()}`,
        ringingAt:
          data.ringingSecondsAgo === undefined ? null : new Date(Date.now() - data.ringingSecondsAgo * 1000),
        startedAt: data.startedAt ?? null,
      },
    });
    callIds.push(call.id);
    return call.id;
  }

  beforeEach(async () => {
    vi.restoreAllMocks();
    await ensureActors();
    // The partial unique index allows one QUEUED/RINGING/ACTIVE call per patient, so each test
    // starts from a clean slate rather than inheriting the previous test's live call.
    await prisma.walletTransaction.deleteMany({ where: { callSessionId: { in: callIds } } });
    await prisma.callSession.deleteMany({ where: { id: { in: callIds } } });
    callIds.length = 0;
    await prisma.doctorProfile.update({ where: { userId: doctorId }, data: { isAvailable: false } });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await prisma.walletTransaction.deleteMany({ where: { userId: doctorId } });
    await prisma.callSession.deleteMany({ where: { id: { in: callIds } } });
    await prisma.doctorProfile.deleteMany({ where: { userId: { in: [doctorId, otherDoctorId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [patientId, doctorId, otherDoctorId] } } });
    await assignDoctorQueue.obliterate({ force: true }).catch(() => undefined);
  });

  // The reaper selects RINGING rows older than 25s, then writes. A doctor who accepts at t=24.9s
  // wins the read and loses the write: the answered call was flipped back to QUEUED with a null
  // doctorId, re-queued for assignment, and offered to a doctor as a brand new incoming call.
  it("does not resurrect a call the doctor accepted a moment before the ring timed out", async () => {
    const callId = await createCall({ status: "RINGING", ringingSecondsAgo: 40 });
    captureEmits();

    // The reaper has already read this row as RINGING; the accept lands before it writes.
    await prisma.callSession.update({
      where: { id: callId },
      data: { status: "ACTIVE", startedAt: new Date() },
    });

    await requeueRingingCall(callId, doctorId, patientId);

    const call = await prisma.callSession.findUniqueOrThrow({ where: { id: callId } });
    expect(call.status).toBe("ACTIVE");
    expect(call.doctorId).toBe(doctorId);
  });

  it("does not resurrect a call that has already ended", async () => {
    const callId = await createCall({ status: "ENDED", startedAt: new Date() });
    captureEmits();

    await requeueRingingCall(callId, doctorId, patientId);

    const call = await prisma.callSession.findUniqueOrThrow({ where: { id: callId } });
    expect(call.status).toBe("ENDED");
  });

  // The doctor who was rung has moved on; their late reject must not yank the call away from
  // whoever the reaper has since assigned it to.
  it("ignores a reject from a doctor the call is no longer assigned to", async () => {
    const callId = await createCall({ status: "RINGING", ringingSecondsAgo: 1 });
    await prisma.callSession.update({ where: { id: callId }, data: { doctorId: otherDoctorId } });
    captureEmits();

    await requeueRingingCall(callId, doctorId, patientId);

    const call = await prisma.callSession.findUniqueOrThrow({ where: { id: callId } });
    expect(call.status).toBe("RINGING");
    expect(call.doctorId).toBe(otherDoctorId);
  });

  // Two tabs, a double tap, or a retried socket frame all deliver call:accept twice. The second
  // one used to rewrite startedAt, restarting the elapsed timer mid-consultation.
  it("accepts a ringing call exactly once", async () => {
    const callId = await createCall({ status: "RINGING", ringingSecondsAgo: 1 });
    captureEmits();

    const first = await acceptRingingCall(callId, doctorId);
    expect(first).not.toBeNull();

    const startedAt = (await prisma.callSession.findUniqueOrThrow({ where: { id: callId } })).startedAt;
    const second = await acceptRingingCall(callId, doctorId);

    expect(second).toBeNull();
    const call = await prisma.callSession.findUniqueOrThrow({ where: { id: callId } });
    expect(call.startedAt?.getTime()).toBe(startedAt?.getTime());
  });

  it("refuses an accept from a doctor the call is not assigned to", async () => {
    const callId = await createCall({ status: "RINGING", ringingSecondsAgo: 1, withDoctor: false });
    captureEmits();

    expect(await acceptRingingCall(callId, doctorId)).toBeNull();
    expect((await prisma.callSession.findUniqueOrThrow({ where: { id: callId } })).status).toBe("RINGING");
  });

  // A doctor mid-consultation has isAvailable=false. Socket.io reconnects on every network blip,
  // laptop sleep and server redeploy, and the reconnect handler used to hand them straight back
  // to the assignment pool -- which is how an incoming call arrived during a live call.
  it("keeps a doctor unavailable across a reconnect while they are on a call", async () => {
    await createCall({ status: "ACTIVE", startedAt: new Date() });

    await restoreDoctorAvailability(doctorId);

    const profile = await prisma.doctorProfile.findUniqueOrThrow({ where: { userId: doctorId } });
    expect(profile.isAvailable).toBe(false);
  });

  it("keeps a doctor unavailable across a reconnect while a call is ringing them", async () => {
    await createCall({ status: "RINGING", ringingSecondsAgo: 1 });

    await restoreDoctorAvailability(doctorId);

    const profile = await prisma.doctorProfile.findUniqueOrThrow({ where: { userId: doctorId } });
    expect(profile.isAvailable).toBe(false);
  });

  it("frees a doctor stuck unavailable with no live call", async () => {
    await createCall({ status: "ENDED", startedAt: new Date() });

    await restoreDoctorAvailability(doctorId);

    const profile = await prisma.doctorProfile.findUniqueOrThrow({ where: { userId: doctorId } });
    expect(profile.isAvailable).toBe(true);
  });

  // startedAt is the durable record that the consultation actually connected. Billing off the
  // instantaneous status meant any status churn between the consultation and the hang-up silently
  // cost the doctor their fee.
  it("credits the doctor for a call that connected, whatever the status reads at hang-up", async () => {
    const callId = await createCall({ status: "QUEUED", startedAt: new Date(Date.now() - 60_000) });
    captureEmits();

    await completeCall(callId);

    const transactions = await prisma.walletTransaction.findMany({ where: { callSessionId: callId } });
    expect(transactions).toHaveLength(1);
    expect(Number(transactions[0].amount)).toBeGreaterThan(0);
  });

  it("does not credit anyone for a call that never connected", async () => {
    const callId = await createCall({ status: "RINGING", ringingSecondsAgo: 1 });
    captureEmits();

    await completeCall(callId);

    expect(await prisma.walletTransaction.count({ where: { callSessionId: callId } })).toBe(0);
  });

  // End to end over the real reaper rather than the service it calls, since the reaper's own
  // find-then-write is where the window actually lives.
  it("leaves an accepted call alone when the reaper sweeps", async () => {
    const callId = await createCall({ status: "RINGING", ringingSecondsAgo: 40 });
    captureEmits();
    await acceptRingingCall(callId, doctorId);

    await reapRingingTimeouts();

    const call = await prisma.callSession.findUniqueOrThrow({ where: { id: callId } });
    expect(call.status).toBe("ACTIVE");
  });
});
