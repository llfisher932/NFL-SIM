import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "web/tests/**/*.test.{ts,tsx}"],
    testTimeout: 20_000,
  },
});
