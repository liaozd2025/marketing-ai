import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration files share TEST_DATABASE_URL and the production-wide queue.
    // A task submitted in one file must not be claimed by another file's worker.
    fileParallelism: false,
  },
});
