import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { channelsDir } from "../catalog";
import { useAsyncValue } from "./react-sync";

const UI_ICON_DIR = join(tmpdir(), "gpiux-streamer-icons");
mkdirSync(UI_ICON_DIR, { recursive: true });

const EXTS = ["png", "jpg", "jpeg", "svg", "webp", "gif", "bmp"] as const;
const inflight = new Map<string, Promise<string | undefined>>();

function looksRemote(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function iconCacheDir(): string {
  return join(channelsDir(), "cache", "icons");
}

function cacheKey(url: string): string {
  return createHash("sha1").update(url).digest("hex").slice(0, 16);
}

export function usableIconSrc(src: string | undefined): string | undefined {
  if (!src) return undefined;
  const value = src.trim();
  if (!value) return undefined;
  if (value.startsWith("data:")) return value;
  if (looksRemote(value)) return value;
  if (existsSync(value)) return value;
  return undefined;
}

/** Paths GPUI can load without hitting a missing-file asset cache error. */
export function gpuixIconSrc(src: string | undefined): string | undefined {
  if (!src) return undefined;
  const value = src.trim();
  if (!value) return undefined;
  if (value.startsWith("data:")) return value;
  if (looksRemote(value)) return cachedIconPath(value);
  if (existsSync(value)) return value;
  return undefined;
}

export function cachedIconPath(url: string): string | undefined {
  const dir = iconCacheDir();
  const key = cacheKey(url);
  for (const ext of EXTS) {
    const path = join(dir, `${key}.${ext}`);
    if (existsSync(path)) return path;
  }
  return undefined;
}

function extensionFor(url: string, contentType: string | null): string {
  const mime = contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (mime.includes("svg")) return "svg";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("bmp")) return "bmp";
  const fromUrl = url.split("?")[0]?.split(".").pop()?.toLowerCase();
  if (fromUrl && (EXTS as readonly string[]).includes(fromUrl))
    return fromUrl === "jpeg" ? "jpg" : fromUrl;
  return "png";
}

export async function cacheRemoteIcon(url: string): Promise<string | undefined> {
  const existing = cachedIconPath(url);
  if (existing) return existing;
  const pending = inflight.get(url);
  if (pending) return pending;

  const task = (async () => {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept: "image/*,*/*",
        },
      });
      if (!response.ok) return undefined;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.byteLength < 8) return undefined;
      const dir = iconCacheDir();
      mkdirSync(dir, { recursive: true });
      const path = join(
        dir,
        `${cacheKey(url)}.${extensionFor(url, response.headers.get("content-type"))}`,
      );
      await Bun.write(path, bytes);
      return path;
    } catch {
      return undefined;
    } finally {
      inflight.delete(url);
    }
  })();

  inflight.set(url, task);
  return task;
}

export function materializeSvg(name: string, source: string): string {
  const path = join(UI_ICON_DIR, `${name}.svg`);
  writeFileSync(path, source);
  return path;
}

export function useResolvedIcon(src: string | undefined): string | undefined {
  const cacheKey = src?.trim() ?? "";
  return useAsyncValue(
    cacheKey,
    async () => {
      const local = gpuixIconSrc(src);
      if (local) return local;
      const value = src?.trim();
      if (!value || !looksRemote(value)) return undefined;
      return cacheRemoteIcon(value);
    },
    gpuixIconSrc(src),
  );
}
