import type { Socket } from "socket.io";
import { redis } from "../lib/redis.js";
import { prisma } from "../lib/prisma.js";
import { assignDoctorQueue } from "../lib/queues.js";

const HEARTBEAT_TTL_SECONDS = 45;

// A doctor's heartbeat only gets picked up on the assign-doctor job's own retry schedule
// (every 20s, see calls.routes.ts). A patient who started searching just after that check ran
// would otherwise sit idle for up to 20s after a doctor logs in. Nudge any calls still waiting
// for a doctor the moment one comes online, instead of making them wait for the next scheduled retry.
export function registerPresenceHandlers(socket: Socket, userId: string, userRole: string): void {
  socket.on("presence:ping", () => {
    socket.emit("presence:pong");
    if (userRole === "DOCTOR") {
      void redis.set(`doctor_heartbeat:${userId}`, "1", "EX", HEARTBEAT_TTL_SECONDS);
      void nudgeWaitingCalls();
    }
  });
}

async function nudgeWaitingCalls(): Promise<void> {
  const waiting = await prisma.callSession.findMany({
    where: { status: "QUEUED", doctorId: null },
    select: { id: true },
    take: 5,
  });

  await Promise.all(waiting.map((call) => nudgeCall(call.id)));
}

async function nudgeCall(callSessionId: string): Promise<void> {
  // Every assign-doctor job for a call uses its callSessionId as the jobId (see
  // calls.routes.ts/call-queue.service.ts), so the call's real job -- almost always sitting in
  // its backoff delay between retries -- can be looked up directly and promoted to run right now.
  // That's the fix: an earlier version of this function called queue.add() with the same jobId
  // hoping BullMQ would dedup it, but a duplicate-jobId add() just returns the existing (still
  // delayed) job inertly -- it does NOT wake it up, so the nudge silently did nothing.
  const job = await assignDoctorQueue.getJob(callSessionId);
  if (job) {
    await job.promote().catch(() => {
      // Not currently delayed (already waiting/active/gone) -- nothing to promote, that's fine.
    });
    return;
  }

  // No job on record at all (shouldn't normally happen -- every QUEUED call gets one at
  // creation), so create one rather than let the call stall forever.
  await assignDoctorQueue.add(
    "assign",
    { callSessionId },
    { jobId: callSessionId, attempts: 1, removeOnComplete: true, removeOnFail: true },
  );
}
