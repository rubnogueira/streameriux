/**
 * macOS dev launcher. GPUIX inherits the process identity from its host, so
 * `bun --hot app.tsx` always shows "bun" in the menu bar and Bun's Dock icon.
 * Compile app.tsx into a .app bundle instead so macOS shows streameriux + icon.
 *
 * Re-run `bun run dev` after code changes. For instant hot reload at the cost of
 * the bun identity, use `bun run dev:hot`.
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { APP_NAME, compileApp, ensureBundleMetadata, RELEASE_BUNDLE_ID, ROOT } from "./lib/mac-app";
import { runCliEntry } from "./lib/entry";

const DEV_APP = join(ROOT, "dist", "streameriux.app");
const EXEC = join(DEV_APP, "Contents", "MacOS", APP_NAME);
const ENTRY = join(ROOT, "src/app/app.tsx");

export type RunDevMacDeps = {
  mkdirSync: typeof mkdirSync;
  existsSync: typeof existsSync;
  compileApp: typeof compileApp;
  ensureBundleMetadata: typeof ensureBundleMetadata;
  spawn: (command: string[], options: { cwd: string; stdio: ["inherit", "inherit", "inherit"] }) => {
    exited: Promise<number>;
  };
  log: (message: string) => void;
  error: (message: string) => void;
  exit: (code: number) => never;
  devApp: string;
  execPath: string;
  entry: string;
  root: string;
  bundleId: string;
};

export async function runDevMac(deps: RunDevMacDeps): Promise<void> {
  deps.mkdirSync(join(deps.devApp, "Contents", "MacOS"), { recursive: true });

  deps.log("Compiling streameriux for macOS dev…");
  await deps.compileApp(deps.entry, deps.execPath);

  const hasIcon = await deps.ensureBundleMetadata(deps.devApp, deps.bundleId);
  deps.log(
    `Launching ${deps.devApp}${hasIcon ? "" : " (without a custom Dock icon — QuickLook could not rasterise the SVG)"}`,
  );

  if (!deps.existsSync(deps.execPath)) {
    deps.error(`Missing ${deps.execPath} after compile.`);
    deps.exit(1);
  }

  const app = deps.spawn([deps.execPath], { cwd: deps.root, stdio: ["inherit", "inherit", "inherit"] });
  deps.exit(await app.exited);
}

export function createRunDevMacDeps(): RunDevMacDeps {
  return {
    mkdirSync,
    existsSync,
    compileApp,
    ensureBundleMetadata,
    spawn: (command, options) => Bun.spawn(command, options),
    log: (message) => console.log(message),
    error: (message) => console.error(message),
    exit: (code) => process.exit(code),
    devApp: DEV_APP,
    execPath: EXEC,
    entry: ENTRY,
    root: ROOT,
    bundleId: RELEASE_BUNDLE_ID,
  };
}

export async function main(deps: RunDevMacDeps = createRunDevMacDeps()): Promise<void> {
  await runDevMac(deps);
}

void runCliEntry(import.meta, main);
