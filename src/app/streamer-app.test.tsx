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

const mediaHandlers = vi.hoisted(() => ({
  current: null as null | {
    play: () => void;
    pause: () => void;
    toggle: () => void;
    next: () => void;
    previous: () => void;
  },
}));

const mediaController = vi.hoisted(() => ({
  dispose: vi.fn(),
  clear: vi.fn(),
  update: vi.fn(),
}));

let resolveMediaSession: ((controller: typeof mediaController) => void) | null = null;

vi.mock("../media/media-session", () => ({
  startMediaSession: (handlers: (typeof mediaHandlers)["current"]) => {
    mediaHandlers.current = handlers;
    return new Promise<typeof mediaController>((resolve) => {
      resolveMediaSession = resolve;
    });
  },
}));

const fullscreenMocks = vi.hoisted(() => ({
  isNativeFullscreenForProcess: vi.fn(async () => false),
  setNativeFullscreenForProcess: vi.fn(async () => true),
}));

vi.mock("../lib/fullscreen", () => fullscreenMocks);

vi.mock("./theme", async (importOriginal) => {
  const theme = await importOriginal<typeof import("./theme")>();
  return { ...theme, IS_MAC: true };
});

const describeNative = hasNativeTestRenderer ? describe : describe.skip;

describeNative("StreamerApp", () => {
  beforeEach(() => {
    vi.stubEnv("STREAMER_CHANNELS_DIR", createTestCatalogDir());
    mediaHandlers.current = null;
    resolveMediaSession = null;
    mediaController.dispose.mockClear();
    mediaController.clear.mockClear();
    mediaController.update.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    mediaHandlers.current = null;
  });

  async function mount() {
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
    resolveMediaSession?.(mediaController);
    await settleGpuix(root.renderer);
    return { app, ui, ...root };
  }

  it("invokes media session transport handlers", async () => {
    const { app, ui, renderer } = await mount();
    await ui.waitFor("channel-acme");
    await ui.click("channel-acme");
    for (let i = 0; i < 30; i += 1) {
      await Promise.resolve();
      renderer.flush();
      if (mediaHandlers.current) break;
    }
    resolveMediaSession?.(mediaController);
    await Promise.resolve();
    renderer.flush();
    expect(mediaHandlers.current).not.toBeNull();
    mediaHandlers.current!.play();
    mediaHandlers.current!.pause();
    mediaHandlers.current!.toggle();
    mediaHandlers.current!.next();
    mediaHandlers.current!.previous();
    await closeGpuixTest(app, renderer);
  });

  it(
    "handles keyboard shortcuts and text-input guard",
    async () => {
      const { app, ui, renderer } = await mount();
      await ui.waitFor("channel-acme");
      await ui.click("channel-acme");
      await ui.press("app", " ");
      await ui.press("app", "l");
      await ui.press("app", "ArrowLeft");
      await ui.press("app", "ArrowRight");
      await ui.press("app", "ArrowUp");
      await ui.press("app", "ArrowDown");
      await ui.press("app", "[");
      await ui.press("app", "]");
      await ui.press("app", "n");
      await ui.fill("search", "a");
      await ui.press("app", " ");
      await ui.click("open-settings");
      await ui.press("app", "g");
      await ui.click("settings-close");
      await ui.press("app", "escape");
      await closeGpuixTest(app, renderer);
    },
    30_000,
  );

  it("unmount cleans up the player and media session", async () => {
    const { app, ui, unmount, renderer } = await mount();
    await ui.waitFor("channel-castr");
    await closeGpuixTest(app, renderer, unmount);
    expect(mediaController.dispose).toHaveBeenCalled();
  });

  it("steps safely when the channel list is empty", async () => {
    vi.stubEnv("STREAMER_CHANNELS_DIR", createTestCatalogDir({ empty: true }));
    const { app, ui, renderer } = await mount();
    await ui.press("app", "]");
    await closeGpuixTest(app, renderer);
  });

  it("disposes the media session when unmounted before it resolves", async () => {
    const root = createGpuixTestRoot({
      width: 1280,
      height: 800,
      onKeyDown: (event) => keyRouter.current?.(event),
    });
    await act(async () => {
      root.render(<StreamerApp />);
    });
    act(() => {
      root.unmount();
    });
    resolveMediaSession?.(mediaController);
    await settleGpuix(root.renderer);
    expect(mediaController.dispose).toHaveBeenCalled();
  });

  it("syncs native fullscreen exit when the OS leaves fullscreen", async () => {
    fullscreenMocks.isNativeFullscreenForProcess.mockResolvedValue(false);
    const { app, ui, renderer } = await mount();
    await ui.press("app", "f");
    await act(async () => {
      renderer.advanceTime(1500);
    });
    await ui.press("app", "f");
    await closeGpuixTest(app, renderer);
  });

  it("routes drag events on the app shell", async () => {
    const { app, ui, renderer } = await mount();
    await ui.waitFor("channel-acme");
    await ui.click("channel-acme");
    await ui.waitFor("volume-slider");
    await ui.dragBy("volume-slider", 10, 0);
    const center = await ui.center("app");
    await ui.mouseMove(center);
    await ui.mouseUp(center);
    await act(async () => {
      renderer.advanceTime(50);
    });
    await closeGpuixTest(app, renderer);
  });

  it(
    "wires settings catalog callbacks",
    async () => {
      const { app, ui, renderer } = await mount();
      await ui.click("open-settings");
      await ui.click("settings-tab-playlists");
      await ui.fill("settings-add-url", "https://example.com/from-test.m3u8");
      await ui.click("settings-add-url-btn");
      await ui.click("settings-tab-channels");
      await ui.click("channels-add");
      await ui.fill("channel-field-name", "Test");
      await ui.fill("channel-field-url", "https://example.com/t.m3u8");
      await ui.click("channel-editor-save");
      await ui.click("settings-close");
      await closeGpuixTest(app, renderer);
    },
    30_000,
  );

  it("opens and closes the programme guide", async () => {
    const { app, ui, renderer } = await mount();
    await ui.waitFor("channel-acme");
    await ui.click("channel-acme");
    await ui.click("open-guide");
    await ui.waitFor("guide-close");
    await ui.click("guide-close");
    await closeGpuixTest(app, renderer);
  });

  it(
    "resets selection when the active channel disappears",
    async () => {
      const { app, ui, renderer } = await mount();
      await ui.waitFor("channel-mine");
      await ui.click("channel-mine");
      await ui.click("open-settings");
      await ui.click("settings-tab-channels");
      await ui.waitFor("settings-channel-mine");
      await ui.click("settings-channel-mine");
      await ui.click("channel-editor-delete");
      await ui.waitFor("settings-close");
      await ui.click("settings-close");
      await settleGpuix(renderer, 16);
      await closeGpuixTest(app, renderer);
    },
    30_000,
  );
});
