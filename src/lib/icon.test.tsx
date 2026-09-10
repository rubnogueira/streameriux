/** @vitest-environment jsdom */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureDir, testTempDir } from "./ensure-dir";
import { renderHookProbe } from "../test-fixtures/render-hook";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installMockFetch } from "./mock-fetch";
import {
  cacheRemoteIcon,
  cachedIconPath,
  gpuixIconSrc,
  materializeSvg,
  usableIconSrc,
  useResolvedIcon,
} from "./icon";

describe("usableIconSrc", () => {
  it("accepts data urls and existing local paths", () => {
    const dir = testTempDir("icon");
    const file = join(dir, "logo.png");
    writeFileSync(file, "png");
    expect(usableIconSrc("data:image/png;base64,abc")).toBe("data:image/png;base64,abc");
    expect(usableIconSrc(file)).toBe(file);
    expect(usableIconSrc("https://cdn/logo.png")).toBe("https://cdn/logo.png");
    expect(usableIconSrc("missing.png")).toBeUndefined();
    expect(usableIconSrc("  ")).toBeUndefined();
  });
});

describe("cachedIconPath and cacheRemoteIcon", () => {
  const dir = testTempDir("icon-cache");
  const previous = process.env.STREAMER_CHANNELS_DIR;

  beforeEach(() => {
    ensureDir(dir);
    process.env.STREAMER_CHANNELS_DIR = dir;
  });

  afterEach(() => {
    process.env.STREAMER_CHANNELS_DIR = previous;
    globalThis.fetch = fetch;
  });

  it("returns an existing cached file", () => {
    const url = "https://example.com/logo.png";
    const cacheDir = ensureDir(join(dir, "cache", "icons"));
    const key = createHash("sha1").update(url).digest("hex").slice(0, 16);
    const path = join(cacheDir, `${key}.png`);
    writeFileSync(path, "png");
    expect(cachedIconPath(url)).toBe(path);
  });

  it("downloads and stores remote icons", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8]), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );
    installMockFetch(fetchFn);
    const url = "https://example.com/remote.png";
    const path = await cacheRemoteIcon(url);
    expect(path).toMatch(/\.png$/);
    expect(fetchFn).toHaveBeenCalled();
  });

  it("dedupes inflight downloads", async () => {
    let resolveFetch: ((value: Response) => void) | undefined;
    const fetchFn = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    installMockFetch(fetchFn);
    const url = "https://example.com/inflight.webp";
    const first = cacheRemoteIcon(url);
    const second = cacheRemoteIcon(url);
    resolveFetch?.(
      new Response(Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8]), {
        status: 200,
        headers: { "Content-Type": "image/webp" },
      }),
    );
    await Promise.all([first, second]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("returns undefined for failed downloads", async () => {
    installMockFetch(vi.fn().mockResolvedValue(new Response("", { status: 404 })));
    expect(await cacheRemoteIcon("https://example.com/missing.jpg")).toBeUndefined();
  });
});

describe("gpuixIconSrc and materializeSvg", () => {
  it("materializes inline svg to a temp path", () => {
    const path = materializeSvg("test-icon", "<svg/>");
    expect(gpuixIconSrc(path)).toBe(path);
  });
});

describe("useResolvedIcon", () => {
  it("resolves local icons synchronously", async () => {
    const dir = testTempDir("resolved");
    const file = join(dir, "logo.png");
    writeFileSync(file, "png");
    const hook = await renderHookProbe(() => useResolvedIcon(file));
    expect(hook.latest).toBe(file);
    hook.unmount();
  });
});
