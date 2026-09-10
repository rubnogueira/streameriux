/** @vitest-environment jsdom */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { artworkUrlForSession, mediaSessionUpdate, startMediaSession } from "./media-session";
import type { PlayerState } from "../player";

const bridgeHandlers: Record<string, () => void> = {};
const bridgeUpdate = vi.fn();
const bridgeStop = vi.fn();

vi.mock("@kud/macos-nowplaying-bridge", () => ({
  createNowPlayingBridge: vi.fn(async () => ({
    update: bridgeUpdate,
    on: (event: string, handler: () => void) => {
      bridgeHandlers[event] = handler;
    },
    stop: bridgeStop,
  })),
}));

const ready: PlayerState = {
  status: "ready",
  playing: true,
  live: false,
  seekable: true,
  muted: false,
  volume: 1,
  time: 125,
  start: 100,
  end: 400,
  unix: false,
  unixOffset: null,
  width: 1280,
  height: 720,
  framePath: null,
  warning: null,
  error: null,
  channelId: "acme",
};

describe("mediaSessionUpdate", () => {
  it("maps channel and playback to Now Playing fields", () => {
    const info = mediaSessionUpdate(
      {
        id: "acme",
        name: "Acme TV",
        url: "https://example.com/acme.m3u8",
        group: "United States",
        icon: "https://cdn.example/logo.png",
        sourceFile: "playlist.m3u8",
        sourceKind: "m3u",
        editable: false,
      },
      ready,
    );
    expect(info).toMatchObject({
      title: "Acme TV",
      artist: "United States",
      album: "Streamer",
      artworkUrl: "https://cdn.example/logo.png",
      duration: 300,
      elapsed: 25,
      state: "playing",
    });
  });

  it("uses programme title when EPG data is available", () => {
    const info = mediaSessionUpdate(
      {
        id: "acme",
        name: "Acme TV",
        url: "https://example.com/acme.m3u8",
        group: "United States",
        sourceFile: "playlist.m3u8",
        sourceKind: "m3u",
        editable: false,
      },
      ready,
      { start: 0, stop: 1000, title: "Evening News" },
    );
    expect(info).toMatchObject({
      title: "Evening News",
      artist: "Acme TV",
      album: "United States",
    });
  });
  it("returns null when nothing is playing", () => {
    expect(mediaSessionUpdate(null, ready)).toBeNull();
    expect(
      mediaSessionUpdate(
        {
          id: "x",
          name: "X",
          url: "https://x",
          sourceFile: "x",
          sourceKind: "m3u",
          editable: false,
        },
        { ...ready, status: "idle" },
      ),
    ).toBeNull();
  });

  it("passes through remote artwork URLs", () => {
    expect(artworkUrlForSession("https://cdn.example/logo.png")).toBe(
      "https://cdn.example/logo.png",
    );
  });

  it("maps local icon paths to file URLs", () => {
    const dir = mkdtempSync(join(tmpdir(), "artwork-"));
    const icon = join(dir, "logo.png");
    writeFileSync(icon, "png");
    expect(artworkUrlForSession(icon)).toBe(`file://${icon}`);
    expect(artworkUrlForSession("file:///tmp/logo.png")).toBe("file:///tmp/logo.png");
    expect(artworkUrlForSession("  ")).toBeUndefined();
  });
});

describe("startMediaSession", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    bridgeUpdate.mockClear();
    bridgeStop.mockClear();
    for (const key of Object.keys(bridgeHandlers)) delete bridgeHandlers[key];
  });

  it("returns a noop controller when no web or darwin session exists", async () => {
    const platform = vi.spyOn(process, "platform", "get").mockReturnValue("linux");
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {},
    });
    const session = await startMediaSession({
      play: vi.fn(),
      pause: vi.fn(),
      toggle: vi.fn(),
      next: vi.fn(),
      previous: vi.fn(),
    });
    session.update(null, { ...ready, status: "idle" });
    session.clear();
    session.dispose();
    platform.mockRestore();
  });

  it("drives the macOS Now Playing bridge", async () => {
    const platform = vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {},
    });
    const handlers = {
      play: vi.fn(),
      pause: vi.fn(),
      toggle: vi.fn(),
      next: vi.fn(),
      previous: vi.fn(),
    };
    const session = await startMediaSession(handlers);
    const channel = {
      id: "acme",
      name: "Acme TV",
      url: "https://example.com/a.m3u8",
      sourceFile: "a.m3u8",
      sourceKind: "m3u" as const,
      editable: false,
    };
    session.update(channel, ready);
    expect(bridgeUpdate).toHaveBeenCalled();
    bridgeHandlers.play?.();
    bridgeHandlers.pause?.();
    bridgeHandlers.toggle?.();
    bridgeHandlers.next?.();
    bridgeHandlers.previous?.();
    expect(handlers.play).toHaveBeenCalled();
    session.dispose();
    expect(bridgeStop).toHaveBeenCalled();
    platform.mockRestore();
  });

  it("updates and clears the web media session", async () => {
    Object.defineProperty(navigator, "mediaSession", {
      configurable: true,
      value: {
        metadata: null,
        playbackState: "none",
        setActionHandler: vi.fn(),
        setPositionState: vi.fn(() => {
          throw new Error("live");
        }),
      },
    });
    class MediaMetadataMock {
      title = "";
      constructor(init: { title?: string }) {
        this.title = init.title ?? "";
      }
    }
    vi.stubGlobal("MediaMetadata", MediaMetadataMock);
    const handlers = {
      play: vi.fn(),
      pause: vi.fn(),
      toggle: vi.fn(),
      next: vi.fn(),
      previous: vi.fn(),
    };
    const session = await startMediaSession(handlers);
    session.update(
      {
        id: "acme",
        name: "Acme TV",
        url: "https://example.com/a.m3u8",
        sourceFile: "a.m3u8",
        sourceKind: "m3u",
        editable: false,
      },
      ready,
    );
    expect(navigator.mediaSession.metadata?.title).toBe("Acme TV");
    session.update(null, { ...ready, status: "idle" });
    session.clear();
    session.dispose();
    expect(navigator.mediaSession.playbackState).toBe("none");
  });

  it("invokes web media session action handlers", async () => {
    const handlers = {
      play: vi.fn(),
      pause: vi.fn(),
      toggle: vi.fn(),
      next: vi.fn(),
      previous: vi.fn(),
    };
    const actionHandlers: Record<string, () => void> = {};
    Object.defineProperty(navigator, "mediaSession", {
      configurable: true,
      value: {
        metadata: null,
        playbackState: "none",
        setActionHandler: (name: string, fn: (() => void) | null) => {
          if (fn) actionHandlers[name] = fn;
        },
        setPositionState: vi.fn(),
      },
    });
    vi.stubGlobal("MediaMetadata", class {
      constructor(_init: object) {}
    });
    await startMediaSession(handlers);
    actionHandlers.play?.();
    actionHandlers.pause?.();
    actionHandlers.nexttrack?.();
    actionHandlers.previoustrack?.();
    actionHandlers.seekforward?.();
    actionHandlers.seekbackward?.();
    expect(handlers.play).toHaveBeenCalled();
    expect(handlers.previous).toHaveBeenCalledTimes(2);
  });

  it("dedupes identical updates", async () => {
    Object.defineProperty(navigator, "mediaSession", {
      configurable: true,
      value: {
        metadata: null,
        playbackState: "none",
        setActionHandler: vi.fn(),
        setPositionState: vi.fn(),
      },
    });
    vi.stubGlobal("MediaMetadata", class {
      title = "";
      constructor(init: { title?: string }) {
        this.title = init.title ?? "";
      }
    });
    const session = await startMediaSession({
      play: vi.fn(),
      pause: vi.fn(),
      toggle: vi.fn(),
      next: vi.fn(),
      previous: vi.fn(),
    });
    const channel = {
      id: "acme",
      name: "Acme TV",
      url: "https://example.com/a.m3u8",
      sourceFile: "a.m3u8",
      sourceKind: "m3u" as const,
      editable: false,
    };
    session.update(channel, ready);
    const title = navigator.mediaSession.metadata?.title;
    session.update(channel, ready);
    expect(navigator.mediaSession.metadata?.title).toBe(title);
    session.dispose();
  });
});
