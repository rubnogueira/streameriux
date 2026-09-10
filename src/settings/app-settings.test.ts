import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readAppSettings, writeAppSettings } from "./app-settings";

describe("app settings IO", () => {
  const dir = join(tmpdir(), `app-settings-${Date.now()}`);
  const previous = process.env.STREAMER_CHANNELS_DIR;

  beforeEach(() => {
    mkdirSync(dir, { recursive: true });
    process.env.STREAMER_CHANNELS_DIR = dir;
  });

  afterEach(() => {
    process.env.STREAMER_CHANNELS_DIR = previous;
  });

  it("returns defaults when settings.toml is missing", async () => {
    const settings = await readAppSettings();
    expect(settings.defaultSidebarView).toBe("all");
  });

  it("reads and writes sidebar view and native video flag", async () => {
    writeFileSync(join(dir, "settings.toml"), "default_sidebar_view = \"favorites\"\nnative_video = false\n");
    const loaded = await readAppSettings();
    expect(loaded.defaultSidebarView).toBe("favorites");
    expect(loaded.nativeVideo).toBe(false);

    await writeAppSettings({ defaultSidebarView: "groups", nativeVideo: false });
    const roundTrip = await readAppSettings();
    expect(roundTrip.defaultSidebarView).toBe("groups");
  });

  it("ignores invalid sidebar values", async () => {
    writeFileSync(join(dir, "settings.toml"), 'default_sidebar_view = "nope"\n');
    const settings = await readAppSettings();
    expect(settings.defaultSidebarView).toBe("all");
  });

  it("falls back to defaults on corrupt TOML", async () => {
    writeFileSync(join(dir, "settings.toml"), "not valid {{{");
    const settings = await readAppSettings();
    expect(settings.defaultSidebarView).toBe("all");
  });
});
