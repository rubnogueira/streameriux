import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { prebuiltDylibPath, swiftcArgs, WINDOW_FULLSCREEN_DYLIB } from "./native-prebuilt";

export type DarwinWindowFullscreen = {
  isFullscreen: () => boolean | null;
  setFullscreen: (on: boolean) => boolean;
};

let cached: DarwinWindowFullscreen | null | undefined;

export function resetDarwinWindowFullscreenCacheForTests(): void {
  cached = undefined;
}

export function swiftSourcePath(moduleDir = dirname(fileURLToPath(import.meta.url))): string {
  const candidates = [
    join(moduleDir, "..", "..", "native", "darwin", "window-fullscreen.swift"),
    join(process.cwd(), "native", "darwin", "window-fullscreen.swift"),
  ];
  return candidates.find((p) => existsSync(p)) ?? candidates[0]!;
}

export function compileWindowFullscreenDylib(
  swift: string,
  options: {
    readFileSync?: typeof readFileSync;
    existsSync?: typeof existsSync;
    mkdirSync?: typeof mkdirSync;
    execFileSync?: typeof execFileSync;
    tmpRoot?: string;
  } = {},
): string {
  const read = options.readFileSync ?? readFileSync;
  const exists = options.existsSync ?? existsSync;
  const mkdir = options.mkdirSync ?? mkdirSync;
  const exec = options.execFileSync ?? execFileSync;
  const source = read(swift);
  const key = createHash("sha1").update(source).digest("hex").slice(0, 16);
  const dir = options.tmpRoot ?? join(tmpdir(), "gpiux-window-fullscreen");
  const dylib = join(dir, `libwindowfullscreen-${key}.dylib`);
  if (exists(dylib)) return dylib;
  mkdir(dir, { recursive: true });
  exec("swiftc", swiftcArgs(swift, dylib, WINDOW_FULLSCREEN_DYLIB.frameworks), {
    stdio: ["ignore", "ignore", "ignore"],
  });
  return dylib;
}

type WindowFullscreenSymbols = {
  gpiux_window_is_fullscreen: () => number;
  gpiux_window_set_fullscreen: (on: number) => number;
};

export type DarwinWindowFullscreenLoadDeps = {
  platform: NodeJS.Platform | undefined;
  hasBun: boolean;
  /** Shipped prebuilt dylib (release), or null to compile from source (dev). */
  prebuiltDylib: string | null;
  swiftPath: string;
  swiftExists: boolean;
  compile: (swift: string) => string;
  dlopen: (path: string) => { symbols: WindowFullscreenSymbols };
};

function mapResult(code: number): boolean | null {
  if (code === 1) return true;
  if (code === 0) return false;
  return null;
}

export function loadDarwinWindowFullscreenWithDeps(
  deps: DarwinWindowFullscreenLoadDeps,
): DarwinWindowFullscreen | null {
  if (deps.platform !== "darwin") return null;
  if (!deps.hasBun) return null;
  if (process.env.VITEST === "true" || process.env.VITEST === "1") return null;

  try {
    // Prefer the shipped dylib; only compile from source when it is absent (dev).
    const dylib = deps.prebuiltDylib ?? (deps.swiftExists ? deps.compile(deps.swiftPath) : null);
    if (!dylib) return null;
    const s = deps.dlopen(dylib).symbols;
    return {
      isFullscreen: () => mapResult(s.gpiux_window_is_fullscreen()),
      setFullscreen: (on) => mapResult(s.gpiux_window_set_fullscreen(on ? 1 : 0)) ?? on,
    };
  } catch {
    return null;
  }
}

export function dlopenWindowFullscreen(
  path: string,
  loadFfi: () => typeof import("bun:ffi") = () => require("bun:ffi") as typeof import("bun:ffi"),
): { symbols: WindowFullscreenSymbols } {
  const { dlopen, FFIType } = loadFfi();
  const lib = dlopen(path, {
    gpiux_window_is_fullscreen: { args: [], returns: FFIType.i32 },
    gpiux_window_set_fullscreen: { args: [FFIType.i32], returns: FFIType.i32 },
  });
  return { symbols: lib.symbols as WindowFullscreenSymbols };
}

export function loadDarwinWindowFullscreen(): DarwinWindowFullscreen | null {
  if (cached !== undefined) return cached;
  cached = loadDarwinWindowFullscreenWithDeps({
    platform: typeof process !== "undefined" ? process.platform : undefined,
    hasBun: typeof Bun !== "undefined",
    prebuiltDylib: prebuiltDylibPath(WINDOW_FULLSCREEN_DYLIB.dylib),
    swiftPath: swiftSourcePath(),
    swiftExists: existsSync(swiftSourcePath()),
    compile: compileWindowFullscreenDylib,
    dlopen: dlopenWindowFullscreen,
  });
  return cached;
}
