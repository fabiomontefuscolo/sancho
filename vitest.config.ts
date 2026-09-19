import { defineConfig } from "vitest/config";
import { WxtVitest } from "wxt/testing";

export default defineConfig({
  plugins: await WxtVitest(),
  test: {
    environment: "node",
    environmentMatchGlobs: [["tests/component/**", "jsdom"]],
    setupFiles: ["tests/component/setup.ts"],
    include: [
      "tests/unit/**/*.test.ts",
      "tests/unit/**/*.test.mjs",
      "tests/component/**/*.test.tsx",
    ],
    coverage: {
      provider: "v8",
      include: ["src/agent/**", "src/providers/**", "src/storage/**"],
      thresholds: {
        statements: 80,
        branches: 80,
      },
    },
  },
});
