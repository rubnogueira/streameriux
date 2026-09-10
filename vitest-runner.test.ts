import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";

const root = join(dirname(fileURLToPath(import.meta.url)));

describe("vitest", () => {
  test(
    "project suite",
    () => {
      const result = spawnSync("bun", ["run", "test"], {
        cwd: root,
        stdio: "inherit",
        env: process.env,
      });
      expect(result.status).toBe(0);
    },
    { timeout: 300_000 },
  );
});
