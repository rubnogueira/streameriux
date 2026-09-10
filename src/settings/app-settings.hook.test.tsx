/** @vitest-environment jsdom */
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHookProbe } from "../test-fixtures/render-hook";
import { useAppSettings } from "./app-settings";

async function renderSettingsHook() {
  const hook = await renderHookProbe(() => useAppSettings());
  return {
    get api() {
      return hook.latest;
    },
    rerender: () => hook.rerender(),
    unmount: () => hook.unmount(),
  };
}

describe("useAppSettings", () => {
  const dir = join(tmpdir(), `app-settings-hook-${Date.now()}`);
  const previous = process.env.STREAMER_CHANNELS_DIR;

  beforeEach(() => {
    mkdirSync(dir, { recursive: true });
    process.env.STREAMER_CHANNELS_DIR = dir;
  });

  afterEach(() => {
    process.env.STREAMER_CHANNELS_DIR = previous;
  });

  it("loads persisted settings and updates sidebar view", async () => {
    writeFileSync(join(dir, "settings.toml"), 'default_sidebar_view = "groups"\n');
    const hook = await renderSettingsHook();
    await vi.waitFor(async () => {
      await hook.rerender();
      expect(hook.api.settings.defaultSidebarView).toBe("groups");
    });
    await act(async () => {
      await hook.api.setDefaultSidebarView("favorites");
    });
    await hook.rerender();
    expect(hook.api.settings.defaultSidebarView).toBe("favorites");
    hook.unmount();
  });

  it("persists native video preference", async () => {
    const hook = await renderSettingsHook();
    await act(async () => {
      await hook.api.setNativeVideo(false);
    });
    await hook.rerender();
    expect(hook.api.settings.nativeVideo).toBe(false);
    hook.unmount();
  });
});
