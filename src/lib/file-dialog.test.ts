import { describe, expect, it, vi } from "vitest";
import { pickCatalogFile, pickCatalogFolder, type DialogSpawn } from "./file-dialog";

function spawnWith(stdoutText: string, exitCode = 0): DialogSpawn {
  return () => ({
    stdout: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(stdoutText));
        controller.close();
      },
    }),
    exited: Promise.resolve(exitCode),
  });
}

describe("pickCatalogFile", () => {
  it("returns null for empty darwin selection", async () => {
    const path = await pickCatalogFile({ platform: "darwin", spawn: spawnWith("  ") });
    expect(path).toBeNull();
  });

  it("returns a trimmed darwin path", async () => {
    const path = await pickCatalogFile({ platform: "darwin", spawn: spawnWith("/tmp/a.m3u\n") });
    expect(path).toBe("/tmp/a.m3u");
  });

  it("returns null when zenity exits non-zero", async () => {
    const path = await pickCatalogFile({ platform: "linux", spawn: spawnWith("/tmp/x.toml", 1) });
    expect(path).toBeNull();
  });

  it("returns a linux path", async () => {
    const path = await pickCatalogFile({ platform: "linux", spawn: spawnWith("/tmp/x.toml") });
    expect(path).toBe("/tmp/x.toml");
  });

  it("returns a windows path via powershell", async () => {
    const path = await pickCatalogFile({ platform: "win32", spawn: spawnWith("C:\\a.toml") });
    expect(path).toBe("C:\\a.toml");
  });

  it("handles missing stdout stream", async () => {
    const spawn: DialogSpawn = () => ({ stdout: null, exited: Promise.resolve(0) });
    const path = await pickCatalogFile({ platform: "linux", spawn });
    expect(path).toBeNull();
  });
});

describe("native wrappers", () => {
  it("pickCatalogFileNative delegates to spawn", async () => {
    const spawn = vi.fn(() => ({
      stdout: new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode("/tmp/a.m3u"));
          c.close();
        },
      }),
      exited: Promise.resolve(0),
    }));
    const previous = globalThis.Bun;
    globalThis.Bun = { ...previous, spawn } as typeof Bun;
    const { pickCatalogFileNative } = await import("./file-dialog");
    await expect(pickCatalogFileNative()).resolves.toBe("/tmp/a.m3u");
    globalThis.Bun = previous;
  });
});

describe("pickCatalogFolder", () => {
  it("returns a darwin folder path", async () => {
    const path = await pickCatalogFolder({ platform: "darwin", spawn: spawnWith("/tmp/catalogs/") });
    expect(path).toBe("/tmp/catalogs/");
  });

  it("returns null when zenity cancels", async () => {
    const path = await pickCatalogFolder({ platform: "linux", spawn: spawnWith("", 1) });
    expect(path).toBeNull();
  });

  it("returns a windows folder path", async () => {
    const path = await pickCatalogFolder({ platform: "win32", spawn: spawnWith("C:\\catalogs") });
    expect(path).toBe("C:\\catalogs");
  });
});
