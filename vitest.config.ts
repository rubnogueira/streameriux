import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    typecheck: {
      enabled: true,
      checker: "tsc",
      tsconfig: "./tsconfig.json",
    },
    fsModuleCache: true,
    fileParallelism: true,
    retry: 1,
    testTimeout: 20_000,
    setupFiles: ["./vitest.gpuix-mock.ts", "./vitest.setup.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "vitest-runner.test.ts", "scripts/**"],
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/*.d.ts",
        "**/test-fixtures/**",
        "native/**",
        "channels/**",
        "dist/**",
        "web-dist/**",
        "coverage/**",
      ],
      reporter: ["text", "json-summary", "lcov"],
      // Repo goal is 100% on all included files; raise these as coverage improves.
      thresholds: {
        lines: 96,
        statements: 93,
        branches: 84,
        functions: 93,
      },
    },
  },
});
