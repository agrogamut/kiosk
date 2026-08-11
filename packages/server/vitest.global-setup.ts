import { existsSync } from "fs";
import { resolve } from "path";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";

const rootEnvPath = resolve(process.cwd(), "../../.env");
if (existsSync(rootEnvPath)) {
  config({ path: rootEnvPath });
}

/**
 * Closes any call session left QUEUED/RINGING/ACTIVE by a previous run.
 *
 * The e2e flow test brings a doctor online and expects the call it creates to be the one they are
 * rung for. A QUEUED row from an earlier run breaks that: presence.handler nudges every waiting
 * call the moment any doctor pings, so the older call claims the new doctor first and the test
 * times out waiting for a call:incoming that went to someone else's session. Every run leaves a
 * few such rows behind, so each local run used to poison the next one -- and only local runs,
 * since CI starts from an empty database, which is what made it look like a source change.
 */
/**
 * Clears the Redis state that outlives a run: presence heartbeats and queued assign jobs.
 *
 * A doctor heartbeat lives for 45s, which is longer than the gap between two back-to-back runs.
 * The assign worker picks the first approved, on-duty, available doctor with a live heartbeat, so
 * a doctor registered by the previous run could still look reachable and be handed the new run's
 * call -- and nothing was listening on their socket, so the call simply rang into nothing. That
 * timing dependence is why the failure came and went between otherwise identical runs.
 *
 * The auth lockout counters have the same problem for a different reason: they live for 15
 * minutes, and the phone numbers and the IP (always ::ffff:127.0.0.1 under supertest) are fixed
 * per test, so a run that spends four of five doctor-register attempts hands the next run a
 * budget of one and a 429 where it expects a 400. Pending OTPs go the same way -- a code left in
 * Redis for a phone a later run reuses is a code that run never asked for.
 *
 * Scans for specific prefixes rather than flushing: TEST_REDIS_URL falls back to the dev instance
 * when unset, and a blanket flush would then wipe real local data.
 */
async function clearStaleRedisState(url: string): Promise<void> {
  const redis = new Redis(url, { maxRetriesPerRequest: null, lazyConnect: true });
  try {
    await redis.connect();
    for (const pattern of [
      "doctor_heartbeat:*",
      "bull:assign-doctor:*",
      "*_attempts:*",
      "otp:*",
    ]) {
      let cursor = "0";
      do {
        const [next, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 200);
        cursor = next;
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } while (cursor !== "0");
    }
  } catch {
    // A test run against an unreachable Redis will fail loudly on its own; don't mask that here.
  } finally {
    redis.disconnect();
  }
}

export async function setup(): Promise<void> {
  const redisUrl = process.env.TEST_REDIS_URL ?? process.env.REDIS_URL;
  if (redisUrl) {
    await clearStaleRedisState(redisUrl);
  }

  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    return;
  }

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const { count } = await prisma.callSession.updateMany({
      where: { status: { in: ["QUEUED", "RINGING", "ACTIVE"] } },
      data: { status: "ENDED", endedAt: new Date() },
    });
    // Those calls each held a doctor unavailable; nothing would have freed them either.
    await prisma.doctorProfile.updateMany({ where: { isAvailable: false }, data: { isAvailable: true } });
    if (count > 0) {
      console.log(`[test setup] closed ${count} stale call session(s) from a previous run`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
