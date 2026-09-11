/** @vitest-environment jsdom */
import { existsSync, writeFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appIconAsset, appIconSvgSource, ensureAppIconPng, readMacAppearance } from "./app-icon";
import * as rasterize from "./rasterize-svg";

describe("readMacAppearance", () => {
  it("defaults to dark off macOS", () => {
    if (process.platform === "darwin") return;
    expect(readMacAppearance()).toBe("dark");
  });
});

describe("appIconAsset", () => {
  it("points at light and dark svg assets", () => {
    expect(existsSync(appIconAsset("dark"))).toBe(true);
    expect(existsSync(appIconAsset("light"))).toBe(true);
  });
});

describe("appIconSvgSource", () => {
  it("returns distinct non-empty svg sources per appearance", () => {
    // Bun's bundler inlines this as raw SVG text; Vite (the test transform)
    // inlines it as a data: URL — assert on what both encodings share.
    const dark = appIconSvgSource("dark");
    const light = appIconSvgSource("light");
    expect(dark).toMatch(/svg/i);
    expect(light).toMatch(/svg/i);
    expect(dark.length).toBeGreaterThan(100);
    expect(dark).not.toBe(light);
  });
});

describe("ensureAppIconPng", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns undefined when rasterisation is unavailable", () => {
    vi.spyOn(rasterize, "rasterizeSvgToPng").mockReturnValue(false);
    expect(ensureAppIconPng("dark", 71)).toBeUndefined();
  });

  it("returns distinct png paths per appearance when rasterisation succeeds", () => {
    vi.spyOn(rasterize, "rasterizeSvgToPng").mockImplementation((_svg, png) => {
      writeFileSync(png, "png");
      return true;
    });
    const dark = ensureAppIconPng("dark", 62);
    const light = ensureAppIconPng("light", 62);
    expect(dark).toBeDefined();
    expect(light).toBeDefined();
    expect(dark).not.toBe(light);
    expect(existsSync(dark!)).toBe(true);
    expect(existsSync(light!)).toBe(true);
  });

  it("returns undefined off macOS", () => {
    vi.spyOn(rasterize, "rasterizeSvgToPng").mockReturnValue(false);
    const platform = vi.spyOn(process, "platform", "get").mockReturnValue("linux");
    expect(ensureAppIconPng("dark", 73)).toBeUndefined();
    platform.mockRestore();
  });
});
