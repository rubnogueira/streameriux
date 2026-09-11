import { describe, expect, it, vi } from "vitest";
import { isNativeFullscreen, setNativeFullscreen, type FullscreenSpawn } from "./fullscreen";
import type { DarwinWindowFullscreen } from "./darwin-window-fullscreen";

function spawnSequence(responses: { stdout: string; exitCode: number }[]): FullscreenSpawn {
  let index = 0;
  return () => {
    const next = responses[index++] ?? { stdout: "", exitCode: 1 };
    return {
      stdout: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(next.stdout));
          controller.close();
        },
      }),
      exited: Promise.resolve(next.exitCode),
    };
  };
}

const darwinDeps = (darwin: DarwinWindowFullscreen) => ({
  platform: "darwin" as const,
  spawn: vi.fn(),
  darwin,
});

describe("isNativeFullscreen", () => {
  it("returns null off darwin", async () => {
    expect(await isNativeFullscreen({ platform: "linux", spawn: vi.fn() })).toBeNull();
  });

  it("reads state from the macOS binding", async () => {
    expect(
      await isNativeFullscreen(
        darwinDeps({
          isFullscreen: () => true,
          setFullscreen: () => true,
        }),
      ),
    ).toBe(true);
    expect(
      await isNativeFullscreen(
        darwinDeps({
          isFullscreen: () => false,
          setFullscreen: () => false,
        }),
      ),
    ).toBe(false);
    expect(
      await isNativeFullscreen(
        darwinDeps({
          isFullscreen: () => null,
          setFullscreen: () => false,
        }),
      ),
    ).toBeNull();
  });

  it("returns null on darwin when the binding is missing", async () => {
    expect(
      await isNativeFullscreen({ platform: "darwin", spawn: vi.fn(), darwin: null }),
    ).toBeNull();
  });
});

describe("setNativeFullscreen", () => {
  it("uses the macOS binding", async () => {
    const setFullscreen = vi.fn(() => true);
    const on = await setNativeFullscreen(
      darwinDeps({
        isFullscreen: () => true,
        setFullscreen,
      }),
      true,
    );
    expect(on).toBe(true);
    expect(setFullscreen).toHaveBeenCalledWith(true);
  });

  it("falls back to the requested state when macOS set returns unknown", async () => {
    expect(
      await setNativeFullscreen(
        darwinDeps({
          isFullscreen: () => null,
          setFullscreen: () => false,
        }),
        false,
      ),
    ).toBe(false);
  });

  it("uses wmctrl on linux when it succeeds", async () => {
    expect(
      await setNativeFullscreen(
        { platform: "linux", spawn: spawnSequence([{ stdout: "", exitCode: 0 }]) },
        true,
      ),
    ).toBe(true);
  });

  it("falls back to xdotool on linux", async () => {
    expect(
      await setNativeFullscreen(
        {
          platform: "linux",
          spawn: spawnSequence([
            { stdout: "", exitCode: 1 },
            { stdout: "", exitCode: 0 },
          ]),
        },
        false,
      ),
    ).toBe(false);
  });

  it("maximizes on win32", async () => {
    expect(
      await setNativeFullscreen(
        { platform: "win32", spawn: spawnSequence([{ stdout: "", exitCode: 0 }]) },
        true,
      ),
    ).toBe(true);
  });

  it("returns the requested state on unknown platforms", async () => {
    expect(await setNativeFullscreen({ platform: "freebsd", spawn: vi.fn() }, true)).toBe(true);
  });
});
