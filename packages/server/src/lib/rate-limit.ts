import { redis } from "./redis.js";
import { AppError } from "../middleware/error.middleware.js";

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 900;

export async function checkAttemptLimit(key: string): Promise<void> {
  const attempts = await redis.get(key);
  if (attempts && Number(attempts) >= MAX_ATTEMPTS) {
    throw new AppError(429, "Too many attempts. Try again in 15 minutes.");
  }
}

export async function recordFailedAttempt(key: string): Promise<void> {
  await redis.incr(key);
  await redis.expire(key, LOCKOUT_SECONDS);
}

export async function clearAttempts(key: string): Promise<void> {
  await redis.del(key);
}
