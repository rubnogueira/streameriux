import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Creates `path` (and parents). Returns `path` as a definite string. */
export function ensureDir(path: string): string {
  mkdirSync(path, { recursive: true });
  return path;
}

/** Unique directory under the OS temp folder, created before return. */
export function testTempDir(prefix: string): string {
  return ensureDir(join(tmpdir(), `${prefix}-${Date.now()}`));
}
