import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execFileSync = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  execFileSync,
}));

import * as rasterizeModule from "./rasterize-svg";

describe("isRasterizeSvgDisabled", () => {
  it("is active under vitest", () => {
    expect(rasterizeModule.isRasterizeSvgDisabled()).toBe(true);
  });
});

describe("rasterizeSvgToPng", () => {
  beforeEach(() => {
    execFileSync.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns false for a missing svg path", () => {
    const dir = mkdtempSync(join(tmpdir(), "gpiux-raster-"));
    expect(
      rasterizeModule.rasterizeSvgToPng(join(dir, "missing.svg"), join(dir, "out.png"), 32),
    ).toBe(false);
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it("does not spawn swift while vitest is active", () => {
    const dir = mkdtempSync(join(tmpdir(), "gpiux-raster-"));
    const svg = join(dir, "icon.svg");
    writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg"/>');
    expect(rasterizeModule.rasterizeSvgToPng(svg, join(dir, "out.png"), 32)).toBe(false);
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it("returns false when swift fails", () => {
    vi.stubEnv("VITEST", "0");
    const dir = mkdtempSync(join(tmpdir(), "gpiux-raster-"));
    const svg = join(dir, "icon.svg");
    const png = join(dir, "out.png");
    writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg"/>');
    execFileSync.mockImplementation(() => {
      throw new Error("swift missing");
    });
    expect(rasterizeModule.rasterizeSvgToPng(svg, png, 32)).toBe(false);
  });

  it("returns true when swift produces the png", () => {
    vi.stubEnv("VITEST", "0");
    const dir = mkdtempSync(join(tmpdir(), "gpiux-raster-"));
    const svg = join(dir, "icon.svg");
    const png = join(dir, "out.png");
    writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg"/>');
    execFileSync.mockImplementation((_cmd, _args) => {
      writeFileSync(png, "png");
      return Buffer.alloc(0);
    });
    expect(rasterizeModule.rasterizeSvgToPng(svg, png, 32)).toBe(true);
  });

  it("returns false off macOS", () => {
    const platform = vi.spyOn(process, "platform", "get").mockReturnValue("linux");
    const dir = mkdtempSync(join(tmpdir(), "gpiux-raster-"));
    const svg = join(dir, "icon.svg");
    writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg"/>');
    expect(rasterizeModule.rasterizeSvgToPng(svg, join(dir, "out.png"), 32)).toBe(false);
    expect(execFileSync).not.toHaveBeenCalled();
    platform.mockRestore();
  });
});
