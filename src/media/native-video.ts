// JS binding for the hardware-composited video surface (README Option A).
//
// Compiles `native/darwin/video-layer.swift` to a dylib on first use (cached in
// tmpdir, keyed by source hash) and loads it in-process via `bun:ffi`. Decoded
// BGRA frames are handed to the AVSampleBufferDisplayLayer by pointer, so the
// picture is composited by the window server instead of blitted through GPUIX —
// which removes the per-frame image churn that grows the renderer's memory.
//
// Everything degrades to a no-op off macOS or if the toolchain/FFI is missing,
// so callers can treat it as best-effort and fall back to the `<img>` path.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { prebuiltDylibPath, swiftcArgs, VIDEO_LAYER_DYLIB } from "../lib/native-prebuilt";

/** How the picture fills the player: normal (letterbox), zoomed (crop), stretch. */
export type VideoFit = "contain" | "cover" | "fill";

/** Maps a fit mode to the native `set_fit` mode integer (matches the Swift enum). */
export function videoFitMode(fit: VideoFit): number {
  return fit === "cover" ? 1 : fit === "fill" ? 2 : 0;
}

export type NativeVideo = {
  attach: () => boolean;
  detach: () => void;
  setRect: (x: number, y: number, w: number, h: number) => void;
  setHidden: (hidden: boolean) => void;
  setFit: (mode: number) => void;
  present: (bgra: Uint8Array, width: number, height: number, stride: number) => void;
  setPlaying: (playing: boolean) => void;
  debug: () => string;
};

let cached: NativeVideo | null | undefined;

export function resetNativeVideoCache(): void {
  cached = undefined;
}

/** Test hook for memoized native video loading. */
export function setNativeVideoCacheForTests(value: NativeVideo | null | undefined): void {
  cached = value;
}

export function sourcePath(moduleDir = dirname(fileURLToPath(import.meta.url))): string {
  const candidates = [
    join(moduleDir, "..", "native", "darwin", "video-layer.swift"),
    join(process.cwd(), "native", "darwin", "video-layer.swift"),
  ];
  return candidates.find((p) => existsSync(p)) ?? candidates[0]!;
}

export function compileDylib(
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
  const dir = options.tmpRoot ?? join(tmpdir(), "gpiux-video-layer");
  const dylib = join(dir, `libvideolayer-${key}.dylib`);
  if (exists(dylib)) return dylib;
  mkdir(dir, { recursive: true });
  exec("swiftc", swiftcArgs(swift, dylib, VIDEO_LAYER_DYLIB.frameworks), {
    stdio: ["ignore", "ignore", "ignore"],
  });
  return dylib;
}

export type NativeVideoSymbols = {
  gpiux_video_attach: () => number;
  gpiux_video_detach: () => void;
  gpiux_video_set_rect: (x: number, y: number, w: number, h: number) => void;
  gpiux_video_set_hidden: (hidden: number) => void;
  gpiux_video_set_fit: (mode: number) => void;
  gpiux_video_present: (bgra: Uint8Array, width: number, height: number, stride: number) => void;
  gpiux_video_set_playing: (playing: number) => void;
  gpiux_video_debug: () => string | number;
};

export type NativeVideoLoadDeps = {
  platform: NodeJS.Platform | undefined;
  hasBun: boolean;
  /** Shipped prebuilt dylib (release), or null to compile from source (dev). */
  prebuiltDylib: string | null;
  swiftPath: string;
  swiftExists: boolean;
  compile: (swift: string) => string;
  dlopen: (path: string) => { symbols: NativeVideoSymbols };
};

/** Load the native video surface, preferring the prebuilt dylib. Null if unavailable. */
export function loadNativeVideoWithDeps(deps: NativeVideoLoadDeps): NativeVideo | null {
  if (deps.platform !== "darwin") return null;
  if (!deps.hasBun) return null;

  try {
    // Prefer the shipped dylib; only compile from source when it is absent (dev).
    const dylib = deps.prebuiltDylib ?? (deps.swiftExists ? deps.compile(deps.swiftPath) : null);
    if (!dylib) return null;
    const s = deps.dlopen(dylib).symbols;
    return {
      attach: () => s.gpiux_video_attach() === 1,
      detach: () => s.gpiux_video_detach(),
      setRect: (x, y, w, h) => s.gpiux_video_set_rect(x, y, w, h),
      setHidden: (hidden) => s.gpiux_video_set_hidden(hidden ? 1 : 0),
      setFit: (mode) => s.gpiux_video_set_fit(mode),
      present: (bgra, width, height, stride) => s.gpiux_video_present(bgra, width, height, stride),
      setPlaying: (playing) => s.gpiux_video_set_playing(playing ? 1 : 0),
      debug: () => String(s.gpiux_video_debug()),
    };
  } catch {
    return null;
  }
}

/** Load the native video surface, compiling the dylib once. Null if unavailable. */
export function dlopenVideoLayer(
  path: string,
  loadFfi: () => typeof import("bun:ffi") = () => require("bun:ffi") as typeof import("bun:ffi"),
): { symbols: NativeVideoSymbols } {
  const { dlopen, FFIType } = loadFfi();
  const lib = dlopen(path, {
    gpiux_video_attach: { args: [], returns: FFIType.i32 },
    gpiux_video_detach: { args: [], returns: FFIType.void },
    gpiux_video_set_rect: {
      args: [FFIType.f64, FFIType.f64, FFIType.f64, FFIType.f64],
      returns: FFIType.void,
    },
    gpiux_video_set_hidden: { args: [FFIType.i32], returns: FFIType.void },
    gpiux_video_set_fit: { args: [FFIType.i32], returns: FFIType.void },
    gpiux_video_present: {
      args: [FFIType.ptr, FFIType.i32, FFIType.i32, FFIType.i32],
      returns: FFIType.void,
    },
    gpiux_video_set_playing: { args: [FFIType.i32], returns: FFIType.void },
    gpiux_video_debug: { args: [], returns: FFIType.cstring },
  });
  return { symbols: lib.symbols as NativeVideoSymbols };
}

export function loadNativeVideo(): NativeVideo | null {
  if (cached !== undefined) return cached;
  cached = loadNativeVideoWithDeps({
    platform: typeof process !== "undefined" ? process.platform : undefined,
    hasBun: typeof Bun !== "undefined",
    prebuiltDylib: prebuiltDylibPath(VIDEO_LAYER_DYLIB.dylib),
    swiftPath: sourcePath(),
    swiftExists: existsSync(sourcePath()),
    compile: compileDylib,
    dlopen: dlopenVideoLayer,
  });
  return cached;
}

/**
 * Whether the native video surface can run here (macOS + toolchain + FFI). The
 * user setting decides whether to actually use it; `STREAMER_NATIVE_VIDEO=0`
 * hard-disables it regardless (troubleshooting / benchmarking the `<img>` path).
 */
export function nativeVideoSupported(): boolean {
  if (process.env.STREAMER_NATIVE_VIDEO === "0") return false;
  if (process.env.VITEST === "true") return false;
  return loadNativeVideo() !== null;
}

/**
 * Keep the process running while playing so a minimized/backgrounded window
 * doesn't get App-Napped into a stall (macOS). Best-effort and independent of
 * whether the native video surface is used for display. No-op off macOS.
 */
export function setPlaybackActive(active: boolean): void {
  if (process.env.VITEST === "true") return;
  loadNativeVideo()?.setPlaying(active);
}
