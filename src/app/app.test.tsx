/**
 * Paints the streamer shell through the GPU test renderer.
 * Playback is not exercised here; that needs a live playlist.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { hasNativeTestRenderer } from "@gpuix/react/testing";

import { bootstrapStreamerApp, formatClock, shouldBootstrapApp, startAppIfEntry } from "./app";
import { keyRouter } from "./focus";
import { createTestCatalogDir } from "./test-fixtures/seed-catalog";
import { mountStreamerApp, unmountStreamerApp } from "./test-fixtures/mount-streamer-app";

const mediaController = vi.hoisted(() => ({
  dispose: vi.fn(),
  clear: vi.fn(),
  update: vi.fn(),
}));

vi.mock("../media/media-session", () => ({
  startMediaSession: vi.fn(() => Promise.resolve(mediaController)),
}));

const describeNative = hasNativeTestRenderer ? describe : describe.skip;
const APP_ENTRY = "/proj/src/app/app.tsx";

describe("shouldBootstrapApp", () => {
  it("bootstraps in a browser bundle when window exists", () => {
    expect(
      shouldBootstrapApp({
        metaPath: APP_ENTRY,
        hasWindow: true,
      }),
    ).toBe(true);
    expect(
      shouldBootstrapApp({
        metaPath: APP_ENTRY,
        hasWindow: false,
      }),
    ).toBe(false);
  });
  it("bootstraps when Bun.main matches the app entry", () => {
    expect(
      shouldBootstrapApp({
        bun: { isStandaloneExecutable: false, main: APP_ENTRY },
        metaPath: APP_ENTRY,
        hasWindow: false,
      }),
    ).toBe(true);
  });

  it("bootstraps standalone Bun executables", () => {
    expect(
      shouldBootstrapApp({
        bun: { isStandaloneExecutable: true, main: "/other/path" },
        metaPath: APP_ENTRY,
        hasWindow: false,
      }),
    ).toBe(true);
  });

  it("does not bootstrap when imported as a library", () => {
    expect(
      shouldBootstrapApp({
        bun: { isStandaloneExecutable: false, main: "/proj/vitest.ts" },
        metaPath: APP_ENTRY,
        hasWindow: false,
      }),
    ).toBe(false);
  });
});

describe("bootstrapStreamerApp", () => {
  it("does nothing when not the entry point", () => {
    const renderApp = vi.fn();
    bootstrapStreamerApp(false, renderApp);
    expect(renderApp).not.toHaveBeenCalled();
  });

  it("passes render options when bootstrapping", () => {
    const renderApp = vi.fn();
    bootstrapStreamerApp(true, renderApp);
    expect(renderApp).toHaveBeenCalledOnce();
    expect(renderApp.mock.calls[0]?.[0].title).toBeTruthy();
    expect(renderApp.mock.calls[0]?.[0].onKeyDown).toBeTypeOf("function");
  });

  it("defers focus when GPUIX_BACKGROUND is set", () => {
    vi.stubEnv("GPUIX_BACKGROUND", "1");
    const renderApp = vi.fn();
    bootstrapStreamerApp(true, renderApp);
    expect(renderApp.mock.calls[0]?.[0].focus).toBe(false);
    vi.unstubAllEnvs();
  });

  it("forwards key events through keyRouter", () => {
    const handler = vi.fn();
    keyRouter.current = handler;
    const renderApp = vi.fn();
    bootstrapStreamerApp(true, renderApp);
    const onKeyDown = renderApp.mock.calls[0]?.[0].onKeyDown;
    onKeyDown?.({ type: "keydown" } as never);
    expect(handler).toHaveBeenCalledOnce();
    keyRouter.current = null;
  });
});

describe("startAppIfEntry", () => {
  it("renders when this module is the Bun entry", () => {
    const renderApp = vi.fn();
    startAppIfEntry(
      { path: APP_ENTRY },
      {
        bun: { isStandaloneExecutable: false, main: APP_ENTRY },
        hasWindow: false,
        renderApp,
      },
    );
    expect(renderApp).toHaveBeenCalledOnce();
  });

  it("skips rendering when imported as a library", () => {
    const renderApp = vi.fn();
    startAppIfEntry(
      { path: APP_ENTRY },
      {
        bun: { isStandaloneExecutable: false, main: "/proj/other.ts" },
        hasWindow: false,
        renderApp,
      },
    );
    expect(renderApp).not.toHaveBeenCalled();
  });
});

describe("formatClock", () => {
  it("formats media timestamps", () => {
    expect(formatClock(75)).toBe("1:15");
    expect(formatClock(3723)).toBe("1:02:03");
  });
});

describeNative("streamer app", () => {
  beforeAll(() => {
    vi.stubEnv("STREAMER_CHANNELS_DIR", createTestCatalogDir());
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("lists catalog channels and the empty player", async () => {
    const { app, ui, renderer } = await mountStreamerApp();

    await ui.waitFor("channel-castr");
    await ui.waitFor("player-empty");

    const painted = renderer.getPaintedText();
    expect(painted).toContain("streameriux");
    expect(painted).toContain("United States");
    expect(painted).toContain("Acme TV");
    expect(painted).toContain("Select a channel to play");

    await unmountStreamerApp(app, renderer);
  }, 30_000);
});
