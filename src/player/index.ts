import {
  ALL_FORMATS,
  AudioSampleSink,
  Input,
  Logging,
  LogLevel,
  VideoSampleSink,
  type AudioSample,
  type InputAudioTrack,
  type InputVideoTrack,
  type VideoSample,
} from "mediabunny";
import { mediaSource } from "../lib/http";

export type PlayerState = {
  status: "idle" | "loading" | "ready" | "error";
  playing: boolean;
  live: boolean;
  /** Whether the seekable window is large enough to rewind into (DVR for live, duration for VOD). */
  seekable: boolean;
  muted: boolean;
  volume: number;
  time: number;
  start: number;
  end: number;
  unix: boolean;
  /**
   * Wall-clock seconds for a media timestamp: `wallClock = mediaTime + unixOffset`.
   * 0 when timestamps are already Unix (HLS with PROGRAM-DATE-TIME mapped to the
   * epoch); derived as `now − liveEdge` for other live streams so a DVR window and
   * EPG programme can be positioned in real time. `null` when there is no wall-clock
   * reference (non-live / VOD).
   */
  unixOffset: number | null;
  width: number;
  height: number;
  framePath: string | null;
  warning: string | null;
  error: string | null;
  channelId: string | null;
};

const IDLE: PlayerState = {
  status: "idle",
  playing: false,
  live: false,
  seekable: false,
  muted: false,
  volume: 0.8,
  time: 0,
  start: 0,
  end: 0,
  unix: false,
  unixOffset: null,
  width: 0,
  height: 0,
  framePath: null,
  warning: null,
  error: null,
  channelId: null,
};

type AudioEngine = {
  currentTime: number;
  sampleRate: number;
  state: string;
  resume: () => Promise<void>;
  close: () => Promise<void>;
  setVolume: (value: number) => void;
  playBuffer: (
    channels: Float32Array[],
    timestamp: number,
    mediaStart: number,
    wallStart: number,
  ) => void;
  stopQueued: () => void;
};

/** Seconds behind the live edge the playhead opens at (and the seek bar pins to). */
export const LIVE_EDGE_BUFFER = 12;

/**
 * Minimum seekable window (seconds) before a *live* stream is treated as
 * rewindable (DVR). `getFirstTimestamp()` reports the first packet still in the
 * playlist and the duration reports the live edge, so `end - first` is the real
 * amount of history the server is holding right now. A plain live stream keeps
 * only a tiny sliding window (roughly the few segments we buffer at the edge),
 * so requiring a window comfortably larger than {@link LIVE_EDGE_BUFFER} avoids
 * offering a seek that would immediately fail, while any genuine DVR window
 * (minutes to hours) clears it easily. VOD is always seekable regardless.
 */
export const LIVE_DVR_MIN_WINDOW = 45;

/** Whether a stream can be rewound: DVR window for live, non-empty duration for VOD. */
export function computeSeekable(live: boolean, start: number, end: number): boolean {
  if (!live) return end > start;
  return end - start >= LIVE_DVR_MIN_WINDOW;
}

/**
 * Wall-clock offset such that `wallClock = mediaTime + offset`. Unix streams need
 * no shift; other live streams anchor the live edge (`end`) to the current wall
 * time, which is accurate to within a segment. `null` for non-live media.
 */
export function computeUnixOffset(
  live: boolean,
  unix: boolean,
  end: number,
  nowMs = Date.now(),
): number | null {
  if (!live) return null;
  if (unix) return 0;
  return nowMs / 1000 - end;
}

/** Seconds of audio to decode ahead of the playhead, to ride through jitter. */
const AUDIO_LOOKAHEAD = 4;

/**
 * Minimum wall time between blitted frames (≈33 fps). GPUIX has no video
 * surface, so each frame is a full-resolution bitmap decoded and uploaded to a
 * GPU texture by the renderer. When a segment arrives, mediabunny decodes a
 * burst of frames whose timestamps are all already due, and presenting every
 * one blits dozens of bitmaps in a few milliseconds — far faster than the
 * display refreshes or the renderer reclaims them, so native image/texture
 * memory balloons into the gigabytes. Pacing to display rate drops the
 * intermediate burst frames (the display could never show them anyway) and
 * keeps only the freshest, which bounds that memory. Real-time playback is
 * unaffected: those frames arrive one display interval apart after a wait.
 */
const MIN_BLIT_INTERVAL_MS = 30;

/** Live segment 404s are retried a few times before surfacing as a hard error. */
const MAX_SEGMENT_RECOVERY_ATTEMPTS = 4;

export function isMissingSegmentError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Error fetching .*: 404\b/.test(message) || /\b404\b.*not found/i.test(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class Clock {
  playing = false;
  mediaTime = 0;
  wallOrigin = 0;
  audio: AudioEngine | null = null;
  audioWallOrigin = 0;

  now(): number {
    if (!this.playing) return this.mediaTime;
    if (this.audio) {
      return this.audio.currentTime - this.audioWallOrigin + this.mediaTime;
    }
    return this.mediaTime + (performance.now() - this.wallOrigin) / 1000;
  }

  play(): void {
    this.wallOrigin = performance.now();
    this.audioWallOrigin = this.audio?.currentTime ?? 0;
    this.playing = true;
  }

  pause(): void {
    this.mediaTime = this.now();
    this.playing = false;
  }

  seek(time: number): void {
    this.mediaTime = time;
    this.wallOrigin = performance.now();
    this.audioWallOrigin = this.audio?.currentTime ?? 0;
  }
}

async function ensureServer(): Promise<void> {
  Logging.level = LogLevel.Silent;
  const { registerMediabunnyServer } = await import("@mediabunny/server");
  registerMediabunnyServer();
}

function explainMediaError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/403|401|forbidden|\.key\b/i.test(message)) {
    return "This stream is encrypted or blocked in this region.";
  }
  if (/Playlist returned empty|502 Playlist Empty/i.test(message)) {
    return "The playlist URL returned no data. The stream may be offline or geo-blocked.";
  }
  if (/unsupported or unrecognizable format/i.test(message)) {
    return "Could not read the playlist. The server may have returned an empty or invalid response.";
  }
  return message;
}

async function createAudioEngine(sampleRate: number): Promise<AudioEngine | null> {
  try {
    const mod = (await import("web-audio-api")) as {
      AudioContext: new (opts?: { sampleRate?: number }) => {
        currentTime: number;
        sampleRate: number;
        state: string;
        destination: unknown;
        resume: () => Promise<void>;
        close: () => Promise<void>;
        createGain: () => {
          gain: { value: number };
          connect: (node: unknown) => void;
        };
        createBuffer: (
          channels: number,
          length: number,
          sampleRate: number,
        ) => {
          copyToChannel: (data: Float32Array, channel: number) => void;
          duration: number;
        };
        createBufferSource: () => {
          buffer: unknown;
          connect: (node: unknown) => void;
          disconnect: () => void;
          start: (when?: number, offset?: number) => void;
          stop: () => void;
          onended: (() => void) | null;
        };
      };
    };
    const ctx = new mod.AudioContext({ sampleRate });
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    const queued = new Set<{ stop: () => void }>();

    return {
      get currentTime() {
        return ctx.currentTime;
      },
      sampleRate: ctx.sampleRate,
      get state() {
        return ctx.state;
      },
      resume: () => ctx.resume(),
      close: () => ctx.close(),
      setVolume: (value: number) => {
        gain.gain.value = value * value;
      },
      playBuffer: (channels, timestamp, mediaStart, wallStart) => {
        const buffer = ctx.createBuffer(channels.length, channels[0]?.length ?? 0, ctx.sampleRate);
        for (let i = 0; i < channels.length; i++) {
          buffer.copyToChannel(channels[i]!, i);
        }
        const node = ctx.createBufferSource();
        node.buffer = buffer;
        node.connect(gain);
        let when = wallStart + timestamp - mediaStart;
        when = Math.round(ctx.sampleRate * when) / ctx.sampleRate;
        if (when >= ctx.currentTime) {
          node.start(when);
        } else {
          node.start(ctx.currentTime, ctx.currentTime - when);
        }
        queued.add(node);
        // Explicitly disconnect on end. `onended` alone drops our own reference,
        // but a finished source that is never disconnected stays wired into the
        // gain node's input list — and if the context's audio loop ever stalls
        // (no output device, backgrounded), `onended` may not fire at all, so
        // every played buffer would linger in the graph. Disconnect guarantees
        // the node (and its PCM buffer) can be collected.
        node.onended = () => {
          queued.delete(node);
          try {
            node.disconnect();
          } catch {
            // already disconnected
          }
        };
      },
      stopQueued: () => {
        for (const node of queued) {
          try {
            node.stop();
          } catch {
            // already stopped
          }
        }
        queued.clear();
      },
    };
  } catch {
    return null;
  }
}

async function sampleChannels(sample: AudioSample): Promise<Float32Array[]> {
  const count = sample.numberOfChannels;
  const channels: Float32Array[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = sample.allocationSize({ planeIndex: i, format: "f32-planar" });
    const plane = new Float32Array(bytes / 4);
    sample.copyTo(plane, { planeIndex: i, format: "f32-planar" });
    channels.push(plane);
  }
  return channels;
}

async function whyUndecodable(
  kind: "Video" | "Audio",
  track: InputVideoTrack | InputAudioTrack,
): Promise<string> {
  const codec = await track.getCodec();
  if (codec === null) return `${kind} codec is unknown.`;
  try {
    const config = await track.getDecoderConfig();
    if (!config) return `${kind} track (${codec}) has no decoder config.`;
  } catch (error) {
    return `${kind} track (${codec}) failed to load: ${explainMediaError(error)}`;
  }
  if (!(await track.canDecode())) {
    return `${kind} track (${codec}) cannot be decoded in this runtime.`;
  }
  return `${kind} track (${codec}) cannot be decoded.`;
}

export class StreamPlayer {
  private generation = 0;
  private input: Input | null = null;
  private videoSink: VideoSampleSink | null = null;
  private audioSink: AudioSampleSink | null = null;
  private audio: AudioEngine | null = null;
  private clock = new Clock();
  private liveRefresh: ReturnType<typeof setTimeout> | null = null;
  private tick: ReturnType<typeof setInterval> | null = null;
  private tracks: Array<InputVideoTrack | InputAudioTrack> = [];
  private videoIterator: AsyncGenerator<VideoSample, void, unknown> | null = null;
  private audioIterator: AsyncGenerator<AudioSample, void, unknown> | null = null;
  private frameListeners = new Set<(path: string | null) => void>();
  private recoveringPlayback = false;
  private segmentRecoveryAttempts = 0;
  private lastBlitWall = 0;
  private nativeSink:
    | ((pixels: Uint8Array, width: number, height: number, stride: number) => void)
    | null = null;
  private unhandledRejectionGuard: ((reason: unknown) => void) | null = null;
  state: PlayerState = { ...IDLE };

  constructor(
    private readonly onState: (state: PlayerState) => void,
    private readonly onFrame: (path: string | null) => void = () => {},
  ) {
    if (typeof process !== "undefined") {
      const guard = (reason: unknown) => {
        if (!isMissingSegmentError(reason)) return;
        void this.handlePlaybackFault(this.generation, reason);
      };
      this.unhandledRejectionGuard = guard;
      process.on("unhandledRejection", guard);
    }
  }

  /**
   * Route decoded frames to a native video surface (README Option A) instead of
   * the `<img>` blit. When set, frames are handed over as raw BGRA and never
   * encoded to a data URL, so the renderer's per-frame image memory is bypassed
   * entirely. Pass null to fall back to the `<img>` path.
   */
  setNativeSink(
    sink: ((pixels: Uint8Array, width: number, height: number, stride: number) => void) | null,
  ): void {
    this.nativeSink = sink;
  }

  subscribeFrame(listener: (path: string | null) => void): () => void {
    this.frameListeners.add(listener);
    listener(this.state.framePath);
    return () => {
      this.frameListeners.delete(listener);
    };
  }

  private emit(patch: Partial<PlayerState> = {}): void {
    this.state = { ...this.state, ...patch, time: this.clock.now() };
    this.onState(this.state);
  }

  private pushFrame(path: string | null): void {
    this.state = { ...this.state, framePath: path, time: this.clock.now() };
    this.onFrame(path);
    for (const listener of this.frameListeners) listener(path);
  }

  async open(
    channelId: string,
    url: string,
    extra: { userAgent?: string; referrer?: string; headers?: Record<string, string> } = {},
  ): Promise<void> {
    await this.resetInternal(false);
    const generation = ++this.generation;
    this.segmentRecoveryAttempts = 0;
    this.emit({
      ...IDLE,
      status: "loading",
      channelId,
      volume: this.state.volume,
      muted: this.state.muted,
      framePath: this.state.framePath,
    });

    try {
      await ensureServer();
      if (generation !== this.generation) return;

      const input = new Input({
        source: mediaSource(url, extra),
        formats: ALL_FORMATS,
      });
      this.input = input;

      const videoTracks = await input.getVideoTracks({
        sortBy: async (track) => -(await track.getDisplayHeight()),
        filter: async (track) => !(await track.hasOnlyKeyPackets()),
      });
      let videoTrack: InputVideoTrack | null =
        videoTracks[0] ?? (await input.getPrimaryVideoTrack());
      let audioTrack: InputAudioTrack | null = videoTrack
        ? await videoTrack.getPrimaryPairableAudioTrack()
        : await input.getPrimaryAudioTrack();

      let warning: string | null = null;

      if (videoTrack) {
        if (!(await videoTrack.canDecode())) {
          warning = await whyUndecodable("Video", videoTrack);
          videoTrack = null;
        }
      } else {
        // No video track (audio-only and similar inputs).
      }
      if (audioTrack) {
        if (!(await audioTrack.canDecode())) {
          warning = [warning, await whyUndecodable("Audio", audioTrack)].filter(Boolean).join(" ");
          audioTrack = null;
        }
      }
      if (!videoTrack && !audioTrack) {
        throw new Error(warning || "No playable audio or video track.");
      }
      if (generation !== this.generation) return;

      const tracks = [videoTrack, audioTrack].filter(
        (track): track is NonNullable<typeof track> => track !== null,
      );
      this.tracks = tracks;

      const liveFlags = await Promise.all(tracks.map((track) => track.isLive()));
      const live = liveFlags.some(Boolean);
      const unix = (await Promise.all(tracks.map((track) => track.isRelativeToUnixEpoch()))).some(
        Boolean,
      );

      const first = Math.max(await input.getFirstTimestamp(tracks), 0);
      let end =
        (await input.getDurationFromMetadata(tracks, { skipLiveWait: true })) ??
        (await input.computeDuration(tracks, { skipLiveWait: true }));
      end = Math.max(first, end);

      const dvrStart = first;
      let playAt = first;
      if (live) {
        const intervals = (
          await Promise.all(tracks.map((track) => track.getLiveRefreshInterval()))
        ).filter((value): value is number => value !== null);
        const interval = intervals.length ? Math.min(...intervals) : 6;
        // Start just behind the live edge: enough buffer to decode without
        // stalling, but close enough that the seek bar pins the thumb to the
        // edge. Seeking left from here walks back into the DVR window.
        playAt = Math.max(first, end - Math.min(1.5 * interval, LIVE_EDGE_BUFFER));
        this.scheduleLiveRefresh(generation, interval);
      } else {
        playAt = first;
      }

      this.clock = new Clock();
      this.clock.seek(playAt);

      this.videoSink = videoTrack
        ? new VideoSampleSink(videoTrack, { optimizeForLatency: true })
        : null;
      this.audioSink = audioTrack ? new AudioSampleSink(audioTrack) : null;

      if (audioTrack) {
        const rate = await audioTrack.getSampleRate();
        this.audio = await createAudioEngine(rate);
        this.clock.audio = this.audio;
        this.audio?.setVolume(this.state.muted ? 0 : this.state.volume);
      }

      const width = videoTrack ? await videoTrack.getDisplayWidth() : 0;
      const height = videoTrack ? await videoTrack.getDisplayHeight() : 0;

      if (this.videoSink) {
        const firstFrame = await this.videoSink.getSample(playAt, { skipLiveWait: true });
        if (firstFrame) {
          if (this.nativeSink) {
            const { sampleToBgra } = await import("./frame");
            const f = await sampleToBgra(firstFrame);
            firstFrame.close();
            if (generation !== this.generation) return;
            this.nativeSink(f.pixels, f.width, f.height, f.stride);
          } else {
            const { sampleToFrameSrc } = await import("./frame");
            const framePath = await sampleToFrameSrc(firstFrame);
            firstFrame.close();
            if (generation !== this.generation) return;
            this.pushFrame(framePath);
          }
        }
      }

      if (generation !== this.generation) return;

      this.emit({
        status: "ready",
        live,
        seekable: computeSeekable(live, dvrStart, end),
        unix,
        unixOffset: computeUnixOffset(live, unix, end),
        start: dvrStart,
        end,
        width,
        height,
        warning,
        error: null,
        playing: false,
      });

      this.tick = setInterval(() => {
        if (this.generation !== generation) return;
        if (this.clock.playing) this.emit();
      }, 100);

      await this.play();
    } catch (error) {
      if (generation !== this.generation) return;
      this.emit({
        status: "error",
        error: explainMediaError(error),
        playing: false,
      });
    }
  }

  private scheduleLiveRefresh(generation: number, interval: number): void {
    const poll = async () => {
      if (this.generation !== generation || !this.input) return;
      try {
        const end =
          (await this.input.getDurationFromMetadata(this.tracks, { skipLiveWait: true })) ??
          (await this.input.computeDuration(this.tracks, { skipLiveWait: true }));
        const first = Math.max(await this.input.getFirstTimestamp(this.tracks), 0);
        if (this.generation !== generation) return;
        const nextEnd = Math.max(first, end);
        this.emit({
          start: first,
          end: nextEnd,
          seekable: computeSeekable(true, first, nextEnd),
          unixOffset: computeUnixOffset(true, this.state.unix, nextEnd),
        });
        const stillLive = await Promise.all(this.tracks.map((track) => track.isLive()));
        if (stillLive.every((value) => !value)) {
          this.emit({
            live: false,
            seekable: computeSeekable(false, first, nextEnd),
            unixOffset: null,
          });
          return;
        }
      } catch {
        // keep the previous end timestamp
      }
      this.liveRefresh = setTimeout(() => void poll(), interval * 1000);
    };
    this.liveRefresh = setTimeout(() => void poll(), interval * 1000);
  }

  async play(): Promise<void> {
    if (this.state.status !== "ready") return;
    if (this.clock.playing) return;

    if (this.audio?.state === "suspended") {
      await this.audio.resume();
    }

    if (
      !this.state.live &&
      this.clock.now() >= this.state.end &&
      this.state.end > this.state.start
    ) {
      this.clock.seek(this.state.start);
    }

    this.clock.play();
    this.emit({ playing: true });
    const generation = this.generation;
    void this.runVideo(generation).catch((error) => this.handlePlaybackFault(generation, error));
    void this.runAudio(generation).catch((error) => this.handlePlaybackFault(generation, error));
  }

  pause(): void {
    if (!this.clock.playing) return;
    this.clock.pause();
    this.audio?.stopQueued();
    void this.videoIterator?.return();
    void this.audioIterator?.return();
    this.videoIterator = null;
    this.audioIterator = null;
    this.emit({ playing: false });
  }

  toggle(): void {
    if (this.clock.playing) this.pause();
    else void this.play();
  }

  async seek(time: number): Promise<void> {
    const clamped = Math.min(Math.max(time, this.state.start), this.state.end);
    const wasPlaying = this.clock.playing;
    this.pause();
    this.clock.seek(clamped);
    this.emit({ time: clamped });
    if (wasPlaying) await this.play();
  }

  async goLive(): Promise<void> {
    if (!this.state.live) return;
    const span = this.state.end - this.state.start;
    const interval = span > 0 ? Math.min(6, Math.max(1.5, span / 8)) : 6;
    await this.seek(Math.max(this.state.start, this.state.end - 1.5 * interval));
  }

  async skip(seconds: number): Promise<void> {
    await this.seek(this.clock.now() + seconds);
  }

  setVolume(volume: number): void {
    const next = Math.min(1, Math.max(0, volume));
    this.audio?.setVolume(this.state.muted ? 0 : next);
    this.emit({ volume: next });
  }

  toggleMute(): void {
    const muted = !this.state.muted;
    this.audio?.setVolume(muted ? 0 : this.state.volume);
    this.emit({ muted });
  }

  private async handlePlaybackFault(generation: number, error: unknown): Promise<void> {
    if (generation !== this.generation || this.recoveringPlayback) return;
    this.recoveringPlayback = true;
    const wasPlaying = this.clock.playing;
    this.pause();

    try {
      if (
        this.state.live &&
        isMissingSegmentError(error) &&
        this.input &&
        this.segmentRecoveryAttempts < MAX_SEGMENT_RECOVERY_ATTEMPTS
      ) {
        this.segmentRecoveryAttempts++;
        const end =
          (await this.input.getDurationFromMetadata(this.tracks, { skipLiveWait: true })) ??
          (await this.input.computeDuration(this.tracks, { skipLiveWait: true }));
        const first = Math.max(await this.input.getFirstTimestamp(this.tracks), 0);
        if (generation !== this.generation) return;
        const playAt = Math.max(first, end - LIVE_EDGE_BUFFER);
        const nextEnd = Math.max(first, end);
        this.clock.seek(playAt);
        this.emit({
          start: first,
          end: nextEnd,
          seekable: computeSeekable(true, first, nextEnd),
          unixOffset: computeUnixOffset(true, this.state.unix, nextEnd),
          time: playAt,
          warning: "Skipped unavailable segment.",
          error: null,
        });
        if (wasPlaying) await this.play();
        this.segmentRecoveryAttempts = 0;
        return;
      }

      if (generation === this.generation) {
        const message = explainMediaError(error);
        if (isMissingSegmentError(error)) {
          this.emit({
            status: "error",
            error: "Stream segment is no longer available.",
            warning: message,
            playing: false,
          });
        } else {
          this.emit({ warning: message, playing: false });
        }
      }
    } catch (recoveryError) {
      if (generation === this.generation) {
        this.emit({
          status: "error",
          error: explainMediaError(recoveryError),
          playing: false,
        });
      }
    } finally {
      this.recoveringPlayback = false;
    }
  }

  private async runVideo(generation: number): Promise<void> {
    if (!this.videoSink) return;
    const { sampleToFrameSrc, sampleToBgra } = await import("./frame");
    const iterator = this.videoSink.samples(this.clock.now());
    this.videoIterator = iterator;
    const stale = () => generation !== this.generation || !this.clock.playing;

    try {
      // Prefetch: request the next frame before encoding the current one, so the
      // decode of frame N+1 overlaps frame N's BMP encode + base64 instead of
      // running strictly after it. That hides the encode latency that otherwise
      // surfaces as an occasional dropped/late frame.
      let current = await iterator.next();
      while (!current.done) {
        const sample = current.value;
        const following = iterator.next();
        let stop = false;
        try {
          if (stale()) {
            stop = true;
          } else {
            const lateBy = this.clock.now() - (sample.timestamp + sample.duration);
            if (lateBy <= Math.max(0.08, sample.duration * 1.5)) {
              const waitMs = (sample.timestamp - this.clock.now()) * 1000 - 2;
              if (waitMs > 1) await sleep(waitMs);
              if (stale()) stop = true;
              // Drop burst frames that land faster than the display rate: they
              // would only pile up as decoded bitmaps in the renderer (see
              // MIN_BLIT_INTERVAL_MS). A frame we actually waited for is always
              // spaced past the interval, so steady playback presents every one.
              else if (performance.now() - this.lastBlitWall >= MIN_BLIT_INTERVAL_MS) {
                if (this.nativeSink) {
                  const f = await sampleToBgra(sample);
                  if (generation === this.generation) {
                    this.lastBlitWall = performance.now();
                    this.nativeSink(f.pixels, f.width, f.height, f.stride);
                  }
                } else {
                  const framePath = await sampleToFrameSrc(sample);
                  if (generation === this.generation) {
                    this.lastBlitWall = performance.now();
                    this.pushFrame(framePath);
                  }
                }
              }
            }
          }
        } finally {
          sample.close();
        }
        if (stop) {
          // Close the frame we prefetched but will not present, so a paused or
          // switched stream never leaks an open decoder sample.
          const pending = await following.catch(() => null);
          if (pending && !pending.done) pending.value.close();
          break;
        }
        current = await following;
      }
    } catch (error) {
      await this.handlePlaybackFault(generation, error);
    } finally {
      // Drop anything the generator hands back after we stopped iterating.
      void iterator.return?.().catch(() => {});
    }
  }

  private async runAudio(generation: number): Promise<void> {
    if (!this.audioSink || !this.audio) return;
    const iterator = this.audioSink.samples(this.clock.now());
    this.audioIterator = iterator;
    try {
      for await (const sample of iterator) {
        if (generation !== this.generation || !this.clock.playing) {
          sample.close();
          break;
        }
        const timestamp = sample.timestamp;
        const channels = await sampleChannels(sample);
        sample.close();
        if (generation !== this.generation || !this.clock.playing) break;
        this.audio.playBuffer(
          channels,
          timestamp,
          this.clock.mediaTime,
          this.clock.audioWallOrigin,
        );
        // Decode well ahead of the playhead and hand the samples to the audio
        // clock, which keeps sounding on its own hardware timeline. A deep lead
        // rides through network jitter and JS-timer throttling (e.g. when the
        // window is in the background) without a dropout.
        if (timestamp - this.clock.now() >= AUDIO_LOOKAHEAD) {
          while (this.clock.playing && timestamp - this.clock.now() >= AUDIO_LOOKAHEAD) {
            await sleep(120);
            if (generation !== this.generation) return;
          }
        }
      }
    } catch (error) {
      await this.handlePlaybackFault(generation, error);
    } finally {
      void iterator.return?.().catch(() => {});
    }
  }

  private async resetInternal(emitIdle: boolean): Promise<void> {
    this.clock.pause();
    this.audio?.stopQueued();
    void this.videoIterator?.return();
    void this.audioIterator?.return();
    this.videoIterator = null;
    this.audioIterator = null;
    if (this.liveRefresh) clearTimeout(this.liveRefresh);
    if (this.tick) clearInterval(this.tick);
    this.liveRefresh = null;
    this.tick = null;
    this.videoSink = null;
    this.audioSink = null;
    this.tracks = [];
    try {
      this.input?.dispose();
    } catch {
      // already closed
    }
    this.input = null;
    try {
      await this.audio?.close();
    } catch {
      // ignore
    }
    this.audio = null;
    this.clock = new Clock();
    if (emitIdle) {
      this.emit({ ...IDLE, volume: this.state.volume, muted: this.state.muted });
      this.pushFrame(null);
    }
  }

  async stop(): Promise<void> {
    this.generation++;
    this.segmentRecoveryAttempts = 0;
    if (this.unhandledRejectionGuard && typeof process !== "undefined") {
      process.off("unhandledRejection", this.unhandledRejectionGuard);
      this.unhandledRejectionGuard = null;
    }
    await this.resetInternal(true);
  }
}
