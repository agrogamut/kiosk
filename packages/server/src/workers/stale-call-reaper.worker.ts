import { prisma } from "../lib/prisma.js";
import { requeueRingingCall } from "../services/call-queue.service.js";

const RING_TIMEOUT_MS = 25_000;

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
    reapRingingTimeouts().catch((error: unknown) => console.error("ringing-timeout-reaper error", error));
  }, intervalMs);
}
