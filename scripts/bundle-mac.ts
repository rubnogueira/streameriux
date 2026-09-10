/**
 * Package the compiled binary into `dist/streameriux.app` so macOS gives it a real
 * name and Dock icon (a bare `bun`/binary process cannot set either at runtime).
 *
 *   bun run build          # produces dist/streameriux
 *   bun run bundle:mac     # wraps it into dist/streameriux.app
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { APP_NAME, ROOT, writeReleaseBundle } from "./lib/mac-app";
import { runCliEntry } from "./lib/entry";

const dist = join(ROOT, "dist");
const binary = join(dist, "streameriux");
const app = join(dist, `${APP_NAME}.app`);

export type BundleMacDeps = {
  platform: NodeJS.Platform;
  existsSync: (path: string) => boolean;
  writeReleaseBundle: (appPath: string, binaryPath: string) => Promise<boolean>;
  log: (message: string) => void;
  error: (message: string) => void;
  exit: (code: number) => never;
};

export async function runBundleMac(deps: BundleMacDeps): Promise<void> {
  if (deps.platform !== "darwin") {
    deps.error("bundle:mac only runs on macOS.");
    deps.exit(1);
  }
  if (!deps.existsSync(binary)) {
    deps.error(`Missing ${binary}. Run \`bun run build\` first.`);
    deps.exit(1);
  }

  const hasIcon = await deps.writeReleaseBundle(app, binary);
  deps.log(
    `bundle:mac wrote ${app}${hasIcon ? "" : " (without a custom icon — QuickLook could not rasterise the SVG)"}`,
  );
}

export function createBundleMacDeps(): BundleMacDeps {
  return {
    platform: process.platform,
    existsSync,
    writeReleaseBundle,
    log: (message) => console.log(message),
    error: (message) => console.error(message),
    exit: (code) => process.exit(code),
  };
}

export async function main(deps: BundleMacDeps = createBundleMacDeps()): Promise<void> {
  await runBundleMac(deps);
}

void runCliEntry(import.meta, main);
