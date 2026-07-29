import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration files share the explicitly supplied TEST_DATABASE_URL and
    // exercise the production-wide queue. Running those files in parallel can
    // make one test worker legitimately claim another file's queued task.
    fileParallelism: false,
  },
});
