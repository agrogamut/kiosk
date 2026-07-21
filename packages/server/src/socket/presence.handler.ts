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

  await Promise.all(
    waiting.map((call) => assignDoctorQueue.add("assign", { callSessionId: call.id }, { attempts: 1 })),
  );
}
