// Shared contract for the macOS Swift dylibs (native video surface + window
// fullscreen). In dev they are compiled from source with `swiftc` on first use,
// but an end user's Mac has no Swift toolchain — so the release bundle ships
// them precompiled and points this env var at the directory holding them. The
// loaders prefer a prebuilt dylib and only fall back to compiling when it is
// absent (i.e. in dev).

import { existsSync } from "node:fs";
import { join } from "node:path";

/** Launcher-exported directory (Contents/Resources/native) with the prebuilt dylibs. */
export const NATIVE_DIR_ENV = "STREAMERIUX_NATIVE_DIR";

export type NativeDylibSpec = {
  /** Source file under native/darwin/. */
  source: string;
  /** Output dylib name shipped in the bundle. */
  dylib: string;
  /** Frameworks swiftc must link. */
  frameworks: string[];
};

export const VIDEO_LAYER_DYLIB: NativeDylibSpec = {
  source: "video-layer.swift",
  dylib: "video-layer.dylib",
  frameworks: ["AppKit", "AVFoundation", "CoreVideo", "QuartzCore"],
};

export const WINDOW_FULLSCREEN_DYLIB: NativeDylibSpec = {
  source: "window-fullscreen.swift",
  dylib: "window-fullscreen.dylib",
  frameworks: ["AppKit"],
};

/** All dylibs the release build precompiles and ships. */
export const NATIVE_DYLIBS: NativeDylibSpec[] = [VIDEO_LAYER_DYLIB, WINDOW_FULLSCREEN_DYLIB];

/** swiftc argv to build `source` into `out`, linking `frameworks`. */
export function swiftcArgs(source: string, out: string, frameworks: string[]): string[] {
  return [
    "-O",
    "-swift-version",
    "5",
    "-emit-library",
    "-o",
    out,
    source,
    ...frameworks.flatMap((framework) => ["-framework", framework]),
  ];
}

/**
 * Path to a shipped prebuilt dylib, or null if none is present. Reads the
 * launcher-exported directory; returns null in dev (env unset) so the caller
 * compiles from source instead.
 */
export function prebuiltDylibPath(
  dylibName: string,
  env: NodeJS.ProcessEnv = process.env,
  exists: (path: string) => boolean = existsSync,
): string | null {
  const dir = env[NATIVE_DIR_ENV];
  if (!dir) return null;
  const path = join(dir, dylibName);
  return exists(path) ? path : null;
}
