import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ensureDir, testTempDir } from "./ensure-dir";

describe("ensureDir", () => {
  it("creates nested directories and returns the path", () => {
    const base = testTempDir("ensure-dir");
    const nested = ensureDir(join(base, "a", "b"));
    expect(nested).toBe(join(base, "a", "b"));
    expect(existsSync(nested)).toBe(true);
  });

  it("returns the same path when the directory already exists", () => {
    const path = testTempDir("ensure-dir-idempotent");
    expect(ensureDir(path)).toBe(path);
  });
});

describe("testTempDir", () => {
  it("returns a created directory under tmpdir", () => {
    const dir = testTempDir("prefix");
    expect(dir).toMatch(/prefix-\d+$/);
    expect(existsSync(dir)).toBe(true);
  });
});
