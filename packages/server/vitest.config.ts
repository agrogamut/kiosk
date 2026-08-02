import { existsSync } from "fs";
import { resolve } from "path";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";

// Load root .env so TEST_DATABASE_URL/TEST_REDIS_URL are available below. Doesn't touch
// process.env.DATABASE_URL/REDIS_URL themselves -- those are only set (further down) inside
// `test.env`, which vitest applies before any test file's module graph imports run, so
// src/config/env.ts's dotenv.config() (which never overwrites an already-set var) sees the
// test values and leaves them alone.
const rootEnvPath = resolve(process.cwd(), "../../.env");
if (existsSync(rootEnvPath)) {
  config({ path: rootEnvPath });
}

export default defineConfig({
  test: {
    // These are integration tests hitting a real Postgres/Redis instance -- but a dedicated
    // madamgy_test database and redis db index (TEST_DATABASE_URL/TEST_REDIS_URL, see
    // scripts/create-test-db.fish), never the dev instance. Falls back to the dev URLs if the
    // TEST_* vars aren't set, so tests still run on a fresh checkout -- just unisolated.
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
      REDIS_URL: process.env.TEST_REDIS_URL ?? process.env.REDIS_URL ?? "",
    },
    // The stale-call-reaper test scans ALL "ACTIVE" call sessions in the table
    // (by design — that's what the production reaper does), so running test files
    // in parallel lets it reap ACTIVE call sessions created by other, concurrently
    // running test files, causing cross-file flakiness. Run files sequentially.
    fileParallelism: false,
  },
});
