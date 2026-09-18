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
  },
});
