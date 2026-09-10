import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  compileDylib,
  dlopenVideoLayer,
  loadNativeVideo,
  loadNativeVideoWithDeps,
  nativeVideoSupported,
  resetNativeVideoCache,
  setNativeVideoCacheForTests,
  setPlaybackActive,
  sourcePath,
  videoFitMode,
  type NativeVideo,
  type VideoFit,
} from "./native-video";

describe("videoFitMode", () => {
  it("maps fit modes to native integers", () => {
    const modes: VideoFit[] = ["contain", "cover", "fill"];
    expect(modes.map(videoFitMode)).toEqual([0, 1, 2]);
  });
});

describe("sourcePath and compileDylib", () => {
  it("finds the bundled swift source in the repo", () => {
    const path = sourcePath();
    expect(path.endsWith(join("darwin", "video-layer.swift"))).toBe(true);
    expect(existsSync(path)).toBe(true);
  });

  it("skips swiftc when the dylib is already built", () => {
    const dir = mkdtempSync(join(tmpdir(), "gpiux-dylib-"));
    const swift = join(dir, "video-layer.swift");
    const source = "print(1)";
    writeFileSync(swift, source);
    const key = createHash("sha1").update(source).digest("hex").slice(0, 16);
    const dylib = join(dir, `libvideolayer-${key}.dylib`);
    writeFileSync(dylib, "dylib");
    const exec = vi.fn();
    expect(compileDylib(swift, { tmpRoot: dir, execFileSync: exec })).toBe(dylib);
    expect(exec).not.toHaveBeenCalled();
  });
});

describe("loadNativeVideoWithDeps", () => {
  afterEach(() => {
    resetNativeVideoCache();
    vi.unstubAllEnvs();
  });

  it("returns null off darwin", () => {
    expect(
      loadNativeVideoWithDeps({
        platform: "linux",
        hasBun: true,
        swiftPath: "/x.swift",
        swiftExists: true,
        compile: () => "/x.dylib",
        dlopen: vi.fn(),
      }),
    ).toBeNull();
  });

  it("returns a native surface when ffi succeeds", () => {
    const symbols = {
      gpiux_video_attach: vi.fn(() => 1),
      gpiux_video_detach: vi.fn(),
      gpiux_video_set_rect: vi.fn(),
      gpiux_video_set_hidden: vi.fn(),
      gpiux_video_set_fit: vi.fn(),
      gpiux_video_present: vi.fn(),
      gpiux_video_set_playing: vi.fn(),
      gpiux_video_debug: vi.fn(() => "ok"),
    };
    const surface = loadNativeVideoWithDeps({
      platform: "darwin",
      hasBun: true,
      swiftPath: "/x.swift",
      swiftExists: true,
      compile: () => "/x.dylib",
      dlopen: () => ({ symbols }),
    });
    expect(surface?.attach()).toBe(true);
    surface?.detach();
    surface?.setRect(0, 0, 10, 10);
    surface?.setHidden(true);
    surface?.setFit(2);
    surface?.present(new Uint8Array(4), 1, 1, 4);
    surface?.setPlaying(true);
    expect(surface?.debug()).toBe("ok");
    expect(symbols.gpiux_video_set_hidden).toHaveBeenCalledWith(1);
  });

  it("returns null without Bun", () => {
    expect(
      loadNativeVideoWithDeps({
        platform: "darwin",
        hasBun: false,
        swiftPath: "/x.swift",
        swiftExists: true,
        compile: () => "/x.dylib",
        dlopen: vi.fn(),
      }),
    ).toBeNull();
  });

  it("returns null when ffi fails", () => {
    expect(
      loadNativeVideoWithDeps({
        platform: "darwin",
        hasBun: true,
        swiftPath: "/x.swift",
        swiftExists: true,
        compile: () => {
          throw new Error("compile");
        },
        dlopen: vi.fn(),
      }),
    ).toBeNull();
  });
});

describe("loadNativeVideo cache", () => {
  afterEach(() => {
    resetNativeVideoCache();
    vi.unstubAllEnvs();
  });

  it("honours env disables", () => {
    vi.stubEnv("VITEST", "true");
    expect(nativeVideoSupported()).toBe(false);
    expect(setPlaybackActive(true)).toBeUndefined();
  });

  it("returns null when swift source is missing", () => {
    vi.stubEnv("VITEST", "0");
    vi.stubEnv("STREAMER_NATIVE_VIDEO", "0");
    expect(nativeVideoSupported()).toBe(false);
    resetNativeVideoCache();
    vi.stubEnv("STREAMER_NATIVE_VIDEO", "1");
    const missing = loadNativeVideoWithDeps({
      platform: "darwin",
      hasBun: true,
      swiftPath: join(tmpdir(), "missing.swift"),
      swiftExists: false,
      compile: vi.fn(),
      dlopen: vi.fn(),
    });
    expect(missing).toBeNull();
  });

  it("memoizes loadNativeVideo", () => {
    resetNativeVideoCache();
    const first = loadNativeVideo();
    const second = loadNativeVideo();
    expect(first).toBe(second);
  });

  it("reports support and playback when not in vitest", () => {
    const playing = vi.fn();
    setNativeVideoCacheForTests({ setPlaying: playing } as NativeVideo);
    vi.stubEnv("VITEST", "0");
    vi.stubEnv("STREAMER_NATIVE_VIDEO", "1");
    expect(nativeVideoSupported()).toBe(true);
    setPlaybackActive(true);
    expect(playing).toHaveBeenCalledWith(true);
  });
});

describe("dlopenVideoLayer", () => {
  it("loads symbols from bun:ffi", () => {
    const symbols = {
      gpiux_video_attach: () => 1,
      gpiux_video_detach: () => {},
      gpiux_video_set_rect: () => {},
      gpiux_video_set_hidden: () => {},
      gpiux_video_set_fit: () => {},
      gpiux_video_present: () => {},
      gpiux_video_set_playing: () => {},
      gpiux_video_debug: () => "ffi",
    };
    const loaded = dlopenVideoLayer("/tmp/lib.dylib", () => ({
      dlopen: () => ({ symbols }),
      FFIType: { i32: "i32", f64: "f64", ptr: "ptr", void: "void", cstring: "cstring" },
    }));
    expect(loaded.symbols.gpiux_video_debug()).toBe("ffi");
  });
});
