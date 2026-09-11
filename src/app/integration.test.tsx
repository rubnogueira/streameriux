import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectTest } from "@gpuix/react/automation";
import { hasNativeTestRenderer } from "@gpuix/react/testing";
import { keyRouter } from "./focus";
import { StreamerApp } from "./streamer-app";
import {
  closeGpuixTest,
  createGpuixTestRoot,
  createGpuixUi,
  settleGpuix,
} from "./test-fixtures/gpuix-test-root";
import { createTestCatalogDir } from "./test-fixtures/seed-catalog";

const describeNative = hasNativeTestRenderer ? describe : describe.skip;

describeNative("streamer shell integration", () => {
  beforeEach(() => {
    vi.stubEnv("STREAMER_CHANNELS_DIR", createTestCatalogDir());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function mountApp() {
    const root = createGpuixTestRoot({
      width: 1280,
      height: 800,
      onKeyDown: (event) => keyRouter.current?.(event),
    });
    await act(async () => {
      root.render(<StreamerApp />);
    });
    const app = await connectTest(root.renderer);
    const ui = createGpuixUi(app, root.renderer);
    await ui.waitFor("sidebar", { timeoutMs: 15_000 });
    await settleGpuix(root.renderer);
    return { app, ui, ...root };
  }

  it("lists channels and opens settings across tabs", async () => {
    const { app, ui, renderer } = await mountApp();
    await ui.waitFor("channel-acme");
    await ui.waitFor("player-empty");

    await ui.click("open-settings");
    await ui.click("settings-tab-playlists");
    await ui.fill("settings-add-url", "https://example.com/integration.m3u8");
    await ui.click("settings-add-url-btn");
    await ui.click("settings-tab-channels");
    await ui.click("channels-add");
    await ui.click("channel-editor-back");
    await ui.click("settings-tab-channels");
    await ui.click("settings-tab-groups");
    await ui.click("settings-tab-epg");
    await ui.click("settings-tab-general");
    await ui.click("settings-close");

    expect(renderer.getPaintedText().join(" ")).toContain("Acme TV");
    await closeGpuixTest(app, renderer);
  }, 30_000);

  it("selects channels, favorites, and sidebar views", async () => {
    const { app, ui, renderer } = await mountApp();
    await ui.waitFor("channel-acme");
    await ui.click("channel-acme");
    await ui.waitFor("favorite-acme");
    await ui.click("favorite-acme");
    await ui.click("view-favorites");
    await ui.click("view-groups");
    await ui.click("group-Live");
    await ui.click("channel-castr");
    await ui.click("view-countries");
    await ui.click("country-US");
    await ui.fill("search", "acme");
    await ui.click("channel-acme");
    await ui.click("refresh-catalog");
    await closeGpuixTest(app, renderer);
  }, 30_000);

  it("drives player chrome, guide, and keyboard shortcuts", async () => {
    const { app, ui, renderer } = await mountApp();
    await ui.waitFor("channel-acme");
    await ui.click("channel-acme");
    await ui.waitFor("play-pause");
    await ui.click("play-pause");
    await ui.click("mute");
    await ui.click("skip-back");
    await ui.click("skip-forward");
    await ui.click("prev-channel");
    await ui.click("next-channel");
    await ui.click("video-fit-contain");
    await ui.click("collapse-sidebar");
    await ui.waitFor("expand-sidebar");
    await ui.click("expand-sidebar");
    await ui.waitFor("sidebar");
    await ui.click("fullscreen");
    await ui.click("exit-fullscreen");

    await ui.click("channel-acme");
    await ui.click("open-guide");
    await ui.click("guide-close");

    const center = await ui.center("player");
    await ui.mouseMove(center);
    await ui.mouseMove({ x: center.x + 6, y: center.y + 4 });

    await ui.press("app", " ");
    await ui.press("app", "m");
    await ui.press("app", "f");
    await ui.press("app", "g");
    await ui.press("app", "g");
    await ui.press("app", "k");
    await ui.press("app", "l");
    await ui.press("app", "p");
    await ui.press("app", "escape");

    await ui.dragBy("seek-bar", 30, 0);
    await ui.dragBy("volume-slider", 10, 0);

    await act(async () => {
      renderer.advanceTime(2_500);
    });
    await settleGpuix(renderer);
    await closeGpuixTest(app, renderer);
  }, 30_000);
});
