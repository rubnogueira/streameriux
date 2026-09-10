import { describe, expect, it, vi } from "vitest";
import { isNativeFullscreen, setNativeFullscreen, type FullscreenSpawn } from "./fullscreen";

function spawnSequence(
  responses: { stdout: string; exitCode: number }[],
): FullscreenSpawn {
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

describe("isNativeFullscreen", () => {
  it("returns null off darwin", async () => {
    expect(await isNativeFullscreen({ platform: "linux", pid: 1, spawn: vi.fn() })).toBeNull();
  });

  it("parses true and false from osascript", async () => {
    expect(
      await isNativeFullscreen({
        platform: "darwin",
        pid: 42,
        spawn: spawnSequence([{ stdout: "true", exitCode: 0 }]),
      }),
    ).toBe(true);
    expect(
      await isNativeFullscreen({
        platform: "darwin",
        pid: 42,
        spawn: spawnSequence([{ stdout: "false", exitCode: 0 }]),
      }),
    ).toBe(false);
    expect(
      await isNativeFullscreen({
        platform: "darwin",
        pid: 42,
        spawn: spawnSequence([{ stdout: "missing", exitCode: 0 }]),
      }),
    ).toBeNull();
  });

  it("returns null when spawn throws", async () => {
    const spawn: FullscreenSpawn = () => {
      throw new Error("spawn failed");
    };
    expect(await isNativeFullscreen({ platform: "darwin", pid: 1, spawn })).toBeNull();
  });
});

describe("native wrappers", () => {
  it("isNativeFullscreenForProcess delegates to spawn", async () => {
    const spawn = vi.fn(() => ({
      stdout: new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode("false"));
          c.close();
        },
      }),
      exited: Promise.resolve(0),
    }));
    const previous = globalThis.Bun;
    globalThis.Bun = { ...previous, spawn } as typeof Bun;
    const { isNativeFullscreenForProcess } = await import("./fullscreen");
    await expect(isNativeFullscreenForProcess()).resolves.toBe(false);
    globalThis.Bun = previous;
  });
});

describe("setNativeFullscreen", () => {
  it("re-reads state on darwin", async () => {
    const on = await setNativeFullscreen(
      {
        platform: "darwin",
        pid: 9,
        spawn: spawnSequence([
          { stdout: "", exitCode: 0 },
          { stdout: "true", exitCode: 0 },
        ]),
      },
      true,
    );
    expect(on).toBe(true);
  });

  it("uses wmctrl on linux when it succeeds", async () => {
    expect(
      await setNativeFullscreen(
        { platform: "linux", pid: 1, spawn: spawnSequence([{ stdout: "", exitCode: 0 }]) },
        true,
      ),
    ).toBe(true);
  });

  it("falls back to xdotool on linux", async () => {
    expect(
      await setNativeFullscreen(
        {
          platform: "linux",
          pid: 1,
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
        { platform: "win32", pid: 1, spawn: spawnSequence([{ stdout: "", exitCode: 0 }]) },
        true,
      ),
    ).toBe(true);
  });

  it("returns the requested state on unknown platforms", async () => {
    expect(
      await setNativeFullscreen({ platform: "freebsd", pid: 1, spawn: vi.fn() }, true),
    ).toBe(true);
  });

  it("returns fallback when darwin re-read fails", async () => {
    expect(
      await setNativeFullscreen(
        {
          platform: "darwin",
          pid: 1,
          spawn: spawnSequence([
            { stdout: "", exitCode: 0 },
            { stdout: "weird", exitCode: 0 },
          ]),
        },
        false,
      ),
    ).toBe(false);
  });
});
