import { describe, expect, it, vi } from "vitest";
import { encodeBmp, sampleToBgra, sampleToFrameSrc } from "./frame";
import type { VideoSample } from "mediabunny";

function mockSample(
  overrides: Partial<VideoSample> & Pick<VideoSample, "displayWidth" | "displayHeight">,
): VideoSample {
  const base = {
    rotation: 0,
    allocationSize: () => 16,
    copyTo: vi.fn(async (_pixels: Uint8Array) => [{ stride: overrides.displayWidth * 4 }]),
    transform: vi.fn(async () => mockSample({ displayWidth: 2, displayHeight: 2 })),
    close: vi.fn(),
    ...overrides,
  };
  return base as VideoSample;
}

describe("encodeBmp", () => {
  it("writes a 32-bit bottom-up BGRA bitmap", () => {
    const width = 2;
    const height = 2;
    const bgra = Uint8Array.from([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
    ]);
    const bmp = encodeBmp(bgra, width, height, width * 4);
    expect(bmp.toString("ascii", 0, 2)).toBe("BM");
    expect(bmp.readUInt32LE(10)).toBe(54);
    expect(bmp.readInt32LE(18)).toBe(2);
    expect(bmp.readInt32LE(22)).toBe(2);
    expect(bmp.readUInt16LE(28)).toBe(32);
    expect([...bmp.subarray(54, 58)]).toEqual([0, 0, 255, 255]);
    expect([...bmp.subarray(58, 62)]).toEqual([255, 255, 255, 255]);
  });

  it("copies row slices when stride is wider than the image", () => {
    const pixels = Uint8Array.from([1, 2, 3, 4, 9, 9, 9, 9]);
    const bmp = encodeBmp(pixels, 1, 2, 4);
    expect(bmp.length).toBeGreaterThan(54);
  });

  it("swaps red and blue when the source is RGBA", () => {
    const rgba = Uint8Array.from([255, 0, 0, 255]);
    const bmp = encodeBmp(rgba, 1, 1, 4, true);
    expect([...bmp.subarray(54, 58)]).toEqual([0, 0, 255, 255]);
  });
});

describe("frame data URLs", () => {
  it("base64-encodes a BMP into a decodable image/bmp data URL", () => {
    const bmp = encodeBmp(Uint8Array.from([255, 0, 0, 255]), 1, 1, 4);
    const url = `data:image/bmp;base64,${bmp.toString("base64")}`;
    expect(url.startsWith("data:image/bmp;base64,")).toBe(true);
    const decoded = Buffer.from(url.slice("data:image/bmp;base64,".length), "base64");
    expect(decoded.equals(bmp)).toBe(true);
    expect(decoded.toString("ascii", 0, 2)).toBe("BM");
  });
});

describe("sampleToFrameSrc", () => {
  it("encodes a frame to a data URL", async () => {
    const sample = mockSample({ displayWidth: 1, displayHeight: 1 });
    (sample.copyTo as ReturnType<typeof vi.fn>).mockImplementation(async (pixels: Uint8Array) => {
      pixels.set([0, 0, 255, 255], 0);
      return [{ stride: 4 }];
    });
    const url = await sampleToFrameSrc(sample);
    expect(url.startsWith("data:image/bmp;base64,")).toBe(true);
  });

  it("transforms oversized frames before encoding", async () => {
    const transformed = mockSample({ displayWidth: 640, displayHeight: 360 });
    const sample = mockSample({ displayWidth: 1920, displayHeight: 1080, rotation: 90 });
    (sample.transform as ReturnType<typeof vi.fn>).mockResolvedValue(transformed);
    (transformed.copyTo as ReturnType<typeof vi.fn>).mockImplementation(
      async (pixels: Uint8Array) => {
        pixels.fill(0);
        return [{ stride: 640 * 4 }];
      },
    );
    await sampleToFrameSrc(sample);
    expect(sample.transform).toHaveBeenCalled();
    expect(transformed.close).toHaveBeenCalled();
  });

  it("falls back to RGBA copy when BGRA fails", async () => {
    const sample = mockSample({ displayWidth: 1, displayHeight: 1 });
    (sample.copyTo as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("no bgra"))
      .mockImplementationOnce(async (pixels: Uint8Array) => {
        pixels.set([255, 0, 0, 255], 0);
        return [{ stride: 4 }];
      });
    const url = await sampleToFrameSrc(sample);
    expect(url).toContain("data:image/bmp;base64,");
  });
});

describe("sampleToBgra", () => {
  it("returns BGRA pixels for the native surface", async () => {
    const sample = mockSample({ displayWidth: 2, displayHeight: 2 });
    (sample.copyTo as ReturnType<typeof vi.fn>).mockImplementation(async (pixels: Uint8Array) => {
      pixels.fill(0);
      return [{ stride: 8 }];
    });
    const frame = await sampleToBgra(sample);
    expect(frame.width).toBe(2);
    expect(frame.pixels.byteLength).toBeGreaterThan(0);
  });

  it("swaps RGBA to BGRA on the fallback path", async () => {
    const sample = mockSample({ displayWidth: 1, displayHeight: 1 });
    (sample.copyTo as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("no bgra"))
      .mockImplementationOnce(async (pixels: Uint8Array) => {
        pixels.set([255, 0, 0, 255], 0);
        return [{ stride: 4 }];
      });
    const frame = await sampleToBgra(sample);
    expect(frame.pixels[0]).toBe(0);
    expect(frame.pixels[2]).toBe(255);
  });
});
