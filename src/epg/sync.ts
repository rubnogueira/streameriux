import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CatalogSource, Channel } from "../catalog/channel";
import { channelsDir } from "../catalog";
import { writeEpgConfig, type EpgConfig } from "./config";
import { feedNameFromUrl } from "./feed-name";
import { selectFeedUrls, splitEpgUrls } from "./feeds";
import type { EpgFeedIndex } from "./store";
import { processFeedInBackground } from "./worker-client";
import { yieldToMain } from "./yield";
import type { EpgChannelMeta, EpgProgramme } from "./xmltv";

function epgCacheDir(): string {
  return join(channelsDir(), "cache", "epg");
}

function feedHash(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) hash = (Math.imul(31, hash) + url.charCodeAt(i)) | 0;
  return Math.abs(hash).toString(36);
}

function cachePathFor(url: string): string {
  return join(epgCacheDir(), `${feedHash(url)}.json`);
}

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "*/*",
  "Accept-Encoding": "identity",
};

async function fetchFeed(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { headers: FETCH_HEADERS });
  if (!response.ok) throw new Error(`${response.status} fetching ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}

function isCacheFresh(fetchedAt: string, ttlHours: number): boolean {
  const age = Date.now() - Date.parse(fetchedAt);
  return age < ttlHours * 60 * 60 * 1000;
}

export async function loadCachedFeeds(urls?: string[]): Promise<EpgFeedIndex[]> {
  if (urls?.length === 0) return [];
  const dir = epgCacheDir();
  if (!existsSync(dir)) return [];

  let paths: string[];
  if (urls) {
    paths = urls.map((url) => cachePathFor(url));
  } else {
    const { readdir } = await import("node:fs/promises");
    const files = await readdir(dir);
    paths = files.filter((file) => file.endsWith(".json")).map((file) => join(dir, file));
  }

  const feeds: EpgFeedIndex[] = [];
  for (const path of paths) {
    if (!existsSync(path)) continue;
    try {
      const raw = await readFile(path, "utf8");
      feeds.push(JSON.parse(raw) as EpgFeedIndex);
    } catch {
      // Skip corrupt cache entries.
    }
    await yieldToMain();
  }
  return feeds;
}

export async function syncFeed(
  url: string,
  ttlHours: number,
  force = false,
  onFile?: (name: string) => void,
): Promise<EpgFeedIndex> {
  const cache = cachePathFor(url);
  onFile?.(feedNameFromUrl(url));
  await yieldToMain();

  if (!force && existsSync(cache)) {
    try {
      const existing = JSON.parse(await readFile(cache, "utf8")) as EpgFeedIndex;
      if (isCacheFresh(existing.fetchedAt, ttlHours)) return existing;
    } catch {
      // Re-fetch below.
    }
  }

  await yieldToMain();
  const data = await fetchFeed(url);
  await yieldToMain();
  return await processFeedInBackground(url, data, cache);
}

export async function readCachedFeed(url: string): Promise<EpgFeedIndex | null> {
  const cache = cachePathFor(url);
  if (!existsSync(cache)) return null;
  try {
    return JSON.parse(await readFile(cache, "utf8")) as EpgFeedIndex;
  } catch {
    return null;
  }
}

export function collectHeaderUrls(sources: CatalogSource[]): string[] {
  const urls: string[] = [];
  for (const source of sources) {
    if (source.epgUrl) urls.push(...splitEpgUrls(source.epgUrl));
  }
  return [...new Set(urls)];
}

export function urlsToSync(
  sources: CatalogSource[],
  channels: Channel[],
  config: EpgConfig,
): string[] {
  const headerUrls = sources.map((s) => s.epgUrl).filter(Boolean) as string[];
  return selectFeedUrls(headerUrls, config.customUrls, channels);
}

export type SyncResult = {
  feeds: EpgFeedIndex[];
  errors: string[];
  syncedAt: string;
};

export type EpgSyncProgress = {
  /** 1-based index of the feed file currently being processed. */
  current: number;
  total: number;
  file: string | null;
};

export type SyncProgressCallback = (progress: EpgSyncProgress) => void;

export type FeedMergedCallback = (feed: EpgFeedIndex) => void | Promise<void>;

export async function syncEpg(options: {
  sources: CatalogSource[];
  channels: Channel[];
  config: EpgConfig;
  force?: boolean;
  onProgress?: SyncProgressCallback;
  onFeedMerged?: FeedMergedCallback;
}): Promise<SyncResult> {
  const urls = urlsToSync(options.sources, options.channels, options.config);
  const errors: string[] = [];
  const feeds: EpgFeedIndex[] = [];
  const total = urls.length;

  const report = (current: number, file: string | null) => {
    options.onProgress?.({ current, total, file });
  };

  for (let index = 0; index < urls.length; index++) {
    const url = urls[index]!;
    const file = feedNameFromUrl(url);
    report(index + 1, file);
    await yieldToMain();

    try {
      const feed = await syncFeed(
        url,
        options.config.syncIntervalHours,
        options.force === true,
        () => report(index + 1, file),
      );
      feeds.push(feed);
      await options.onFeedMerged?.(feed);
    } catch (error) {
      errors.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
      const cached = await readCachedFeed(url);
      if (cached) {
        feeds.push(cached);
        await options.onFeedMerged?.(cached);
      }
    }
    await yieldToMain();
  }

  const syncedAt = new Date().toISOString();
  if (feeds.length || !errors.length) {
    await writeEpgConfig({ ...options.config, lastSyncAt: syncedAt });
  }

  return { feeds, errors, syncedAt };
}

export type { EpgChannelMeta, EpgProgramme };
