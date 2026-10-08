import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**"],
    // DB-backed test files share one Postgres database and each truncates
    // it in beforeEach; running files in parallel lets one file's truncate
    // wipe rows another file's test is mid-way through using. Serialize
    // instead of building per-file DB isolation — simplest fix for this
    // suite's size.
    fileParallelism: false,
    // Production polls slowly and relies on LISTEN/NOTIFY to wake workers;
    // tests build their own PgBoss without the listener, so poll quickly.
    env: {
      QUEUE_FAST_POLL_SECONDS: "1",
      QUEUE_FAST_NOTIFY_POLL_SECONDS: "1",
      QUEUE_BACKGROUND_POLL_SECONDS: "1",
      QUEUE_BACKGROUND_NOTIFY_POLL_SECONDS: "1",
    },
  },
});
