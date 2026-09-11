/**
 * Compile the standalone binary for the current platform. Delegates to
 * compileApp so the `bun build --compile` flags — notably which packages stay
 * external — live in one place (COMPILE_EXTERNALS in scripts/lib/mac-app.ts)
 * instead of being duplicated in package.json.
 *
 *   bun run build   # produces dist/streameriux
 */

import { join } from "node:path";
import { runCliEntry } from "./lib/entry";
import { compileApp, ROOT } from "./lib/mac-app";

export async function main(): Promise<void> {
  await compileApp(join(ROOT, "src/app/app.tsx"), join(ROOT, "dist", "streameriux"));
}

void runCliEntry(import.meta, main);
