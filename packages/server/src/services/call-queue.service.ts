import type { CallSession } from "@prisma/client";
import { assignDoctorQueue } from "../lib/queues.js";
import { prisma } from "../lib/prisma.js";
import { io } from "../index.js";

// A call in one of these statuses belongs to its doctor: they are either being rung or already
// consulting, and either way they must not be handed a second call.
const DOCTOR_BUSY_STATUSES = ["RINGING", "ACTIVE"] as const;

/**
 * Hands a call back to the queue after its doctor rejected it or let it ring out.
 *
 * The status guard is the whole point. Two actors reach this: the reject handler and the
 * ring-timeout reaper, and both of them read the call before they write it. The reaper selects
 * RINGING rows whose ringingAt is older than the timeout and then requeues them one at a time, so
 * a doctor who accepts a moment before that write lands used to have their answered call flipped
 * back to QUEUED with a null doctorId -- re-queued for assignment and offered to a doctor as an
 * incoming call nobody had requested, while both parties sat in the LiveKit room believing they
 * were connected. Ending that call then credited no one, because it was no longer ACTIVE.
 *
 * Writing through updateMany with the expected status and doctorId in the WHERE clause makes the
 * transition a compare-and-set: whoever reads a stale row simply loses and changes nothing.
 *
 * @returns whether this call was actually requeued.
 */
export async function requeueRingingCall(
  callSessionId: string,
  doctorId: string,
  patientId: string,
): Promise<boolean> {
  const requeued = await prisma.callSession.updateMany({
    where: { id: callSessionId, status: "RINGING", doctorId },
    data: { doctorId: null, status: "QUEUED", ringingAt: null },
  });
  if (requeued.count === 0) {
    return false;
  }

  // Scoped to isAvailable: false so this can only ever undo the claim the assign worker made for
  // this ring, never overwrite a fresh claim for some other call.
  await prisma.doctorProfile.updateMany({
    where: { userId: doctorId, isAvailable: false },
    data: { isAvailable: true },
  });

  io.to(`user:${patientId}`).emit("call:rejected", { callSessionId });
  // The doctor is losing this call -- either they never answered and the ring timed out, or they
  // rejected it. Their dashboard is still showing the incoming-call card, and accepting it now
  // would be refused by the server since the call is back to QUEUED, so tell them it's gone.
  io.to(`user:${doctorId}`).emit("call:ended", { callSessionId });
  await assignDoctorQueue.add(
    "assign",
    { callSessionId, excludedDoctorIds: [doctorId] },
    {
      // Reuses the callSessionId as the jobId (see calls.routes.ts/presence.handler.ts) so a
      // stray nudge can't create a rival job for this new round. removeOnComplete/removeOnFail
      // are what make that reuse actually work across rounds: BullMQ keeps a finished job's key
      // in Redis forever otherwise, which would make this add() silently no-op as a "duplicate"
      // against the round that already finished.
      jobId: callSessionId,
      attempts: 1,
      backoff: { type: "fixed", delay: 5_000 },
      removeOnComplete: true,
      removeOnFail: true,
    },
  );

  return true;
}

/**
 * Moves a ringing call to ACTIVE for the doctor it was assigned to.
 *
 * Also a compare-and-set, for the same reason: call:accept can arrive twice from one doctor (two
 * tabs, a double tap, a socket frame redelivered after a reconnect), and the second one used to
 * rewrite startedAt -- restarting the elapsed timer mid-consultation and re-issuing tokens for a
 * call already in progress. Only the transition out of RINGING may set startedAt.
 *
 * @returns the call as it was before acceptance, or null if this accept did not win.
 */
export async function acceptRingingCall(callSessionId: string, doctorId: string): Promise<CallSession | null> {
  const call = await prisma.callSession.findUnique({ where: { id: callSessionId } });
  if (!call || call.doctorId !== doctorId || call.status !== "RINGING") {
    return null;
  }

  const claimed = await prisma.callSession.updateMany({
    where: { id: callSessionId, status: "RINGING", doctorId },
    data: { status: "ACTIVE", startedAt: new Date() },
  });
  if (claimed.count === 0) {
    return null;
  }

  return call;
}

/**
 * Restores a doctor's availability after their socket reconnects.
 *
 * The disconnect handler marks a doctor unavailable, and nothing used to reverse that, so any
 * doctor who lost their connection stayed permanently unassignable. The naive reverse -- mark
 * every reconnecting doctor available -- is worse: a doctor mid-consultation is unavailable by
 * design, and socket.io reconnects on every network blip, laptop sleep and server redeploy, so
 * that put them back in the assignment pool during their own call and rang them for a second one.
 * Only free a doctor who has no call of their own in flight.
 */
export async function restoreDoctorAvailability(doctorId: string): Promise<void> {
  const busy = await prisma.callSession.findFirst({
    where: { doctorId, status: { in: [...DOCTOR_BUSY_STATUSES] } },
    select: { id: true },
  });
  if (busy) {
    return;
  }

  await prisma.doctorProfile.updateMany({
    where: { userId: doctorId, isAvailable: false },
    data: { isAvailable: true },
  });
}
