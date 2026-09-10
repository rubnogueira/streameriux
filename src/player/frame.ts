import type { VideoSample } from "mediabunny";

// GPUIX has no video surface, so every frame is a full-resolution bitmap that
// the renderer decodes and uploads to a GPU texture. The renderer only reclaims
// those in periodic passes; when the blitted byte-rate (width² · fps) outruns
// that reclaim rate, bitmaps pile up between passes and, on a never-idle live
// stream, climb into the gigabytes. Downscaling the blit is the primary lever
// that keeps per-frame bytes low enough for reclaim to keep pace — measured
// flat at small sizes, multi-GB at 960px+. 640 is the quality/memory tradeoff
// for this proof of concept; override with STREAMER_MAX_FRAME_WIDTH.
function envWidth(): number {
  const raw = typeof process !== "undefined" ? process.env.STREAMER_MAX_FRAME_WIDTH : undefined;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed >= 160 ? parsed : 640;
}

const MAX_WIDTH = envWidth();

function writeBmpHeader(out: Buffer, width: number, height: number, pixelBytes: number): void {
  out.writeUInt16LE(0x4d42, 0);
  out.writeUInt32LE(54 + pixelBytes, 2);
  out.writeUInt32LE(0, 6);
  out.writeUInt32LE(54, 10);
  out.writeUInt32LE(40, 14);
  out.writeInt32LE(width, 18);
  out.writeInt32LE(height, 22);
  out.writeUInt16LE(1, 26);
  out.writeUInt16LE(32, 28);
  out.writeUInt32LE(0, 30);
  out.writeUInt32LE(pixelBytes, 34);
  out.writeInt32LE(2835, 38);
  out.writeInt32LE(2835, 42);
  out.writeUInt32LE(0, 46);
  out.writeUInt32LE(0, 50);
}

/** 32-bit bottom-up BMP. `pixels` is BGRA when `swapRedBlue` is false, RGBA when true. */
export function encodeBmp(
  pixels: Uint8Array,
  width: number,
  height: number,
  stride: number,
  swapRedBlue = false,
): Buffer {
  const rowBytes = width * 4;
  const pixelBytes = rowBytes * height;
  const out = Buffer.allocUnsafe(54 + pixelBytes);
  writeBmpHeader(out, width, height, pixelBytes);
  for (let y = 0; y < height; y++) {
    const srcOff = (height - 1 - y) * stride;
    const dstOff = 54 + y * rowBytes;
    if (!swapRedBlue && stride === rowBytes) {
      out.set(pixels.subarray(srcOff, srcOff + rowBytes), dstOff);
      continue;
    }
    for (let x = 0; x < width; x++) {
      const s = srcOff + x * 4;
      const d = dstOff + x * 4;
      out[d] = pixels[s + (swapRedBlue ? 2 : 0)]!;
      out[d + 1] = pixels[s + 1]!;
      out[d + 2] = pixels[s + (swapRedBlue ? 0 : 2)]!;
      out[d + 3] = pixels[s + 3]!;
    }
  }
  return out;
}

async function copyRgba(
  frame: VideoSample,
): Promise<{ pixels: Uint8Array; stride: number; swapRedBlue: boolean }> {
  try {
    const options = { format: "BGRA" as const };
    const pixels = new Uint8Array(frame.allocationSize(options));
    const layouts = await frame.copyTo(pixels, options);
    return { pixels, stride: layouts[0]?.stride ?? frame.displayWidth * 4, swapRedBlue: false };
  } catch {
    const options = { format: "RGBA" as const };
    const pixels = new Uint8Array(frame.allocationSize(options));
    const layouts = await frame.copyTo(pixels, options);
    return { pixels, stride: layouts[0]?.stride ?? frame.displayWidth * 4, swapRedBlue: true };
  }
}

/**
 * Encode a decoded video frame as a `data:image/bmp;base64,…` URL for `<img src>`.
 *
 * We deliberately do NOT hand GPUI a file path. A path-sourced `<img>` is loaded
 * through gpui's `RetainAllImageCache`, which keys decoded bitmaps by their source
 * string and never evicts them — so a fresh path per frame (needed to defeat that
 * same cache serving stale pixels) leaks one decoded bitmap per frame, tens of MB
 * a second while a stream plays. A `data:` URL takes gpuix's other img path
 * (`decode_image_data_url` → `platform::Image::from_bytes`): the decoded image is
 * held by the `<img>` element itself and dropped the moment its `src` changes or
 * it unmounts, so only the frames currently on screen stay resident. It also drops
 * the per-frame temp-file writes (and the disk they leaked when a reclaim unlink
 * lost a race with GPUI's decode).
 */
/**
 * Cap for frames handed to the native video surface. It composites on the GPU
 * with no per-frame accumulation, so it can carry much more than the `<img>`
 * path — near source resolution — while keeping the IOSurface a sane size.
 */
export const NATIVE_MAX_WIDTH = 1920;

/**
 * Decode a frame to tightly-relevant BGRA for the native video surface (README
 * Option A). Returns 32-bit BGRA top-down; `stride` is the row length in bytes.
 * Unlike the `<img>` path there is no BMP/base64 step — the pixels go straight
 * to an `AVSampleBufferDisplayLayer` by pointer.
 */
export async function sampleToBgra(
  sample: VideoSample,
  maxWidth = NATIVE_MAX_WIDTH,
): Promise<{ pixels: Uint8Array; width: number; height: number; stride: number }> {
  let frame: VideoSample = sample;
  let cloned = false;
  if (sample.rotation !== 0 || sample.displayWidth > maxWidth) {
    frame = await sample.transform({
      width: Math.min(sample.displayWidth, maxWidth),
      fit: "contain",
    });
    cloned = true;
  }
  try {
    const { pixels, stride, swapRedBlue } = await copyRgba(frame);
    if (swapRedBlue) {
      // Rare fallback path handed us RGBA; swap to BGRA in place.
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i]!;
        pixels[i] = pixels[i + 2]!;
        pixels[i + 2] = r;
      }
    }
    return { pixels, width: frame.displayWidth, height: frame.displayHeight, stride };
  } finally {
    if (cloned) frame.close();
  }
}

export async function sampleToFrameSrc(sample: VideoSample): Promise<string> {
  let frame: VideoSample = sample;
  let cloned = false;

  const needsTransform = sample.rotation !== 0 || sample.displayWidth > MAX_WIDTH;
  if (needsTransform) {
    frame = await sample.transform({
      width: Math.min(sample.displayWidth, MAX_WIDTH),
      fit: "contain",
    });
    cloned = true;
  }

  try {
    const { pixels, stride, swapRedBlue } = await copyRgba(frame);
    const bmp = encodeBmp(pixels, frame.displayWidth, frame.displayHeight, stride, swapRedBlue);
    return `data:image/bmp;base64,${bmp.toString("base64")}`;
  } finally {
    if (cloned) frame.close();
  }
}
