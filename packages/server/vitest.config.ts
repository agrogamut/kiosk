import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // These are integration tests hitting a single shared Postgres/Redis instance.
    // The stale-call-reaper test scans ALL "ACTIVE" call sessions in the table
    // (by design — that's what the production reaper does), so running test files
    // in parallel lets it reap ACTIVE call sessions created by other, concurrently
    // running test files, causing cross-file flakiness. Run files sequentially.
    fileParallelism: false,
  },
});
