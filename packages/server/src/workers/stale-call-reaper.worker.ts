import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";
import { completeCall } from "../services/call-completion.service.js";
import { requeueRingingCall } from "../services/call-queue.service.js";

const RING_TIMEOUT_MS = 25_000;

export async function reapStaleCalls(): Promise<number> {
  const activeCalls = await prisma.callSession.findMany({
    where: { status: "ACTIVE", doctorId: { not: null } },
  });

  let reaped = 0;
  for (const call of activeCalls) {
    const heartbeat = await redis.get(`doctor_heartbeat:${call.doctorId}`);
    if (!heartbeat) {
      await completeCall(call.id);
      reaped++;
    }
  }
  return reaped;
}

export async function reapRingingTimeouts(): Promise<number> {
  const stuckCalls = await prisma.callSession.findMany({
    where: { status: "RINGING", doctorId: { not: null }, ringingAt: { lt: new Date(Date.now() - RING_TIMEOUT_MS) } },
  });

  for (const call of stuckCalls) {
    await requeueRingingCall(call.id, call.doctorId!, call.patientId);
  }
  return stuckCalls.length;
}

export function startStaleCallReaper(intervalMs = 30_000): ReturnType<typeof setInterval> {
  return setInterval(() => {
    reapStaleCalls().catch((error: unknown) => console.error("stale-call-reaper error", error));
    reapRingingTimeouts().catch((error: unknown) => console.error("ringing-timeout-reaper error", error));
  }, intervalMs);
}
