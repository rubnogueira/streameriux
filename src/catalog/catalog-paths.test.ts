import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pathState = vi.hoisted(() => ({
  home: "",
}));

vi.mock("node:os", async (importOriginal) => {
  const os = await importOriginal<typeof import("node:os")>();
  return {
    ...os,
    homedir: () => pathState.home,
  };
});

vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs")>();
  const realExists = fs.existsSync.bind(fs);
  return {
    ...fs,
    existsSync: (path: import("node:fs").PathLike) => {
      const value = String(path);
      if (value.endsWith("/channels") || value.endsWith("\\channels")) return false;
      return realExists(path);
    },
  };
});

describe("catalog paths and config", () => {
  beforeEach(() => {
    pathState.home = join(tmpdir(), `catalog-home-${Date.now()}`);
    mkdirSync(pathState.home, { recursive: true });
    delete process.env.STREAMER_CHANNELS_DIR;
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete process.env.XDG_DATA_HOME;
    delete process.env.APPDATA;
    vi.resetModules();
  });

  it("falls back to Windows and Linux user data directories", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    vi.stubEnv("APPDATA", join(pathState.home, "AppData"));
    mkdirSync(join(pathState.home, "AppData"), { recursive: true });
    const win = await import("./index");
    expect(win.appRoot()).toBe(join(pathState.home, "AppData", "streameriux"));

    vi.resetModules();
    vi.spyOn(process, "platform", "get").mockReturnValue("linux");
    process.env.XDG_DATA_HOME = join(pathState.home, ".local", "share");
    mkdirSync(process.env.XDG_DATA_HOME, { recursive: true });
    const linux = await import("./index");
    expect(linux.appRoot()).toBe(join(pathState.home, ".local", "share", "streameriux"));
  });

  it("persists and clears the configured base folder on macOS", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
    const custom = join(pathState.home, "my-channels");
    const catalog = await import("./index");
    await catalog.setBaseFolder(custom);
    expect(catalog.baseFolder()).toBe(custom);
    expect(catalog.channelsDir()).toBe(custom);
    const config = readFileSync(
      join(pathState.home, "Library/Application Support/streameriux/config.toml"),
      "utf8",
    );
    expect(config).toContain("channels_dir");

    await catalog.setBaseFolder(null);
    expect(catalog.baseFolder()).toBeNull();
    const cleared = readFileSync(
      join(pathState.home, "Library/Application Support/streameriux/config.toml"),
      "utf8",
    );
    expect(cleared).not.toContain("channels_dir");
  });

  it("tolerates corrupt config when reading the base folder", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
    const configDir = join(pathState.home, "Library/Application Support/streameriux");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, "config.toml"), "{{not valid", "utf8");
    const catalog = await import("./index");
    expect(catalog.baseFolder()).toBeNull();
  });
});
