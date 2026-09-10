import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runCliEntry } from "./lib/entry";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INHERIT: ["inherit", "inherit", "inherit"] = ["inherit", "inherit", "inherit"];

export type DevSpawn = (
  command: string[],
  options: { cwd: string; stdio: typeof INHERIT },
) => { exited: Promise<number> };

export type RunDevDeps = {
  platform: NodeJS.Platform;
  root: string;
  spawn: DevSpawn;
  exit: (code: number) => never;
};

export async function runDev(deps: RunDevDeps): Promise<void> {
  if (deps.platform === "darwin") {
    const proc = deps.spawn(["bun", join(deps.root, "scripts/dev-mac.ts")], {
      cwd: deps.root,
      stdio: INHERIT,
    });
    deps.exit(await proc.exited);
  } else {
    const proc = deps.spawn(["bun", "--hot", join(deps.root, "src/app/app.tsx")], {
      cwd: deps.root,
      stdio: INHERIT,
    });
    deps.exit(await proc.exited);
  }
}

export function createRunDevDeps(): RunDevDeps {
  return {
    platform: process.platform,
    root: ROOT,
    spawn: (command, options) => Bun.spawn(command, options),
    exit: (code) => process.exit(code),
  };
}

export async function main(deps: RunDevDeps = createRunDevDeps()): Promise<void> {
  await runDev(deps);
}

void runCliEntry(import.meta, main);
