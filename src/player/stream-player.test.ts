import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { AudioSampleSink, VideoSampleSink } from "mediabunny";

function samplesThatThrow(message: string): AsyncGenerator<never, void, unknown> {
  const iterator = {
    next: async () => {
      throw new Error(message);
    },
    return: async () => ({ done: true as const, value: undefined }),
    [Symbol.asyncIterator]() {
      return this;
    },
  };
  return iterator as unknown as AsyncGenerator<never, void, unknown>;
}

const harness = vi.hoisted(() => {
  type Closable = { close: Mock<() => void> };

  type VideoSampleLike = Closable & { timestamp: number; duration: number };
  type AudioSampleLike = Closable & {
    timestamp: number;
    duration: number;
    numberOfChannels: number;
    allocationSize: (opts: { planeIndex: number; format: string }) => number;
    copyTo: (plane: Float32Array, opts: { planeIndex: number; format: string }) => void;
  };

  type TrackBase = {
    isLive: Mock<() => Promise<boolean>>;
    isRelativeToUnixEpoch: Mock<() => Promise<boolean>>;
    getLiveRefreshInterval: Mock<() => Promise<number | null>>;
    canDecode: Mock<() => Promise<boolean>>;
    getCodec: Mock<() => Promise<string | null>>;
    getDecoderConfig: Mock<() => Promise<object | null>>;
  };

  type VideoTrack = TrackBase & {
    kind: "video";
    getDisplayHeight: Mock<() => Promise<number>>;
    getDisplayWidth: Mock<() => Promise<number>>;
    hasOnlyKeyPackets: Mock<() => Promise<boolean>>;
    getPrimaryPairableAudioTrack: Mock<() => Promise<AudioTrack | null>>;
  };

  type AudioTrack = TrackBase & {
    kind: "audio";
    getSampleRate: Mock<() => Promise<number>>;
  };

  type OpenPlan = {
    throwOn?: Error | string;
    onBeforeThrow?: () => void;
    onVideoTrackFilter?: () => void;
    videoTracks?: VideoTrack[];
    primaryVideo?: VideoTrack | null;
    primaryAudio?: AudioTrack | null;
    firstTimestamp?: number;
    duration?: number | null;
    computeDuration?: number;
    videoSamples?: VideoSampleLike[];
    videoGetSample?: VideoSampleLike | null;
    audioSamples?: AudioSampleLike[];
    disposeThrows?: boolean;
  };

  let plan: OpenPlan = {};

  function makeVideoTrack(overrides: Partial<VideoTrack> = {}): VideoTrack {
    return {
      kind: "video",
      getDisplayHeight: vi.fn(async () => 720),
      getDisplayWidth: vi.fn(async () => 1280),
      hasOnlyKeyPackets: vi.fn(async () => false),
      getPrimaryPairableAudioTrack: vi.fn(async () => null),
      isLive: vi.fn(async () => false),
      isRelativeToUnixEpoch: vi.fn(async () => false),
      getLiveRefreshInterval: vi.fn(async () => null),
      canDecode: vi.fn(async () => true),
      getCodec: vi.fn(async () => "h264"),
      getDecoderConfig: vi.fn(async () => ({})),
      ...overrides,
    };
  }

  function makeAudioTrack(overrides: Partial<AudioTrack> = {}): AudioTrack {
    return {
      kind: "audio",
      getSampleRate: vi.fn(async () => 48_000),
      isLive: vi.fn(async () => false),
      isRelativeToUnixEpoch: vi.fn(async () => false),
      getLiveRefreshInterval: vi.fn(async () => null),
      canDecode: vi.fn(async () => true),
      getCodec: vi.fn(async () => "aac"),
      getDecoderConfig: vi.fn(async () => ({})),
      ...overrides,
    };
  }

  function makeVideoSample(timestamp: number, duration = 0.04): VideoSampleLike {
    return { timestamp, duration, close: vi.fn() };
  }

  function makeAudioSample(timestamp: number, channels = 2, frames = 128): AudioSampleLike {
    const plane = new Float32Array(frames);
    return {
      timestamp,
      duration: frames / 48_000,
      numberOfChannels: channels,
      allocationSize: () => plane.byteLength,
      copyTo: (dest) => {
        dest.set(plane);
      },
      close: vi.fn(),
    };
  }

  async function* samplesFrom<T>(items: T[]): AsyncGenerator<T, void, unknown> {
    for (const item of items) {
      yield item;
    }
  }

  const registerMediabunnyServer = vi.fn();
  const mediaSource = vi.fn((_url: string, _extra?: unknown) => ({ tagged: "source" }));
  const sampleToFrameSrc = vi.fn(async (_sample: unknown) => "data:image/bmp;base64,frame");
  const sampleToBgra = vi.fn(async (_sample: unknown) => ({
    pixels: new Uint8Array([0, 1, 2, 3]),
    width: 2,
    height: 2,
    stride: 8,
  }));

  class VideoSampleSink {
    getSample = vi.fn(async (_time: number) => plan.videoGetSample ?? null);
    samples = vi.fn((_time: number) => samplesFrom(plan.videoSamples ?? []));
    samplesAtTimestamps = vi.fn(async () => []);
  }

  class AudioSampleSink {
    getSample = vi.fn(async (_time: number) => null);
    samples = vi.fn((_time: number) => samplesFrom(plan.audioSamples ?? []));
    samplesAtTimestamps = vi.fn(async () => []);
  }

  class Input {
    dispose = vi.fn(() => {
      if (plan.disposeThrows) throw new Error("already disposed");
    });

    constructor(_opts: unknown) {
      inputs.push(this);
      if (plan.throwOn) {
        plan.onBeforeThrow?.();
        throw plan.throwOn;
      }
    }

    getVideoTracks = vi.fn(
      async (opts?: {
        sortBy?: (track: VideoTrack) => Promise<number>;
        filter?: (track: VideoTrack) => Promise<boolean>;
      }) => {
        if (videoTracksGate.blocked) {
          await new Promise<void>((resolve) => {
            videoTracksGate.release = resolve;
          });
        }
        let tracks = [...(plan.videoTracks ?? [])];
        if (opts?.filter) {
          const kept: VideoTrack[] = [];
          for (const track of tracks) {
            plan.onVideoTrackFilter?.();
            if (await opts.filter(track)) kept.push(track);
          }
          tracks = kept;
        }
        if (opts?.sortBy) {
          const scored = await Promise.all(
            tracks.map(async (track) => ({ track, score: await opts.sortBy!(track) })),
          );
          scored.sort((a, b) => a.score - b.score);
          tracks = scored.map((entry) => entry.track);
        }
        return tracks;
      },
    );
    getPrimaryVideoTrack = vi.fn(async () => plan.primaryVideo ?? null);
    getPrimaryAudioTrack = vi.fn(async () => plan.primaryAudio ?? null);
    getFirstTimestamp = vi.fn(async () => plan.firstTimestamp ?? 0);
    getDurationFromMetadata = vi.fn(async () =>
      plan.duration === undefined ? 120 : plan.duration,
    );
    computeDuration = vi.fn(async () => plan.computeDuration ?? 120);
  }

  const inputs: Input[] = [];

  const audioFlags = { shouldThrow: false };
  let audioCurrentTime = 0;
  const videoTracksGate = {
    blocked: false,
    release: null as (() => void) | null,
  };
  const bufferSources: Array<{ onended: (() => void) | null; start: Mock }> = [];
  let audioContextState = "running";
  const audioResume = vi.fn(async () => {
    audioContextState = "running";
  });

  return {
    planRef: () => plan,
    setPlan: (next: OpenPlan) => {
      plan = next;
    },
    inputs,
    makeVideoTrack,
    makeAudioTrack,
    makeVideoSample,
    makeAudioSample,
    registerMediabunnyServer,
    mediaSource,
    sampleToFrameSrc,
    sampleToBgra,
    VideoSampleSink,
    AudioSampleSink,
    Input,
    ALL_FORMATS: ["mock"],
    Logging: { level: 0 },
    LogLevel: { Silent: 0 },
    audioFlags,
    videoTracksGate,
    bufferSources,
    audioResume,
    setAudioContextShouldThrow: (value: boolean) => {
      audioFlags.shouldThrow = value;
    },
    getAudioContextState: () => audioContextState,
    setAudioContextState: (value: string) => {
      audioContextState = value;
    },
    getAudioCurrentTime: () => audioCurrentTime,
    setAudioCurrentTime: (value: number) => {
      audioCurrentTime = value;
    },
  };
});

vi.mock("@mediabunny/server", () => ({
  registerMediabunnyServer: harness.registerMediabunnyServer,
}));

vi.mock("../lib/http", () => ({
  mediaSource: harness.mediaSource,
}));

vi.mock("./frame", () => ({
  sampleToFrameSrc: harness.sampleToFrameSrc,
  sampleToBgra: harness.sampleToBgra,
}));

vi.mock("web-audio-api", () => ({
  AudioContext: class MockAudioContext {
    sampleRate = 48_000;
    destination = {};

    get currentTime(): number {
      return harness.getAudioCurrentTime();
    }

    get state(): string {
      return harness.getAudioContextState();
    }

    set state(value: string) {
      harness.setAudioContextState(value);
    }

    constructor(_opts?: { sampleRate?: number }) {
      if (harness.audioFlags.shouldThrow) {
        throw new Error("no audio device");
      }
    }

    resume = () => harness.audioResume();

    close = vi.fn(async () => {});

    createGain = vi.fn(() => ({
      gain: { value: 1 },
      connect: vi.fn(),
    }));

    createBuffer = vi.fn((channels: number, length: number, sampleRate: number) => ({
      duration: length / sampleRate,
      copyToChannel: vi.fn(),
    }));

    createBufferSource = vi.fn(() => {
      const node = {
        buffer: null as unknown,
        onended: null as (() => void) | null,
        connect: vi.fn(),
        disconnect: vi.fn(() => {
          throw new Error("already disconnected");
        }),
        start: vi.fn(),
        stop: vi.fn(() => {
          throw new Error("already stopped");
        }),
      };
      harness.bufferSources.push(node);
      return node;
    });
  },
}));

vi.mock("mediabunny", () => ({
  ALL_FORMATS: harness.ALL_FORMATS,
  Logging: harness.Logging,
  LogLevel: harness.LogLevel,
  Input: harness.Input,
  VideoSampleSink: harness.VideoSampleSink,
  AudioSampleSink: harness.AudioSampleSink,
}));

import {
  computeSeekable,
  computeUnixOffset,
  isMissingSegmentError,
  LIVE_DVR_MIN_WINDOW,
  LIVE_EDGE_BUFFER,
  StreamPlayer,
  type PlayerState,
} from "./index";

function lastState(states: PlayerState[]): PlayerState {
  const last = states.at(-1);
  if (!last) throw new Error("no state emitted");
  return last;
}

async function flushMicrotasks(rounds = 20): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
  }
}

async function openDefault(player: StreamPlayer): Promise<void> {
  await player.open("ch-1", "https://example.com/stream.m3u8");
  await flushMicrotasks();
}

describe("StreamPlayer", () => {
  let states: PlayerState[];
  let frames: Array<string | null>;
  let player: StreamPlayer;

  beforeEach(() => {
    vi.useFakeTimers();
    harness.setPlan({});
    harness.inputs.length = 0;
    harness.setAudioContextShouldThrow(false);
    harness.videoTracksGate.blocked = false;
    harness.videoTracksGate.release = null;
    harness.bufferSources.length = 0;
    harness.audioResume.mockClear();
    harness.setAudioContextState("running");
    harness.setAudioCurrentTime(0);
    harness.registerMediabunnyServer.mockClear();
    harness.mediaSource.mockClear();
    harness.sampleToFrameSrc.mockClear();
    harness.sampleToBgra.mockClear();
    states = [];
    frames = [];
    player = new StreamPlayer(
      (s) => states.push({ ...s }),
      (f) => frames.push(f),
    );
  });

  afterEach(async () => {
    await player.stop();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("open", () => {
    it("opens VOD with video and audio, primes first frame, and auto-plays", async () => {
      const video = harness.makeVideoTrack();
      const audio = harness.makeAudioTrack();
      video.getPrimaryPairableAudioTrack.mockResolvedValue(audio);
      const first = harness.makeVideoSample(0);
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        firstTimestamp: 10,
        duration: 310,
        videoGetSample: first,
        videoSamples: [harness.makeVideoSample(10)],
        audioSamples: [harness.makeAudioSample(10)],
      });

      await openDefault(player);

      expect(harness.registerMediabunnyServer).toHaveBeenCalled();
      expect(harness.mediaSource).toHaveBeenCalledWith(
        "https://example.com/stream.m3u8",
        expect.any(Object),
      );
      expect(lastState(states).status).toBe("ready");
      expect(lastState(states).live).toBe(false);
      expect(lastState(states).seekable).toBe(true);
      expect(lastState(states).start).toBe(10);
      expect(lastState(states).end).toBe(310);
      expect(lastState(states).width).toBe(1280);
      expect(lastState(states).height).toBe(720);
      expect(harness.sampleToFrameSrc).toHaveBeenCalled();
      expect(first.close).toHaveBeenCalled();
      expect(lastState(states).playing).toBe(true);
    });

    it("opens live stream, schedules refresh, and positions behind the live edge", async () => {
      const video = harness.makeVideoTrack({
        isLive: vi.fn(async () => true),
        getLiveRefreshInterval: vi.fn(async () => 4),
      });
      const audio = harness.makeAudioTrack({
        isLive: vi.fn(async () => true),
      });
      video.getPrimaryPairableAudioTrack.mockResolvedValue(audio);
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        firstTimestamp: 1000,
        duration: 2000,
        videoSamples: [],
        audioSamples: [],
      });

      await openDefault(player);

      const ready = lastState(states);
      expect(ready.live).toBe(true);
      expect(ready.playing).toBe(true);
      expect(ready.end - ready.start).toBeGreaterThanOrEqual(LIVE_DVR_MIN_WINDOW);
      expect(ready.time).toBeGreaterThanOrEqual(1000);
      expect(ready.time).toBeLessThanOrEqual(2000 - Math.min(1.5 * 4, LIVE_EDGE_BUFFER) + 0.01);

      await vi.advanceTimersByTimeAsync(4000);
      await flushMicrotasks();
      const afterPoll = lastState(states);
      expect(afterPoll.end).toBe(2000);
      expect(afterPoll.seekable).toBe(true);
    });

    it("marks live refresh when tracks are no longer live", async () => {
      let live = true;
      const video = harness.makeVideoTrack({
        isLive: vi.fn(async () => live),
        getLiveRefreshInterval: vi.fn(async () => 2),
      });
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        firstTimestamp: 0,
        duration: 500,
        videoSamples: [],
      });

      await openDefault(player);
      live = false;
      await vi.advanceTimersByTimeAsync(2000);
      await flushMicrotasks();

      expect(lastState(states).live).toBe(false);
      expect(lastState(states).unixOffset).toBeNull();
    });

    it("keeps prior end when live refresh poll fails", async () => {
      const video = harness.makeVideoTrack({
        isLive: vi.fn(async () => true),
        getLiveRefreshInterval: vi.fn(async () => 1),
      });
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        duration: 400,
        videoSamples: [],
      });

      await openDefault(player);
      const input = harness.inputs[0];
      input.getDurationFromMetadata.mockRejectedValueOnce(new Error("poll failed"));

      await vi.advanceTimersByTimeAsync(1000);
      await flushMicrotasks();

      expect(lastState(states).end).toBe(400);
    });

    it("opens audio-only when video is undecodable", async () => {
      const video = harness.makeVideoTrack({
        canDecode: vi.fn(async () => false),
        getCodec: vi.fn(async () => null),
      });
      const audio = harness.makeAudioTrack();
      video.getPrimaryPairableAudioTrack.mockResolvedValue(audio);
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        audioSamples: [harness.makeAudioSample(0)],
      });

      await openDefault(player);

      expect(lastState(states).status).toBe("ready");
      expect(lastState(states).warning).toContain("Video codec is unknown");
      expect(lastState(states).width).toBe(0);
    });

    it("explains undecodable video with codec config failures", async () => {
      const video = harness.makeVideoTrack({
        canDecode: vi.fn(async () => false),
        getCodec: vi.fn(async () => "hev1"),
        getDecoderConfig: vi.fn(async () => {
          throw new Error("403 forbidden key");
        }),
      });
      const audio = harness.makeAudioTrack();
      video.getPrimaryPairableAudioTrack.mockResolvedValue(audio);
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        audioSamples: [harness.makeAudioSample(0)],
      });

      await openDefault(player);

      expect(lastState(states).warning).toContain("encrypted or blocked");
    });

    it("explains undecodable tracks when decoder config is missing", async () => {
      const videoMissing = harness.makeVideoTrack({
        canDecode: vi.fn(async () => false),
        getCodec: vi.fn(async () => "av1"),
        getDecoderConfig: vi.fn(async () => null),
      });
      const audio = harness.makeAudioTrack();
      videoMissing.getPrimaryPairableAudioTrack.mockResolvedValue(audio);
      harness.setPlan({
        videoTracks: [videoMissing],
        primaryVideo: videoMissing,
        audioSamples: [harness.makeAudioSample(0)],
      });

      await openDefault(player);

      expect(lastState(states).warning).toContain("no decoder config");
    });

    it("explains undecodable audio that fails runtime decode checks", async () => {
      const video = harness.makeVideoTrack();
      const audioFail = harness.makeAudioTrack({
        canDecode: vi.fn(async () => false),
        getCodec: vi.fn(async () => "aac"),
        getDecoderConfig: vi.fn(async () => ({})),
      });
      video.getPrimaryPairableAudioTrack.mockResolvedValue(audioFail);
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: null,
        videoSamples: [],
      });

      await openDefault(player);

      expect(lastState(states).warning).toContain("cannot be decoded in this runtime");
    });

    it("falls back to generic undecodable messaging when codec checks flip", async () => {
      let decodeChecks = 0;
      const video = harness.makeVideoTrack({
        canDecode: vi.fn(async () => {
          decodeChecks += 1;
          return decodeChecks >= 2;
        }),
        getCodec: vi.fn(async () => "h264"),
        getDecoderConfig: vi.fn(async () => ({})),
      });
      const audio = harness.makeAudioTrack();
      video.getPrimaryPairableAudioTrack.mockResolvedValue(audio);
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        audioSamples: [harness.makeAudioSample(0)],
      });

      await openDefault(player);

      expect(lastState(states).warning).toContain("cannot be decoded.");
    });

    it("opens video-only when paired audio is undecodable", async () => {
      const video = harness.makeVideoTrack();
      const audio = harness.makeAudioTrack({
        canDecode: vi.fn(async () => false),
        getCodec: vi.fn(async () => "opus"),
        getDecoderConfig: vi.fn(async () => ({})),
      });
      video.getPrimaryPairableAudioTrack.mockResolvedValue(audio);
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoSamples: [harness.makeVideoSample(1)],
        videoGetSample: harness.makeVideoSample(1),
      });

      await openDefault(player);
      expect(lastState(states).status).toBe("ready");
      expect(lastState(states).warning).toContain("Audio");
    });

    it("errors when no playable tracks remain", async () => {
      const video = harness.makeVideoTrack({ canDecode: vi.fn(async () => false) });
      const audio = harness.makeAudioTrack({ canDecode: vi.fn(async () => false) });
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        primaryAudio: audio,
      });

      await openDefault(player);
      expect(lastState(states).status).toBe("error");
      expect(lastState(states).error).toBeTruthy();
    });

    it("maps open failures through explainMediaError", async () => {
      const cases: Array<[Error, string]> = [
        [new Error("HTTP 403 forbidden"), "encrypted or blocked"],
        [new Error("502 Playlist Empty"), "playlist URL returned no data"],
        [new Error("unsupported or unrecognizable format"), "Could not read the playlist"],
        [new Error("network down"), "network down"],
      ];

      for (const [thrown, fragment] of cases) {
        states.length = 0;
        harness.setPlan({ throwOn: thrown });
        await openDefault(player);
        expect(lastState(states).status).toBe("error");
        expect(lastState(states).error?.toLowerCase()).toContain(fragment.toLowerCase());
        await player.stop();
      }
    });

    it("uses native sink for the first frame when configured", async () => {
      const sink = vi.fn();
      player.setNativeSink(sink);
      const video = harness.makeVideoTrack();
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: harness.makeVideoSample(0),
        videoSamples: [],
      });

      await openDefault(player);

      expect(harness.sampleToBgra).toHaveBeenCalled();
      expect(sink).toHaveBeenCalledWith(expect.any(Uint8Array), 2, 2, 8);
      expect(harness.sampleToFrameSrc).not.toHaveBeenCalled();
    });

    it("continues without a primed frame when getSample returns null", async () => {
      const video = harness.makeVideoTrack();
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: null,
        videoSamples: [],
      });

      await openDefault(player);
      expect(lastState(states).status).toBe("ready");
      expect(harness.sampleToFrameSrc).not.toHaveBeenCalled();
    });

    it("aborts open when generation changes mid-flight", async () => {
      const video = harness.makeVideoTrack();
      harness.videoTracksGate.blocked = true;
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: harness.makeVideoSample(0),
        videoSamples: [],
      });

      const openPromise = player.open("x", "url");
      await flushMicrotasks(5);
      await player.stop();
      harness.videoTracksGate.release?.();
      await openPromise;
      await flushMicrotasks();

      expect(states.some((s) => s.status === "ready")).toBe(false);
    });

    it("sorts and filters video tracks from getVideoTracks", async () => {
      const low = harness.makeVideoTrack({
        getDisplayHeight: vi.fn(async () => 480),
      });
      const high = harness.makeVideoTrack({
        getDisplayHeight: vi.fn(async () => 1080),
      });
      low.hasOnlyKeyPackets.mockResolvedValueOnce(true);
      harness.setPlan({
        videoTracks: [low, high],
        videoGetSample: null,
        videoSamples: [],
      });

      await openDefault(player);
      expect(lastState(states).height).toBe(1080);
    });

    it("continues when web-audio-api fails to initialize", async () => {
      harness.setAudioContextShouldThrow(true);
      const video = harness.makeVideoTrack();
      const audio = harness.makeAudioTrack();
      video.getPrimaryPairableAudioTrack.mockResolvedValue(audio);
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: null,
        videoSamples: [],
      });

      await openDefault(player);
      expect(lastState(states).status).toBe("ready");
    });
  });

  describe("playback controls", () => {
    beforeEach(async () => {
      const video = harness.makeVideoTrack();
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        firstTimestamp: 0,
        duration: 60,
        videoGetSample: null,
        videoSamples: [],
        audioSamples: [],
      });
      await openDefault(player);
      player.pause();
      states.length = 0;
    });

    it("play resumes suspended audio and restarts VOD from the start at end", async () => {
      harness.setAudioContextState("suspended");
      player.state = {
        ...player.state,
        end: 10,
        start: 0,
        live: false,
      };
      player["clock"].mediaTime = 10;
      player["clock"].playing = false;

      await player.play();
      expect(lastState(states).playing).toBe(true);
    });

    it("ignores play when not ready or already playing", async () => {
      player.state = { ...player.state, status: "loading" };
      await player.play();
      player.state = { ...player.state, status: "ready" };
      player["clock"].playing = true;
      const before = states.length;
      await player.play();
      expect(states.length).toBe(before);
    });

    it("pause stops iterators and clears playing", async () => {
      player["clock"].playing = true;
      player.pause();
      expect(lastState(states).playing).toBe(false);
    });

    it("toggle switches between play and pause", async () => {
      await player.toggle();
      expect(lastState(states).playing).toBe(true);
      player.toggle();
      expect(lastState(states).playing).toBe(false);
    });

    it("seek clamps time and resumes when previously playing", async () => {
      player["clock"].playing = true;
      await player.seek(999);
      expect(lastState(states).time).toBeLessThanOrEqual(60);
      expect(lastState(states).playing).toBe(true);
    });

    it("goLive seeks near the live edge", async () => {
      player.state = {
        ...player.state,
        live: true,
        start: 100,
        end: 200,
      };
      await player.goLive();
      expect(lastState(states).time).toBeGreaterThan(100);
    });

    it("goLive is a no-op for VOD", async () => {
      const before = player.state.time;
      await player.goLive();
      expect(states.length).toBe(0);
      expect(player.state.time).toBe(before);
    });

    it("skip seeks relative to the clock", async () => {
      player["clock"].mediaTime = 5;
      await player.skip(3);
      expect(lastState(states).time).toBe(8);
    });

    it("setVolume clamps and respects mute", async () => {
      player.setVolume(2);
      expect(lastState(states).volume).toBe(1);
      player.toggleMute();
      player.setVolume(0.5);
      expect(lastState(states).volume).toBe(0.5);
      player.toggleMute();
      expect(lastState(states).muted).toBe(false);
    });
  });

  describe("subscribeFrame and setNativeSink", () => {
    it("notifies subscribers and supports unsubscribe", () => {
      const heard: Array<string | null> = [];
      const unsub = player.subscribeFrame((path) => heard.push(path));
      expect(heard).toEqual([player.state.framePath]);
      player["pushFrame"]("data:frame");
      expect(heard).toContain("data:frame");
      unsub();
      player["pushFrame"]("data:gone");
      expect(heard.filter((v) => v === "data:gone")).toHaveLength(0);
    });
  });

  describe("runVideo loop", () => {
    it("presents frames on the img path and paces blits", async () => {
      const samples = [
        harness.makeVideoSample(0, 0.04),
        harness.makeVideoSample(0.04, 0.04),
        harness.makeVideoSample(0.08, 0.04),
      ];
      const video = harness.makeVideoTrack();
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: null,
        videoSamples: samples,
        audioSamples: [],
      });

      await openDefault(player);
      await vi.advanceTimersByTimeAsync(200);
      await flushMicrotasks(40);

      expect(harness.sampleToFrameSrc.mock.calls.length).toBeGreaterThan(0);
      for (const sample of samples) {
        expect(sample.close).toHaveBeenCalled();
      }
    });

    it("uses native sink during playback and drops burst frames", async () => {
      const sink = vi.fn();
      player.setNativeSink(sink);
      const burst = [
        harness.makeVideoSample(0, 0.001),
        harness.makeVideoSample(0.001, 0.001),
        harness.makeVideoSample(0.002, 0.001),
      ];
      const video = harness.makeVideoTrack();
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: null,
        videoSamples: burst,
      });

      player["lastBlitWall"] = performance.now();
      await openDefault(player);
      await flushMicrotasks(30);

      expect(sink.mock.calls.length).toBeLessThan(burst.length);
    });

    it("skips far-late frames without blitting", async () => {
      const late = harness.makeVideoSample(-5, 0.04);
      const video = harness.makeVideoTrack();
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: null,
        videoSamples: [late],
      });

      await openDefault(player);
      await flushMicrotasks(20);
      expect(harness.sampleToFrameSrc).not.toHaveBeenCalled();
      expect(late.close).toHaveBeenCalled();
    });

    it("closes prefetched sample when stopping mid-loop", async () => {
      const first = harness.makeVideoSample(0, 0.04);
      const second = harness.makeVideoSample(0.04, 0.04);
      const video = harness.makeVideoTrack();
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: null,
        videoSamples: [],
      });
      await openDefault(player);
      player.pause();

      let releaseFrame!: () => void;
      harness.sampleToFrameSrc.mockImplementation(
        () =>
          new Promise<string>((resolve) => {
            releaseFrame = () => resolve("data:image/bmp;base64,hold");
          }),
      );

      player["lastBlitWall"] = performance.now() - 100;
      player["clock"].seek(0);
      player["clock"].play();
      const generation = player["generation"];
      player["videoSink"] = {
        getSample: vi.fn(),
        samples: vi.fn(() =>
          (async function* () {
            yield first;
            yield second;
          })(),
        ),
      } as unknown as VideoSampleSink;

      const runPromise = player["runVideo"](generation);
      await vi.waitUntil(() => harness.sampleToFrameSrc.mock.calls.length > 0);
      player.pause();
      releaseFrame();
      await runPromise;
      await flushMicrotasks(10);
      expect(second.close).toHaveBeenCalled();
    });

    it("routes video iterator errors through handlePlaybackFault", async () => {
      const video = harness.makeVideoTrack();
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: null,
      });

      await openDefault(player);
      player.pause();
      states.length = 0;

      await player["handlePlaybackFault"](player["generation"], new Error("decode boom"));
      expect(lastState(states).warning).toBe("decode boom");
      expect(lastState(states).playing).toBe(false);
    });
  });

  describe("runAudio loop", () => {
    it("queues audio buffers and waits when far ahead of the clock", async () => {
      const audioSamples = [harness.makeAudioSample(0), harness.makeAudioSample(5)];
      const video = harness.makeVideoTrack();
      const audio = harness.makeAudioTrack();
      video.getPrimaryPairableAudioTrack.mockResolvedValue(audio);
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: null,
        videoSamples: [],
        audioSamples,
      });

      await openDefault(player);
      await vi.advanceTimersByTimeAsync(2000);
      await flushMicrotasks(40);

      for (const sample of audioSamples) {
        expect(sample.close).toHaveBeenCalled();
      }
    });

    it("handles audio iterator errors", async () => {
      const video = harness.makeVideoTrack();
      const audio = harness.makeAudioTrack();
      video.getPrimaryPairableAudioTrack.mockResolvedValue(audio);
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: null,
        videoSamples: [],
        audioSamples: [],
      });

      await openDefault(player);
      player.pause();
      states.length = 0;
      await player["handlePlaybackFault"](player["generation"], new Error("audio fault"));
      expect(lastState(states).warning).toBe("audio fault");
    });
  });

  describe("handlePlaybackFault", () => {
    it("recovers live 404 segment errors by seeking to the live edge", async () => {
      const video = harness.makeVideoTrack({
        isLive: vi.fn(async () => true),
        getLiveRefreshInterval: vi.fn(async () => 3),
      });
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        firstTimestamp: 50,
        duration: 120,
        videoSamples: [],
      });

      await openDefault(player);
      player["clock"].playing = true;
      states.length = 0;

      const err = new Error("Error fetching https://cdn/seg.ts: 404 Not Found");
      await player["handlePlaybackFault"](player["generation"], err);

      expect(lastState(states).warning).toBe("Skipped unavailable segment.");
      expect(lastState(states).error).toBeNull();
      expect(lastState(states).playing).toBe(true);
    });

    it("surfaces hard error after max live 404 recovery attempts", async () => {
      const video = harness.makeVideoTrack({ isLive: vi.fn(async () => true) });
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        duration: 80,
        videoSamples: [],
      });

      await openDefault(player);
      player["segmentRecoveryAttempts"] = 4;
      states.length = 0;

      const err = new Error("Error fetching https://cdn/seg.ts: 404 Not Found");
      await player["handlePlaybackFault"](player["generation"], err);

      expect(lastState(states).status).toBe("error");
      expect(lastState(states).error).toBe("Stream segment is no longer available.");
    });

    it("ignores stale generation and re-entrancy", async () => {
      await player["handlePlaybackFault"](player["generation"] - 1, new Error("stale"));
      player["recoveringPlayback"] = true;
      await player["handlePlaybackFault"](player["generation"], new Error("nested"));
      expect(states.at(-1)?.warning).not.toBe("nested");
    });

    it("maps recovery failures to error state", async () => {
      const video = harness.makeVideoTrack({ isLive: vi.fn(async () => true) });
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        duration: 90,
        videoSamples: [],
      });

      await openDefault(player);
      const input = harness.inputs[0];
      input.getDurationFromMetadata.mockRejectedValueOnce(new Error("502 Playlist Empty"));
      states.length = 0;

      await player["handlePlaybackFault"](
        player["generation"],
        new Error("Error fetching seg: 404"),
      );

      expect(lastState(states).status).toBe("error");
      expect(lastState(states).error).toContain("playlist URL returned no data");
    });
  });

  describe("process unhandledRejection guard", () => {
    it("forwards missing-segment rejections into recovery", async () => {
      const emitter = process as NodeJS.Process & EventEmitter;
      const listeners = emitter.listeners("unhandledRejection");
      const video = harness.makeVideoTrack({ isLive: vi.fn(async () => true) });
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        duration: 60,
        videoSamples: [],
      });

      await openDefault(player);
      states.length = 0;

      const guard = listeners.at(-1) as (reason: unknown) => void;
      guard(new Error("Error fetching https://x/seg.ts: 404"));
      await flushMicrotasks(30);

      expect(lastState(states).warning).toBe("Skipped unavailable segment.");
    });

    it("is removed on stop", async () => {
      const off = vi.spyOn(process, "off");
      await player.stop();
      expect(off).toHaveBeenCalledWith("unhandledRejection", expect.any(Function));
      off.mockRestore();
    });
  });

  describe("stop and resetInternal", () => {
    it("returns to idle, clears frame, and tolerates dispose/close failures", async () => {
      const video = harness.makeVideoTrack();
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: null,
        videoSamples: [],
        disposeThrows: true,
      });

      await openDefault(player);
      states.length = 0;
      frames.length = 0;

      await player.stop();

      expect(lastState(states).status).toBe("idle");
      expect(frames.at(-1)).toBeNull();
    });
  });

  describe("edge paths for full coverage", () => {
    it("opens audio-only via primary audio when there is no video track", async () => {
      const audio = harness.makeAudioTrack();
      harness.setPlan({
        videoTracks: [],
        primaryVideo: null,
        primaryAudio: audio,
        audioSamples: [harness.makeAudioSample(0)],
      });

      await openDefault(player);

      expect(lastState(states).status).toBe("ready");
      expect(lastState(states).width).toBe(0);
    });

    it("falls back to computeDuration when metadata duration is missing", async () => {
      const video = harness.makeVideoTrack();
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        duration: null,
        computeDuration: 240,
        videoGetSample: null,
        videoSamples: [],
      });

      await openDefault(player);

      expect(lastState(states).end).toBe(240);
    });

    it("exercises Web Audio scheduling, onended cleanup, and stopQueued", async () => {
      const video = harness.makeVideoTrack();
      const audio = harness.makeAudioTrack();
      video.getPrimaryPairableAudioTrack.mockResolvedValue(audio);
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: null,
        videoSamples: [],
        audioSamples: [],
      });

      await openDefault(player);
      player.pause();

      const engine = player["audio"];
      expect(engine).not.toBeNull();
      harness.setAudioCurrentTime(5);
      const channels = [new Float32Array(64), new Float32Array(64)];
      engine!.playBuffer(channels, 0, 0, 0);
      engine!.playBuffer(channels, 10, 0, 0);
      const ended = harness.bufferSources.at(-1);
      ended?.onended?.();
      engine!.stopQueued();
    });

    it("runs video through native sink during the decode loop", async () => {
      const sink = vi.fn();
      player.setNativeSink(sink);
      const sample = harness.makeVideoSample(0, 0.04);
      const video = harness.makeVideoTrack();
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: null,
        videoSamples: [],
      });
      await openDefault(player);
      player.pause();

      player["lastBlitWall"] = performance.now() - 100;
      player["clock"].seek(0);
      player["clock"].play();
      player["videoSink"] = {
        getSample: vi.fn(),
        samples: vi.fn(() =>
          (async function* () {
            yield sample;
          })(),
        ),
      } as unknown as VideoSampleSink;

      await player["runVideo"](player["generation"]);
      expect(sink).toHaveBeenCalled();
      expect(sample.close).toHaveBeenCalled();
    });

    it("handles runVideo iterator failures", async () => {
      const video = harness.makeVideoTrack();
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: null,
        videoSamples: [],
      });
      await openDefault(player);
      player.pause();
      states.length = 0;

      player["clock"].play();
      player["videoSink"] = {
        getSample: vi.fn(),
        samples: vi.fn(() => ({
          next: vi.fn(async () => {
            throw new Error("video iterator exploded");
          }),
          return: vi.fn(async () => ({ done: true, value: undefined })),
        })),
      } as unknown as VideoSampleSink;

      await player["runVideo"](player["generation"]);
      expect(lastState(states).warning).toBe("video iterator exploded");
    });

    it("closes audio samples when playback stops mid-iterator", async () => {
      const pending = harness.makeAudioSample(0);
      const video = harness.makeVideoTrack();
      const audio = harness.makeAudioTrack();
      video.getPrimaryPairableAudioTrack.mockResolvedValue(audio);
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: null,
        videoSamples: [],
      });
      await openDefault(player);
      player.pause();

      player["clock"].playing = false;
      player["audioSink"] = {
        samples: vi.fn(() =>
          (async function* () {
            yield pending;
          })(),
        ),
      } as unknown as AudioSampleSink;

      await player["runAudio"](player["generation"]);
      expect(pending.close).toHaveBeenCalled();
    });

    it("handles runAudio iterator failures", async () => {
      const video = harness.makeVideoTrack();
      const audio = harness.makeAudioTrack();
      video.getPrimaryPairableAudioTrack.mockResolvedValue(audio);
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: null,
        videoSamples: [],
      });
      await openDefault(player);
      player.pause();
      states.length = 0;

      player["clock"].play();
      player["audioSink"] = {
        samples: vi.fn(() => samplesThatThrow("audio iterator exploded")),
      } as unknown as AudioSampleSink;

      await player["runAudio"](player["generation"]);
      expect(lastState(states).warning).toBe("audio iterator exploded");
    });

    it("ignores unhandled rejections that are not missing segments", async () => {
      const guard = process.listeners("unhandledRejection").at(-1) as (reason: unknown) => void;
      states.length = 0;
      guard(new Error("benign async failure"));
      await flushMicrotasks();
      expect(states.length).toBe(0);
    });

    it("resumes a suspended audio context when playback starts", async () => {
      const video = harness.makeVideoTrack();
      const audio = harness.makeAudioTrack();
      video.getPrimaryPairableAudioTrack.mockResolvedValue(audio);
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: null,
        videoSamples: [],
        audioSamples: [],
      });

      await openDefault(player);
      player.pause();
      harness.setAudioContextState("suspended");
      await player.play();

      expect(harness.audioResume).toHaveBeenCalled();
    });

    it("uses computeDuration in live refresh when metadata duration is absent", async () => {
      const video = harness.makeVideoTrack({
        isLive: vi.fn(async () => true),
        getLiveRefreshInterval: vi.fn(async () => 1),
      });
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        duration: null,
        computeDuration: 180,
        videoSamples: [],
      });

      await openDefault(player);
      const input = harness.inputs[0];
      input.getDurationFromMetadata.mockResolvedValue(null);
      input.computeDuration.mockResolvedValue(220);

      await vi.advanceTimersByTimeAsync(1000);
      await flushMicrotasks();

      expect(lastState(states).end).toBe(220);
    });

    it("aborts live refresh when generation changes during poll", async () => {
      const video = harness.makeVideoTrack({
        isLive: vi.fn(async () => true),
        getLiveRefreshInterval: vi.fn(async () => 1),
      });
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        duration: 300,
        videoSamples: [],
      });

      await openDefault(player);
      const input = harness.inputs[0];
      input.getDurationFromMetadata.mockImplementation(async () => {
        player["generation"] += 1;
        return 999;
      });

      await vi.advanceTimersByTimeAsync(1000);
      await flushMicrotasks();
      expect(states.some((state) => state.end === 999)).toBe(false);
    });

    it("uses computeDuration during segment recovery when metadata is absent", async () => {
      const video = harness.makeVideoTrack({ isLive: vi.fn(async () => true) });
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        duration: 120,
        videoSamples: [],
      });

      await openDefault(player);
      player.pause();
      states.length = 0;

      const input = harness.inputs[0];
      input.getDurationFromMetadata.mockResolvedValue(null);
      input.computeDuration.mockResolvedValue(150);

      await player["handlePlaybackFault"](
        player["generation"],
        new Error("Error fetching https://cdn/seg.ts: 404 Not Found"),
      );

      expect(lastState(states).end).toBe(150);
    });

    it("aborts segment recovery when generation changes mid-recovery", async () => {
      const video = harness.makeVideoTrack({ isLive: vi.fn(async () => true) });
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        duration: 120,
        videoSamples: [],
      });

      await openDefault(player);
      const generation = player["generation"];
      const input = harness.inputs[0];
      input.getDurationFromMetadata.mockImplementation(async () => {
        player["generation"] += 1;
        return 120;
      });

      await player["handlePlaybackFault"](
        generation,
        new Error("Error fetching https://cdn/seg.ts: 404 Not Found"),
      );
      await flushMicrotasks();
      expect(states.some((state) => state.warning === "Skipped unavailable segment.")).toBe(false);
    });
  });

  describe("Clock and constructor", () => {
    it("uses the default onFrame callback when omitted", async () => {
      const localStates: PlayerState[] = [];
      const bare = new StreamPlayer((s) => localStates.push({ ...s }));
      try {
        const video = harness.makeVideoTrack();
        harness.setPlan({
          videoTracks: [video],
          primaryVideo: video,
          videoGetSample: null,
          videoSamples: [],
        });
        await bare.open("ch", "https://example.com/vod.m3u8");
        await flushMicrotasks();
        expect(localStates.some((s) => s.status === "ready")).toBe(true);
      } finally {
        await bare.stop();
      }
    });

    it("advances wall-clock time while playing without audio", async () => {
      const video = harness.makeVideoTrack();
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: null,
        videoSamples: [],
      });
      await openDefault(player);
      player.pause();
      player["clock"].seek(0);
      player["clock"].play();
      player["audio"] = null;
      await vi.advanceTimersByTimeAsync(500);
      expect(player["clock"].now()).toBeGreaterThan(0.4);
    });
  });

  describe("live DVR seekable window", () => {
    it("does not mark short live windows as seekable until refresh widens them", async () => {
      const video = harness.makeVideoTrack({
        isLive: vi.fn(async () => true),
        getLiveRefreshInterval: vi.fn(async () => 6),
      });
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        firstTimestamp: 1000,
        duration: 1000 + LIVE_DVR_MIN_WINDOW - 5,
        videoSamples: [],
      });

      await openDefault(player);
      expect(lastState(states).seekable).toBe(false);
    });

    it("chains live refresh polls while the stream stays live", async () => {
      const video = harness.makeVideoTrack({
        isLive: vi.fn(async () => true),
        getLiveRefreshInterval: vi.fn(async () => 2),
      });
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        duration: 500,
        videoSamples: [],
      });

      await openDefault(player);
      await vi.advanceTimersByTimeAsync(2000);
      await flushMicrotasks();
      await vi.advanceTimersByTimeAsync(2000);
      await flushMicrotasks();

      expect(lastState(states).live).toBe(true);
      expect(lastState(states).end).toBe(500);
    });
  });

  describe("remaining index.ts branches", () => {
    it("maps non-Error open failures through explainMediaError", async () => {
      harness.setPlan({ throwOn: "401 forbidden token" });
      await openDefault(player);
      expect(lastState(states).status).toBe("error");
      expect(lastState(states).error?.toLowerCase()).toContain("encrypted or blocked");
    });

    it("throws the stock message when no tracks exist at all", async () => {
      harness.setPlan({
        videoTracks: [],
        primaryVideo: null,
        primaryAudio: null,
      });

      await openDefault(player);
      expect(lastState(states).status).toBe("error");
      expect(lastState(states).error).toBe("No playable audio or video track.");
    });

    it("aborts open error handling when generation changes before emit", async () => {
      harness.setPlan({
        throwOn: new Error("fail open"),
        onBeforeThrow: () => {
          player["generation"] += 1;
        },
      });
      await player.open("x", "url");
      await flushMicrotasks();
      expect(states.some((s) => s.status === "error" && s.error === "fail open")).toBe(false);
    });

    it("does not tick emit while paused", async () => {
      const video = harness.makeVideoTrack();
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: null,
        videoSamples: [],
      });
      await openDefault(player);
      player.pause();
      const count = states.length;
      await vi.advanceTimersByTimeAsync(300);
      expect(states.length).toBe(count);
    });

    it("ignores stale tick callbacks after generation changes", async () => {
      const video = harness.makeVideoTrack();
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: null,
        videoSamples: [],
      });
      await openDefault(player);
      const count = states.length;
      player["generation"] += 1;
      await vi.advanceTimersByTimeAsync(300);
      expect(states.length).toBe(count);
    });

    it("goLive uses default interval when the DVR span is zero", async () => {
      player.state = { ...player.state, live: true, start: 50, end: 50 };
      await player.goLive();
      expect(lastState(states).time).toBe(50);
    });

    it("setVolume and toggleMute no-op the audio engine when absent", () => {
      player["audio"] = null;
      player.setVolume(0.3);
      expect(lastState(states).volume).toBe(0.3);
      player.toggleMute();
      expect(lastState(states).muted).toBe(true);
    });

    it("aborts priming the first frame when generation changes after decode", async () => {
      const video = harness.makeVideoTrack();
      const first = harness.makeVideoSample(0);
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: first,
        videoSamples: [],
      });

      harness.sampleToFrameSrc.mockImplementation(
        () =>
          new Promise((resolve) => {
            player["generation"] += 1;
            resolve("data:image/bmp;base64,late");
          }),
      );

      await openDefault(player);
      expect(frames).not.toContain("data:image/bmp;base64,late");
    });

    it("waits for due video frames before blitting", async () => {
      const sample = harness.makeVideoSample(1, 0.04);
      const video = harness.makeVideoTrack();
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: null,
        videoSamples: [],
      });
      await openDefault(player);
      player.pause();

      player["lastBlitWall"] = performance.now() - 100;
      player["clock"].seek(0);
      player["clock"].play();
      player["videoSink"] = {
        getSample: vi.fn(),
        samples: vi.fn(() =>
          (async function* () {
            yield sample;
          })(),
        ),
      } as unknown as VideoSampleSink;

      const runPromise = player["runVideo"](player["generation"]);
      await vi.advanceTimersByTimeAsync(2000);
      await runPromise;
      expect(harness.sampleToFrameSrc).toHaveBeenCalled();
      expect(sample.close).toHaveBeenCalled();
    });

    it("swallows a rejected prefetch when stopping the video loop", async () => {
      const first = harness.makeVideoSample(0, 0.04);
      const video = harness.makeVideoTrack();
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: null,
        videoSamples: [],
      });
      await openDefault(player);
      player.pause();

      player["lastBlitWall"] = performance.now() - 100;
      player["clock"].seek(0);
      player["clock"].play();
      const generation = player["generation"];
      player["videoSink"] = {
        getSample: vi.fn(),
        samples: vi.fn(() => ({
          next: vi
            .fn()
            .mockResolvedValueOnce({ done: false, value: first })
            .mockRejectedValueOnce(new Error("prefetch failed")),
          return: vi.fn(async () => ({ done: true, value: undefined })),
        })),
      } as unknown as VideoSampleSink;

      player.pause();
      await player["runVideo"](generation);
      expect(first.close).toHaveBeenCalled();
    });

    it("swallows iterator.return rejections from runVideo and runAudio", async () => {
      const video = harness.makeVideoTrack();
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: null,
        videoSamples: [],
      });
      await openDefault(player);
      player.pause();

      player["clock"].play();
      player["videoSink"] = {
        getSample: vi.fn(),
        samples: vi.fn(() => ({
          next: vi.fn(async () => ({ done: true, value: undefined })),
          return: vi.fn(async () => {
            throw new Error("return failed");
          }),
        })),
      } as unknown as VideoSampleSink;

      await player["runVideo"](player["generation"]);

      player["clock"].play();
      player["audioSink"] = {
        samples: vi.fn(() => ({
          [Symbol.asyncIterator]() {
            return {
              next: async () => ({ done: true, value: undefined as never }),
              return: async () => {
                throw new Error("audio return failed");
              },
            };
          },
        })),
      } as unknown as AudioSampleSink;

      await player["runAudio"](player["generation"]);
    });

    it("stops runAudio after sampleChannels when generation changes", async () => {
      const pending = harness.makeAudioSample(0);
      const video = harness.makeVideoTrack();
      const audio = harness.makeAudioTrack();
      video.getPrimaryPairableAudioTrack.mockResolvedValue(audio);
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: null,
        videoSamples: [],
      });
      await openDefault(player);
      player.pause();

      const generation = player["generation"];
      player["clock"].playing = true;
      player["audioSink"] = {
        samples: vi.fn(() =>
          (async function* () {
            yield pending;
          })(),
        ),
      } as unknown as AudioSampleSink;

      const runPromise = player["runAudio"](generation);
      await flushMicrotasks(5);
      player["generation"] += 1;
      await runPromise;
      expect(pending.close).toHaveBeenCalled();
    });

    it("exits the audio lookahead loop when generation changes", async () => {
      const far = harness.makeAudioSample(100);
      const video = harness.makeVideoTrack();
      const audio = harness.makeAudioTrack();
      video.getPrimaryPairableAudioTrack.mockResolvedValue(audio);
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: null,
        videoSamples: [],
      });
      await openDefault(player);
      player.pause();

      player["clock"].playing = true;
      player["clock"].seek(0);
      const generation = player["generation"];
      player["audioSink"] = {
        samples: vi.fn(() =>
          (async function* () {
            yield far;
          })(),
        ),
      } as unknown as AudioSampleSink;

      const runPromise = player["runAudio"](generation);
      await flushMicrotasks(20);
      player["generation"] += 1;
      await vi.advanceTimersByTimeAsync(500);
      await runPromise;
      expect(far.close).toHaveBeenCalled();
    });

    it("ignores stale handlePlaybackFault emissions for other generations", async () => {
      const video = harness.makeVideoTrack();
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: null,
        videoSamples: [],
      });
      await openDefault(player);
      states.length = 0;
      await player["handlePlaybackFault"](player["generation"] + 99, new Error("late fault"));
      expect(states.length).toBe(0);
    });

    it("routes runVideo faults through play().catch when emit throws", async () => {
      let failFaultEmit = false;
      const fragileStates: PlayerState[] = [];
      const fragile = new StreamPlayer((s) => {
        if (failFaultEmit && s.warning === "video fault for catch") {
          throw new Error("emit exploded");
        }
        fragileStates.push({ ...s });
      });
      const video = harness.makeVideoTrack();
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: null,
        videoSamples: [],
      });
      await fragile.open("ch", "https://example.com/vod.m3u8");
      await flushMicrotasks();
      fragile.pause();

      fragile["videoSink"] = {
        getSample: vi.fn(),
        samples: vi.fn(() => ({
          next: vi.fn(async () => {
            throw new Error("video fault for catch");
          }),
          return: vi.fn(async () => ({ done: true, value: undefined })),
        })),
      } as unknown as VideoSampleSink;

      failFaultEmit = true;
      await fragile.play();
      await flushMicrotasks(30);
      failFaultEmit = false;
      await fragile.stop();
    });

    it("uses default live refresh interval when tracks omit one", async () => {
      const video = harness.makeVideoTrack({
        isLive: vi.fn(async () => true),
        getLiveRefreshInterval: vi.fn(async () => null),
      });
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        firstTimestamp: 0,
        duration: 200,
        videoSamples: [],
      });

      await openDefault(player);
      expect(lastState(states).live).toBe(true);
      expect(lastState(states).time).toBeLessThanOrEqual(
        200 - Math.min(9, LIVE_EDGE_BUFFER) + 0.01,
      );
    });

    it("schedules audio buffers in the past via offset start", async () => {
      const video = harness.makeVideoTrack();
      const audio = harness.makeAudioTrack();
      video.getPrimaryPairableAudioTrack.mockResolvedValue(audio);
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: null,
        videoSamples: [],
        audioSamples: [],
      });
      await openDefault(player);
      player.pause();

      const engine = player["audio"];
      expect(engine).not.toBeNull();
      harness.setAudioCurrentTime(2);
      engine!.playBuffer([new Float32Array(32)], 0, 0, 0);
      const node = harness.bufferSources.at(-1);
      expect(node?.start).toHaveBeenCalled();
    });

    it("covers exported helpers used by the player", () => {
      expect(isMissingSegmentError("segment 404 not found")).toBe(true);
      expect(isMissingSegmentError(new Error("network timeout"))).toBe(false);
      expect(computeUnixOffset(true, true, 500)).toBe(0);
      expect(computeUnixOffset(false, false, 100)).toBeNull();
      expect(computeSeekable(false, 0, 0)).toBe(false);
      expect(computeSeekable(true, 0, LIVE_DVR_MIN_WINDOW)).toBe(true);
    });

    it("keeps a decodable video track and VOD playAt at the first timestamp", async () => {
      const canDecode = vi.fn(async () => true);
      const video = harness.makeVideoTrack({
        isLive: vi.fn(async () => false),
        canDecode,
      });
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        firstTimestamp: 42,
        duration: 200,
        videoGetSample: null,
        videoSamples: [],
      });

      await openDefault(player);

      expect(canDecode).toHaveBeenCalledTimes(1);
      expect(lastState(states).live).toBe(false);
      expect(lastState(states).status).toBe("ready");
      expect(player["clock"].mediaTime).toBe(42);
    });

    it("opens with unix epoch live timestamps", async () => {
      const video = harness.makeVideoTrack({
        isLive: vi.fn(async () => true),
        isRelativeToUnixEpoch: vi.fn(async () => true),
        getLiveRefreshInterval: vi.fn(async () => 2),
      });
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        duration: 500,
        videoSamples: [],
      });
      await openDefault(player);
      expect(lastState(states).unix).toBe(true);
      expect(lastState(states).unixOffset).toBe(0);
    });

    it("aborts open after track checks when generation changes before tracks are stored", async () => {
      const video = harness.makeVideoTrack();
      const audio = harness.makeAudioTrack();
      video.getPrimaryPairableAudioTrack.mockResolvedValue(audio);
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: null,
        videoSamples: [],
        onVideoTrackFilter: () => {
          player["generation"] += 1;
        },
      });

      await player.open("ch", "https://example.com/stream.m3u8");
      await flushMicrotasks();
      expect(states.some((s) => s.status === "ready")).toBe(false);
    });

    it("throws the audio warning when primary audio is undecodable and there is no video", async () => {
      const audio = harness.makeAudioTrack({
        canDecode: vi.fn(async () => false),
        getCodec: vi.fn(async () => "aac"),
        getDecoderConfig: vi.fn(async () => ({})),
      });
      harness.setPlan({
        videoTracks: [],
        primaryVideo: null,
        primaryAudio: audio,
      });

      await openDefault(player);
      expect(lastState(states).status).toBe("error");
      expect(lastState(states).error).toContain("Audio");
      expect(lastState(states).error).not.toBe("No playable audio or video track.");
    });

    it("throws the undecodable warning text when every track is rejected", async () => {
      const video = harness.makeVideoTrack({
        canDecode: vi.fn(async () => false),
        getCodec: vi.fn(async () => "h264"),
        getDecoderConfig: vi.fn(async () => ({})),
      });
      video.getPrimaryPairableAudioTrack.mockResolvedValue(null);
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        primaryAudio: null,
      });

      await openDefault(player);
      expect(lastState(states).status).toBe("error");
      expect(lastState(states).error).toContain("cannot be decoded");
      expect(lastState(states).error).not.toBe("No playable audio or video track.");
    });

    it("applies stored mute when opening with audio", async () => {
      player.state = { ...player.state, muted: true, volume: 0.6 };
      const video = harness.makeVideoTrack();
      const audio = harness.makeAudioTrack();
      video.getPrimaryPairableAudioTrack.mockResolvedValue(audio);
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: null,
        videoSamples: [],
        audioSamples: [],
      });
      await openDefault(player);
      expect(lastState(states).status).toBe("ready");
    });

    it("aborts native first-frame blit when generation changes after BGRA decode", async () => {
      const sink = vi.fn();
      player.setNativeSink(sink);
      const video = harness.makeVideoTrack();
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: harness.makeVideoSample(0),
        videoSamples: [],
      });
      harness.sampleToBgra.mockImplementation(async () => {
        player["generation"] += 1;
        return {
          pixels: new Uint8Array(4),
          width: 1,
          height: 1,
          stride: 4,
        };
      });

      await openDefault(player);
      expect(sink).not.toHaveBeenCalled();
      expect(states.some((s) => s.status === "ready")).toBe(false);
    });

    it("aborts ready emit when generation changes after priming the img frame", async () => {
      const video = harness.makeVideoTrack();
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: harness.makeVideoSample(0),
        videoSamples: [],
      });
      harness.sampleToFrameSrc.mockImplementation(async () => "data:image/bmp;base64,primed");
      const framedStates: PlayerState[] = [];
      const framed = new StreamPlayer(
        (s) => framedStates.push({ ...s }),
        () => {
          framed["generation"] += 1;
        },
      );

      await framed.open("ch", "https://example.com/stream.m3u8");
      await flushMicrotasks();
      expect(framedStates.some((s) => s.status === "ready")).toBe(false);
      await framed.stop();
    });

    it("skips live refresh poll when generation or input is gone", async () => {
      const video = harness.makeVideoTrack({
        isLive: vi.fn(async () => true),
        getLiveRefreshInterval: vi.fn(async () => 1),
      });
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        duration: 300,
        videoSamples: [],
      });
      await openDefault(player);
      const input = harness.inputs[0];
      const callsBefore = input.getDurationFromMetadata.mock.calls.length;
      player["generation"] += 1;
      await vi.advanceTimersByTimeAsync(1000);
      await flushMicrotasks();
      expect(input.getDurationFromMetadata.mock.calls.length).toBe(callsBefore);
    });

    it("setVolume forwards level to the audio engine when unmuted", async () => {
      const video = harness.makeVideoTrack();
      const audio = harness.makeAudioTrack();
      video.getPrimaryPairableAudioTrack.mockResolvedValue(audio);
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: null,
        videoSamples: [],
        audioSamples: [],
      });
      await openDefault(player);
      player.pause();
      player.setVolume(0.75);
      expect(lastState(states).volume).toBe(0.75);
      expect(lastState(states).muted).toBe(false);
    });

    it("setVolume respects mute while the audio engine is active", async () => {
      const video = harness.makeVideoTrack();
      const audio = harness.makeAudioTrack();
      video.getPrimaryPairableAudioTrack.mockResolvedValue(audio);
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: null,
        videoSamples: [],
        audioSamples: [],
      });
      await openDefault(player);
      player.pause();
      player.toggleMute();
      player.setVolume(0.4);
      expect(lastState(states).volume).toBe(0.4);
      expect(lastState(states).muted).toBe(true);
    });

    it("setVolume and toggleMute drive the audio engine when present", async () => {
      const video = harness.makeVideoTrack();
      const audio = harness.makeAudioTrack();
      video.getPrimaryPairableAudioTrack.mockResolvedValue(audio);
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: null,
        videoSamples: [],
        audioSamples: [],
      });
      await openDefault(player);
      player.pause();
      player.toggleMute();
      player.setVolume(0.25);
      player.toggleMute();
      expect(lastState(states).muted).toBe(false);
      expect(lastState(states).volume).toBe(0.25);
    });

    it("does not emit fault state when generation changes during pause in handlePlaybackFault", async () => {
      const video = harness.makeVideoTrack();
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: null,
        videoSamples: [],
      });
      await openDefault(player);
      const generation = player["generation"];
      const pauseSpy = vi.spyOn(player, "pause").mockImplementation(() => {
        player["generation"] += 1;
      });
      states.length = 0;
      await player["handlePlaybackFault"](generation, new Error("plain fault"));
      pauseSpy.mockRestore();
      expect(states.length).toBe(0);
    });

    it("does not emit when generation changes before recovery catch runs", async () => {
      const video = harness.makeVideoTrack({ isLive: vi.fn(async () => true) });
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        duration: 120,
        videoSamples: [],
      });
      await openDefault(player);
      const generation = player["generation"];
      const input = harness.inputs[0];
      input.getDurationFromMetadata.mockImplementation(async () => {
        player["generation"] += 1;
        throw new Error("502 Playlist Empty");
      });
      states.length = 0;
      await player["handlePlaybackFault"](
        generation,
        new Error("Error fetching seg.ts: 404 Not Found"),
      );
      expect(states.some((s) => s.status === "error")).toBe(false);
    });

    it("stops video after a scheduled wait when playback goes stale", async () => {
      const sample = harness.makeVideoSample(0.05, 0.04);
      const video = harness.makeVideoTrack();
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: null,
        videoSamples: [],
      });
      await openDefault(player);
      player.pause();

      player["lastBlitWall"] = performance.now() - 100;
      player["clock"].seek(0);
      player["clock"].play();
      const generation = player["generation"];
      player["videoSink"] = {
        getSample: vi.fn(),
        samples: vi.fn(() =>
          (async function* () {
            yield sample;
          })(),
        ),
      } as unknown as VideoSampleSink;

      const runPromise = player["runVideo"](generation);
      await vi.advanceTimersByTimeAsync(5);
      player.pause();
      await vi.advanceTimersByTimeAsync(50);
      await runPromise;
      expect(sample.close).toHaveBeenCalled();
      expect(harness.sampleToFrameSrc).not.toHaveBeenCalled();
    });

    it("drops native blit when generation changes after BGRA decode in the loop", async () => {
      const sink = vi.fn();
      player.setNativeSink(sink);
      const sample = harness.makeVideoSample(0, 0.04);
      const video = harness.makeVideoTrack();
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: null,
        videoSamples: [],
      });
      await openDefault(player);
      player.pause();

      harness.sampleToBgra.mockImplementation(async () => {
        player["generation"] += 1;
        return {
          pixels: new Uint8Array(4),
          width: 1,
          height: 1,
          stride: 4,
        };
      });
      player["lastBlitWall"] = performance.now() - 100;
      player["clock"].seek(0);
      player["clock"].play();
      player["videoSink"] = {
        getSample: vi.fn(),
        samples: vi.fn(() =>
          (async function* () {
            yield sample;
          })(),
        ),
      } as unknown as VideoSampleSink;

      const generation = player["generation"];
      await player["runVideo"](generation);
      expect(sink).not.toHaveBeenCalled();
    });

    it("closes a prefetched frame when stopping before the wait path", async () => {
      const first = harness.makeVideoSample(0, 0.04);
      const second = harness.makeVideoSample(0.04, 0.04);
      const video = harness.makeVideoTrack();
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: null,
        videoSamples: [],
      });
      await openDefault(player);
      player.pause();

      player["clock"].playing = true;
      const generation = player["generation"];
      player["videoSink"] = {
        getSample: vi.fn(),
        samples: vi.fn(() =>
          (async function* () {
            yield first;
            yield second;
          })(),
        ),
      } as unknown as VideoSampleSink;

      const runPromise = player["runVideo"](generation);
      await flushMicrotasks(5);
      player.pause();
      await runPromise;
      expect(second.close).toHaveBeenCalled();
    });

    it("breaks runAudio after sampleChannels when generation changes", async () => {
      const pending = harness.makeAudioSample(0);
      pending.copyTo = () => {
        player["generation"] += 1;
      };
      const video = harness.makeVideoTrack();
      const audio = harness.makeAudioTrack();
      video.getPrimaryPairableAudioTrack.mockResolvedValue(audio);
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: null,
        videoSamples: [],
      });
      await openDefault(player);
      player.pause();

      player["clock"].playing = true;
      const generation = player["generation"];
      player["audioSink"] = {
        samples: vi.fn(() =>
          (async function* () {
            yield pending;
          })(),
        ),
      } as unknown as AudioSampleSink;

      await player["runAudio"](generation);
      expect(pending.close).toHaveBeenCalled();
    });

    it("routes runAudio rejections through play().catch", async () => {
      const fragileStates: PlayerState[] = [];
      const fragile = new StreamPlayer((s) => fragileStates.push({ ...s }));
      const video = harness.makeVideoTrack();
      const audio = harness.makeAudioTrack();
      video.getPrimaryPairableAudioTrack.mockResolvedValue(audio);
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: null,
        videoSamples: [],
        audioSamples: [],
      });
      await fragile.open("ch", "https://example.com/vod.m3u8");
      await flushMicrotasks();
      fragile.pause();

      fragile["audioSink"] = {
        samples: vi.fn(() => samplesThatThrow("audio fault for catch")),
      } as unknown as AudioSampleSink;

      const faultSpy = vi
        .spyOn(fragile, "handlePlaybackFault")
        .mockRejectedValueOnce(new Error("fault handler blew up"));
      await fragile.play();
      await flushMicrotasks(30);
      faultSpy.mockRestore();
      fragile.pause();
      await fragile.stop();
    });

    it("invokes runAudio iterator.return when breaking out of the loop", async () => {
      const pending = harness.makeAudioSample(0);
      const video = harness.makeVideoTrack();
      const audio = harness.makeAudioTrack();
      video.getPrimaryPairableAudioTrack.mockResolvedValue(audio);
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: null,
        videoSamples: [],
      });
      await openDefault(player);
      player.pause();

      async function* oneSample() {
        yield pending;
      }
      const iterator = oneSample();
      const returnSpy = vi
        .spyOn(iterator, "return")
        .mockRejectedValueOnce(new Error("audio return failed"));
      player["clock"].playing = true;
      player["audioSink"] = {
        samples: vi.fn(() => iterator),
      } as unknown as AudioSampleSink;

      await player["runAudio"](player["generation"] - 1);
      expect(returnSpy).toHaveBeenCalled();
      player["audioIterator"] = null;
    });

    it("swallows a rejected runAudio iterator.return in finally", async () => {
      const video = harness.makeVideoTrack();
      const audio = harness.makeAudioTrack();
      video.getPrimaryPairableAudioTrack.mockResolvedValue(audio);
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: null,
        videoSamples: [],
      });
      await openDefault(player);
      player.pause();

      async function* empty() {}
      const iterator = empty();
      vi.spyOn(iterator, "return").mockRejectedValueOnce(new Error("return failed"));
      player["clock"].playing = true;
      player["audioSink"] = {
        samples: vi.fn(() => iterator),
      } as unknown as AudioSampleSink;

      await player["runAudio"](player["generation"]);
      player["audioIterator"] = null;
    });

    it("plays audio buffers with zero-length channel data", async () => {
      const video = harness.makeVideoTrack();
      const audio = harness.makeAudioTrack();
      video.getPrimaryPairableAudioTrack.mockResolvedValue(audio);
      harness.setPlan({
        videoTracks: [video],
        primaryVideo: video,
        videoGetSample: null,
        videoSamples: [],
      });
      await openDefault(player);
      player.pause();
      const engine = player["audio"];
      expect(engine).not.toBeNull();
      engine!.playBuffer([], 0, 0, 0);
    });

    it("omits the unhandledRejection guard when process is unavailable", async () => {
      const originalProcess = globalThis.process;
      vi.stubGlobal("process", undefined);
      try {
        const local = new StreamPlayer(() => {});
        expect(local["unhandledRejectionGuard"]).toBeNull();
        await local.stop();
      } finally {
        vi.stubGlobal("process", originalProcess);
      }
    });
  });
});
