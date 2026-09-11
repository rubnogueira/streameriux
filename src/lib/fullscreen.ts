/**
 * Native OS fullscreen for the app window.
 *
 * GPUIX only takes `fullscreen` at window creation and exposes no runtime
 * toggle, so we drive the platform window manager directly. On macOS this uses
 * an in-process AppKit dylib (no System Events / Accessibility). Linux and
 * Windows still shell out to `wmctrl` / `xdotool` / PowerShell.
 */

import {
  loadDarwinWindowFullscreen,
  type DarwinWindowFullscreen,
} from "./darwin-window-fullscreen";

export type FullscreenSpawn = (
  command: string[],
  options: { stdout: "pipe"; stderr: "pipe" },
) => { stdout: ReadableStream | null; exited: Promise<number> };

export type FullscreenDeps = {
  platform: NodeJS.Platform;
  spawn: FullscreenSpawn;
  /** Injected in tests; defaults to the macOS AppKit dylib when available. */
  darwin?: DarwinWindowFullscreen | null;
};

async function run(deps: FullscreenDeps, command: string, args: string[]): Promise<boolean> {
  try {
    const proc = deps.spawn([command, ...args], { stdout: "pipe", stderr: "pipe" });
    return (await proc.exited) === 0;
  } catch {
    return false;
  }
}

function darwinBinding(deps: FullscreenDeps): DarwinWindowFullscreen | null {
  if (deps.platform !== "darwin") return null;
  if (deps.darwin !== undefined) return deps.darwin;
  return loadDarwinWindowFullscreen();
}

/** Read the window's current native fullscreen state, or null if unknown. */
export async function isNativeFullscreen(deps: FullscreenDeps): Promise<boolean | null> {
  const darwin = darwinBinding(deps);
  if (darwin) return darwin.isFullscreen();
  if (deps.platform === "darwin") return null;
  return null;
}

/**
 * Put the window into (or out of) native fullscreen. Idempotent: setting the
 * state it is already in is a no-op, so repeated calls never fight the window.
 * Returns whether the window is fullscreen afterwards (best effort).
 */
export async function setNativeFullscreen(deps: FullscreenDeps, on: boolean): Promise<boolean> {
  const darwin = darwinBinding(deps);
  if (darwin) return darwin.setFullscreen(on);

  if (deps.platform === "linux") {
    const state = on ? "add" : "remove";
    if (await run(deps, "wmctrl", ["-r", ":ACTIVE:", "-b", `${state},fullscreen`])) return on;
    await run(deps, "xdotool", ["getactivewindow", "key", "F11"]);
    return on;
  }

  if (deps.platform === "win32") {
    // SW_MAXIMIZE (3) / SW_RESTORE (9). Windows has no borderless-fullscreen
    // primitive here, so maximize is the closest reliable approximation.
    await run(deps, "powershell", [
      "-NoProfile",
      "-Command",
      `
      Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        public class Win {
          [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
          [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
        }
"@
      $hwnd = [Win]::GetForegroundWindow()
      [Win]::ShowWindow($hwnd, ${on ? 3 : 9})
      `,
    ]);
    return on;
  }

  return on;
}

const defaultDeps = (): FullscreenDeps => ({
  platform: process.platform,
  spawn: (command, options) => Bun.spawn(command, options),
});

export function isNativeFullscreenForProcess(): Promise<boolean | null> {
  return isNativeFullscreen(defaultDeps());
}

export function setNativeFullscreenForProcess(on: boolean): Promise<boolean> {
  return setNativeFullscreen(defaultDeps(), on);
}
