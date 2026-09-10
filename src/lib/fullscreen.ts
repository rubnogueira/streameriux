/**
 * Native OS fullscreen for the app window.
 *
 * GPUIX only takes `fullscreen` at window creation and exposes no runtime
 * toggle, so we drive the platform window manager directly. Everything targets
 * *this* process by pid — never "the frontmost app" — so a background window or
 * a different foreground app can never be flipped by accident, and the app's
 * own fullscreen state stays in sync with the real window.
 */

export type FullscreenSpawn = (
  command: string[],
  options: { stdout: "pipe"; stderr: "pipe" },
) => { stdout: ReadableStream | null; exited: Promise<number> };

export type FullscreenDeps = {
  platform: NodeJS.Platform;
  pid: number;
  spawn: FullscreenSpawn;
};

async function run(deps: FullscreenDeps, command: string, args: string[]): Promise<boolean> {
  try {
    const proc = deps.spawn([command, ...args], { stdout: "pipe", stderr: "pipe" });
    return (await proc.exited) === 0;
  } catch {
    return false;
  }
}

async function output(deps: FullscreenDeps, command: string, args: string[]): Promise<string | null> {
  try {
    const proc = deps.spawn([command, ...args], { stdout: "pipe", stderr: "pipe" });
    const text = proc.stdout ? (await new Response(proc.stdout).text()).trim() : "";
    return (await proc.exited) === 0 ? text : null;
  } catch {
    return null;
  }
}

function ownProcess(pid: number): string {
  return `first process whose unix id is ${pid}`;
}

/** Read the window's current native fullscreen state, or null if unknown. */
export async function isNativeFullscreen(deps: FullscreenDeps): Promise<boolean | null> {
  if (deps.platform !== "darwin") return null;
  const value = await output(deps, "osascript", [
    "-e",
    `tell application "System Events" to tell (${ownProcess(deps.pid)})
      try
        return value of attribute "AXFullScreen" of window 1
      on error
        return "missing"
      end try
    end tell`,
  ]);
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

/**
 * Put the window into (or out of) native fullscreen. Idempotent: setting the
 * state it is already in is a no-op, so repeated calls never fight the window.
 * Returns whether the window is fullscreen afterwards (best effort).
 */
export async function setNativeFullscreen(deps: FullscreenDeps, on: boolean): Promise<boolean> {
  if (deps.platform === "darwin") {
    await run(deps, "osascript", [
      "-e",
      `tell application "System Events" to tell (${ownProcess(deps.pid)})
        try
          set fs to value of attribute "AXFullScreen" of window 1
          if fs is not ${on} then set value of attribute "AXFullScreen" of window 1 to ${on}
        end try
      end tell`,
    ]);
    return (await isNativeFullscreen(deps)) ?? on;
  }

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
  pid: process.pid,
  spawn: (command, options) => Bun.spawn(command, options),
});

export function isNativeFullscreenForProcess(): Promise<boolean | null> {
  return isNativeFullscreen(defaultDeps());
}

export function setNativeFullscreenForProcess(on: boolean): Promise<boolean> {
  return setNativeFullscreen(defaultDeps(), on);
}
