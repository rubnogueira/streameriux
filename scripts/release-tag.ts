/**
 * Create git tag v<package.json version> and push it to origin to trigger the
 * Release GitHub Actions workflow.
 *
 *   bun run release:tag
 *   bun run release:tag -- --dry-run
 */

import { APP_VERSION } from "../src/version";
import { ROOT } from "./lib/mac-app";
import { runCliEntry } from "./lib/entry";
import {
  ReleaseTagError,
  parseReleaseTagCliArgv,
  tagAndPushRelease,
  type GitRun,
} from "./lib/release-tag";

export const gitRunForRelease: GitRun = async (args) => {
  const proc = Bun.spawn(["git", ...args], {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { exitCode: await proc.exited, stdout, stderr };
};

export type RunReleaseTagDeps = {
  argv: string[];
  version: string;
  git: GitRun;
  log: (message: string) => void;
  error: (message: string) => void;
  exit: (code: number) => never;
};

export async function runReleaseTag(deps: RunReleaseTagDeps): Promise<void> {
  const parsed = parseReleaseTagCliArgv(deps.argv, deps.version);
  if (!parsed.ok) {
    if (parsed.kind === "help") {
      deps.log(parsed.text);
      deps.exit(0);
    }
    deps.error(`Unknown argument: ${parsed.arg}`);
    deps.exit(1);
  }

  const { dryRun, allowDirty } = parsed.args;

  try {
    const result = await tagAndPushRelease({
      version: deps.version,
      git: deps.git,
      dryRun,
      allowDirty,
    });
    if (dryRun) {
      deps.log(`dry-run: would tag v${deps.version.trim()} as ${result.tag} and push to origin`);
    } else {
      deps.log(
        `Tagged and pushed ${result.tag}. The Release workflow should start on GitHub Actions.`,
      );
    }
  } catch (error) {
    const message = error instanceof ReleaseTagError ? error.message : String(error);
    deps.error(message);
    deps.exit(1);
  }
}

export function createRunReleaseTagDeps(): RunReleaseTagDeps {
  return {
    argv: process.argv.slice(2),
    version: APP_VERSION,
    git: gitRunForRelease,
    log: (message) => console.log(message),
    error: (message) => console.error(message),
    exit: (code) => process.exit(code),
  };
}

export async function main(deps: RunReleaseTagDeps = createRunReleaseTagDeps()): Promise<void> {
  await runReleaseTag(deps);
}

void runCliEntry(import.meta, main);
