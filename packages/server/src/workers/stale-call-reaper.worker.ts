import { prisma } from "../lib/prisma.js";
import { completeCall } from "../services/call-completion.service.js";
import { MAX_CALL_MS, RING_TIMEOUT_MS, requeueRingingCall } from "../services/call-queue.service.js";

export async function reapRingingTimeouts(): Promise<number> {
  const stuckCalls = await prisma.callSession.findMany({
    where: { status: "RINGING", doctorId: { not: null }, ringingAt: { lt: new Date(Date.now() - RING_TIMEOUT_MS) } },
  });

  for (const call of stuckCalls) {
    await requeueRingingCall(call.id, call.doctorId!, call.patientId);
  }
  return stuckCalls.length;
}

/**
 * Closes calls left ACTIVE by a client that died without ending them.
 *
 * Nothing else ever finished these. call:end only fires from a live browser, and the LiveKit
 * webhook that would report an empty room is not registered, so an ACTIVE row outlived every
 * process that knew about it -- and stranded its doctor, since a doctor is unavailable for the
 * whole of a live call and every path back to available refuses to free a doctor who has one.
 *
 * completeCall is the right tool rather than a bare status write: it credits the consultation
 * (startedAt is set, so it genuinely happened), frees the doctor, and tears down the LiveKit room.
 */
export async function reapStuckActiveCalls(): Promise<number> {
  const abandoned = await prisma.callSession.findMany({
    where: { status: "ACTIVE", startedAt: { lt: new Date(Date.now() - MAX_CALL_MS) } },
    select: { id: true },
  });

  for (const call of abandoned) {
    await completeCall(call.id);
  }
  return abandoned.length;
}

export function startStaleCallReaper(intervalMs = 30_000): ReturnType<typeof setInterval> {
  return setInterval(() => {
    reapRingingTimeouts().catch((error: unknown) => console.error("ringing-timeout-reaper error", error));
    reapStuckActiveCalls().catch((error: unknown) => console.error("stuck-active-call-reaper error", error));
  }, intervalMs);
}
