import { afterEach, describe, expect, it } from "vitest";
import { redis } from "../lib/redis.js";
import { checkAttemptLimit, clearAttempts, recordFailedAttempt } from "../lib/rate-limit.js";

describe("rate-limit", () => {
  const key = "test_attempts:9999999999";

  afterEach(async () => {
    await redis.del(key);
  });

  it("allows attempts under the limit", async () => {
    await expect(checkAttemptLimit(key)).resolves.toBeUndefined();
  });

  it("throws 429 after 5 failed attempts", async () => {
    for (let i = 0; i < 5; i++) {
      await recordFailedAttempt(key);
    }
    await expect(checkAttemptLimit(key)).rejects.toMatchObject({ statusCode: 429 });
  });

  it("clearAttempts resets the counter", async () => {
    for (let i = 0; i < 5; i++) {
      await recordFailedAttempt(key);
    }
    await clearAttempts(key);
    await expect(checkAttemptLimit(key)).resolves.toBeUndefined();
  });
});
