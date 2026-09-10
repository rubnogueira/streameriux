import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runCliEntry } from "./lib/entry";

export type CompileRunner = (
  args: string[],
  cwd: string,
) => Promise<{ exitCode: number; stderr: string }>;

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

export async function runCompileCheck(runner: CompileRunner, root = projectRoot): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "streameriux-compile-"));
  const outfile = join(dir, "streameriux-check");
  try {
    const { exitCode, stderr } = await runner(
      [
        "bun",
        "build",
        "--compile",
        "--external",
        "web-audio-api",
        join(root, "src/app/app.tsx"),
        "--outfile",
        outfile,
      ],
      root,
    );
    if (exitCode !== 0) {
      throw new Error(stderr.trim() || `compile check failed (exit ${exitCode})`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function defaultCompileRunner(
  args: string[],
  cwd: string,
): Promise<{ exitCode: number; stderr: string }> {
  const proc = Bun.spawn(args, { cwd, stdout: "ignore", stderr: "pipe" });
  const stderr = proc.stderr ? await new Response(proc.stderr).text() : "";
  return { exitCode: await proc.exited, stderr };
}

export async function main(runner: CompileRunner = defaultCompileRunner): Promise<void> {
  await runCompileCheck(runner);
}

void runCliEntry(import.meta, main);
