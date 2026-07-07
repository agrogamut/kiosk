import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";
import { completeCall } from "../services/call-completion.service.js";

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

export function startStaleCallReaper(intervalMs = 30_000): ReturnType<typeof setInterval> {
  return setInterval(() => {
    reapStaleCalls().catch((error: unknown) => console.error("stale-call-reaper error", error));
  }, intervalMs);
}
