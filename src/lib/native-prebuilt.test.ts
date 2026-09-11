import { describe, expect, it } from "vitest";
import {
  NATIVE_DIR_ENV,
  NATIVE_DYLIBS,
  prebuiltDylibPath,
  swiftcArgs,
  VIDEO_LAYER_DYLIB,
  WINDOW_FULLSCREEN_DYLIB,
} from "./native-prebuilt";

describe("swiftcArgs", () => {
  it("emits a library and expands each framework flag", () => {
    const args = swiftcArgs("/src/video.swift", "/out/video.dylib", ["AppKit", "AVFoundation"]);
    expect(args).toEqual([
      "-O",
      "-swift-version",
      "5",
      "-emit-library",
      "-o",
      "/out/video.dylib",
      "/src/video.swift",
      "-framework",
      "AppKit",
      "-framework",
      "AVFoundation",
    ]);
  });
});

describe("NATIVE_DYLIBS", () => {
  it("lists both Swift dylibs with distinct outputs", () => {
    expect(NATIVE_DYLIBS).toContain(VIDEO_LAYER_DYLIB);
    expect(NATIVE_DYLIBS).toContain(WINDOW_FULLSCREEN_DYLIB);
    const names = NATIVE_DYLIBS.map((spec) => spec.dylib);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("prebuiltDylibPath", () => {
  it("returns null when the env var is unset (dev)", () => {
    expect(prebuiltDylibPath("video-layer.dylib", {})).toBeNull();
  });

  it("returns null when the dylib is missing", () => {
    const env = { [NATIVE_DIR_ENV]: "/bundle/native" };
    expect(prebuiltDylibPath("video-layer.dylib", env, () => false)).toBeNull();
  });

  it("joins the env dir with the dylib name when present", () => {
    const env = { [NATIVE_DIR_ENV]: "/bundle/native" };
    expect(prebuiltDylibPath("video-layer.dylib", env, () => true)).toBe(
      "/bundle/native/video-layer.dylib",
    );
  });
});
