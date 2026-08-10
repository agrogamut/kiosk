import type { CallSession } from "@prisma/client";
import { assignDoctorQueue } from "../lib/queues.js";
import { prisma } from "../lib/prisma.js";
import { io } from "../index.js";

/** How long a call may ring unanswered before the reaper hands it back to the queue. */
export const RING_TIMEOUT_MS = 25_000;

/**
 * How long a call may stay ACTIVE before it is treated as abandoned rather than in progress.
 *
 * Nothing else bounds an ACTIVE call. The LiveKit webhook that would report both participants
 * leaving is not registered, and a browser that dies without firing call:end leaves the row ACTIVE
 * forever -- which, now that a live call correctly makes its doctor unavailable, would strand that
 * doctor permanently. Deliberately generous: it is a backstop for a dead call, not a consultation
 * time limit.
 */
export const MAX_CALL_MS = 2 * 60 * 60 * 1000;

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
 * Whether this doctor has a call genuinely in flight, and so must not be handed another.
 *
 * Freshness is the point. "Any RINGING or ACTIVE row" is the obvious reading and it is wrong: a
 * call that outlived its ring timeout is already on its way back to the queue, and one ACTIVE past
 * MAX_CALL_MS is a row nobody ever closed. Counting those as busy makes a doctor permanently
 * unassignable, because every route back to available -- socket reconnect, the on-duty toggle --
 * asks this same question, so a single stale row silently takes a doctor out of service with
 * nothing in the UI to explain it.
 */
export async function findLiveCallForDoctor(doctorId: string): Promise<{ id: string } | null> {
  const now = Date.now();
  return prisma.callSession.findFirst({
    where: {
      doctorId,
      OR: [
        { status: "RINGING", ringingAt: { gt: new Date(now - RING_TIMEOUT_MS) } },
        { status: "ACTIVE", startedAt: { gt: new Date(now - MAX_CALL_MS) } },
      ],
    },
    select: { id: true },
  });
}

/**
 * Restores a doctor's availability after their socket reconnects.
 *
 * The disconnect handler marks a doctor unavailable, and nothing used to reverse that, so any
 * doctor who lost their connection stayed permanently unassignable. The naive reverse -- mark
 * every reconnecting doctor available -- is worse: a doctor mid-consultation is unavailable by
 * design, and socket.io reconnects on every network blip, laptop sleep and server redeploy, so
 * that put them back in the assignment pool during their own call and rang them for a second one.
 * Only free a doctor who has no live call of their own.
 */
export async function restoreDoctorAvailability(doctorId: string): Promise<void> {
  if (await findLiveCallForDoctor(doctorId)) {
    return;
  }

  await prisma.doctorProfile.updateMany({
    where: { userId: doctorId, isAvailable: false },
    data: { isAvailable: true },
  });
}
