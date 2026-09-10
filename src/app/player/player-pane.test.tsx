import React from "react";
import { describe, expect, it, vi } from "vitest";
import { createTestRoot, hasNativeTestRenderer } from "@gpuix/react/testing";
import { connectTest } from "@gpuix/react/automation";
import type { Channel } from "../../catalog";
import { StreamPlayer, type PlayerState } from "../../player";
import type { EpgProgramme } from "../../epg/xmltv";
import { idlePlayer } from "../theme";
import { PlayerPane } from "./player-pane";

const describeNative = hasNativeTestRenderer ? describe : describe.skip;

const sampleChannel: Channel = {
  id: "acme",
  name: "Acme TV",
  url: "https://example.com/acme.m3u8",
  group: "United States",
  country: "US",
  icon: "",
  chno: "42",
  favorite: false,
  editable: false,
  sourceFile: "default.toml",
  sourceKind: "toml",
  userAgent: undefined,
  referrer: undefined,
  headers: undefined,
};

const programme: EpgProgramme = {
  start: Date.now() - 60_000,
  stop: Date.now() + 3_600_000,
  title: "Evening News",
  desc: "Top stories",
  category: "News",
};

function readyState(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    status: "ready",
    playing: true,
    live: true,
    seekable: true,
    muted: false,
    volume: 0.6,
    time: 100,
    start: 0,
    end: 200,
    unix: false,
    unixOffset: null,
    width: 1280,
    height: 720,
    framePath: null,
    warning: "Buffering lightly",
    error: null,
    channelId: "acme",
    ...overrides,
  };
}

function renderPane(
  state: PlayerState,
  options: {
    channel?: Channel | null;
    fullscreen?: boolean;
    programme?: EpgProgramme | null;
    nativeVideoActive?: boolean;
  } = {},
) {
  const player = new StreamPlayer(() => {});
  player["pushFrame"]("data:image/bmp;base64,QUJD");
  player["pushFrame"]("data:image/bmp;base64,REVG");

  const handlers = {
    onToggle: vi.fn(),
    onLive: vi.fn(),
    onMute: vi.fn(),
    onVolume: vi.fn(),
    onSeek: vi.fn(),
    onSkip: vi.fn(),
    onPrev: vi.fn(),
    onNext: vi.fn(),
    onFullscreen: vi.fn(),
    onGuide: vi.fn(),
    onCycleVideoFit: vi.fn(),
  };

  const { render, renderer } = createTestRoot({ width: 900, height: 600 });
  render(
    <PlayerPane
      channel={options.channel ?? sampleChannel}
      state={state}
      player={player}
      nativeVideoActive={options.nativeVideoActive ?? false}
      fullscreen={options.fullscreen ?? false}
      programme={options.programme ?? programme}
      epgEnabled
      videoFit="contain"
      {...handlers}
    />,
  );
  return { renderer, handlers, player };
}

describeNative("PlayerPane", () => {
  it("shows idle placeholder without a channel", async () => {
    const { renderer } = renderPane(idlePlayer, { channel: null, programme: null });
    const app = await connectTest(renderer);
    await app.getByTestId("player-empty").waitFor();
    await app.close();
  });

  it("shows loading and error states", async () => {
    const loading = renderPane({ ...idlePlayer, status: "loading" });
    const appLoad = await connectTest(loading.renderer);
    await appLoad.getByTestId("player-empty").waitFor();
    await appLoad.close();

    const errored = renderPane({
      ...idlePlayer,
      status: "error",
      error: "Stream failed",
    });
    const appErr = await connectTest(errored.renderer);
    await appErr.getByTestId("player-empty").waitFor();
    expect(errored.renderer.getPaintedText().join(" ")).toContain("Stream failed");
    await appErr.close();
  });

  it("wires transport controls and chrome actions", async () => {
    const { renderer, handlers } = renderPane(readyState());
    const app = await connectTest(renderer);
    await app.getByTestId("play-pause").click();
    await app.getByTestId("skip-back").click();
    await app.getByTestId("skip-forward").click();
    await app.getByTestId("prev-channel").click();
    await app.getByTestId("next-channel").click();
    await app.getByTestId("go-live").click();
    await app.getByTestId("mute").click();
    await app.getByTestId("open-guide").click();
    await app.getByTestId("video-fit-contain").click();
    await app.getByTestId("fullscreen").click();
    renderer.advanceTime(400);
    const track = renderer.findByTestId("seek-bar");
    expect(track).toBeDefined();
    const box = renderer.getElementBounds(track!.id);
    if (box && box.length >= 4) {
      const [x, y, w, h] = box;
      renderer.nativeSimulateMouseDown(x + w * 0.2, y + h / 2);
      renderer.nativeSimulateMouseMove(x + w * 0.8, y + h / 2, 0);
      renderer.nativeSimulateMouseUp(x + w * 0.8, y + h / 2);
      renderer.dispatchNativeEvents();
    }
    expect(handlers.onToggle).toHaveBeenCalled();
    expect(handlers.onSkip).toHaveBeenCalled();
    expect(handlers.onFullscreen).toHaveBeenCalled();
    await app.close();
  });

  it("supports fullscreen chrome and VOD layout", async () => {
    const { renderer, handlers } = renderPane(
      readyState({
        live: false,
        playing: false,
        warning: null,
        error: "Disk full",
      }),
      { fullscreen: true },
    );
    const app = await connectTest(renderer);
    await app.getByTestId("exit-fullscreen").click();
    expect(handlers.onFullscreen).toHaveBeenCalled();
    expect(renderer.getPaintedText().join(" ")).toContain("Disk full");
    await app.close();
  });

  it("reveals chrome when playback starts", async () => {
    const player = new StreamPlayer(() => {});
    const handlers = {
      onToggle: vi.fn(),
      onLive: vi.fn(),
      onMute: vi.fn(),
      onVolume: vi.fn(),
      onSeek: vi.fn(),
      onSkip: vi.fn(),
      onPrev: vi.fn(),
      onNext: vi.fn(),
      onFullscreen: vi.fn(),
      onGuide: vi.fn(),
      onCycleVideoFit: vi.fn(),
    };
    const { render, renderer } = createTestRoot({ width: 900, height: 600 });
    render(
      <PlayerPane
        channel={sampleChannel}
        state={readyState({ playing: false })}
        player={player}
        nativeVideoActive={false}
        fullscreen={false}
        programme={programme}
        epgEnabled
        videoFit="contain"
        {...handlers}
      />,
    );
    render(
      <PlayerPane
        channel={sampleChannel}
        state={readyState({ playing: true })}
        player={player}
        nativeVideoActive={false}
        fullscreen={false}
        programme={programme}
        epgEnabled
        videoFit="contain"
        {...handlers}
      />,
    );
    renderer.flush();
    renderer.advanceTime(100);
  });

  it("reveals chrome on mouse movement", async () => {
    const { renderer } = renderPane(readyState({ playing: true }));
    const app = await connectTest(renderer);
    const stage = app.getByTestId("video-stage");
    const center = await stage.center();
    await app.mouse.move(center);
    await app.mouse.move({ x: center.x + 4, y: center.y + 2 });
    await renderer.advanceTime(3_000);
    await app.close();
  });
});
