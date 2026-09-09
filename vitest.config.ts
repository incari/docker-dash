import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Backend only; the frontend has its own vitest config under frontend/.
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
