import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogSource } from "../catalog/channel";
import { catalogSource } from "../test-fixtures/catalog-source";
import type { EpgConfig } from "./config";
import {
  collectHeaderUrls,
  loadCachedFeeds,
  readCachedFeed,
  syncEpg,
  syncFeed,
  urlsToSync,
} from "./sync";
import { buildFeedIndex } from "./process-feed";

function feedHash(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) hash = (Math.imul(31, hash) + url.charCodeAt(i)) | 0;
  return Math.abs(hash).toString(36);
}

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <channel id="ONE.us"><display-name>One</display-name></channel>
  <programme start="20260908010000 +0000" stop="20260908023000 +0000" channel="ONE.us">
    <title>News</title>
  </programme>
</tv>`;

const config: EpgConfig = {
  enabled: true,
  syncIntervalHours: 12,
  guideHoursBefore: 6,
  guideHoursAfter: 24,
  customUrls: [],
  lastSyncAt: "",
};

describe("collectHeaderUrls", () => {
  it("collects unique header EPG URLs", () => {
    const sources: CatalogSource[] = [
      catalogSource({ id: "a", epgUrl: "https://a.com/1.xml, https://b.com/2.xml" }),
      catalogSource({ id: "b", epgUrl: "https://a.com/1.xml" }),
    ];
    expect(collectHeaderUrls(sources)).toEqual(["https://a.com/1.xml", "https://b.com/2.xml"]);
  });
});

describe("urlsToSync", () => {
  it("delegates to selectFeedUrls", () => {
    const urls = urlsToSync(
      [
        catalogSource({
          id: "main",
          epgUrl: "https://epgshare01.online/epgshare01/epg_ripper_US1.xml.gz",
        }),
      ],
      [],
      config,
    );
    expect(urls.length).toBeGreaterThan(0);
  });
});

describe("loadCachedFeeds", () => {
  const dir = join(tmpdir(), `epg-sync-cache-${Date.now()}`);
  const previous = process.env.STREAMER_CHANNELS_DIR;

  beforeEach(() => {
    mkdirSync(join(dir, "cache", "epg"), { recursive: true });
    process.env.STREAMER_CHANNELS_DIR = dir;
  });

  afterEach(() => {
    process.env.STREAMER_CHANNELS_DIR = previous;
  });

  it("returns an empty list when the cache dir is missing", async () => {
    process.env.STREAMER_CHANNELS_DIR = join(tmpdir(), `missing-${Date.now()}`);
    expect(await loadCachedFeeds()).toEqual([]);
    expect(await loadCachedFeeds([])).toEqual([]);
  });

  it("loads feeds for explicit URLs and skips corrupt files", async () => {
    const cacheDir = join(dir, "cache", "epg");
    const url = "https://example.com/guide.xml";
    const index = buildFeedIndex(url, XML);
    writeFileSync(join(cacheDir, `${feedHash(url)}.json`), JSON.stringify(index));
    writeFileSync(join(cacheDir, "bad.json"), "{not json");

    const feeds = await loadCachedFeeds([url]);
    expect(feeds).toHaveLength(1);
    expect(feeds[0].url).toBe(url);
  });

  it("reads every json file when no URL filter is passed", async () => {
    const cacheDir = join(dir, "cache", "epg");
    const index = buildFeedIndex("https://example.com/all.xml", XML);
    writeFileSync(join(cacheDir, "all.json"), JSON.stringify(index));
    const feeds = await loadCachedFeeds();
    expect(feeds.some((feed) => feed.url === "https://example.com/all.xml")).toBe(true);
  });
});

describe("syncFeed", () => {
  const dir = join(tmpdir(), `epg-sync-feed-${Date.now()}`);
  const previous = process.env.STREAMER_CHANNELS_DIR;
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    mkdirSync(join(dir, "cache", "epg"), { recursive: true });
    process.env.STREAMER_CHANNELS_DIR = dir;
  });

  afterEach(() => {
    process.env.STREAMER_CHANNELS_DIR = previous;
    globalThis.fetch = realFetch;
  });

  it("reuses a fresh on-disk cache without fetching", async () => {
    const url = "https://example.com/cached.xml";
    const index = buildFeedIndex(url, XML);
    index.fetchedAt = new Date().toISOString();
    writeFileSync(join(dir, "cache", "epg", `${feedHash(url)}.json`), JSON.stringify(index));

    globalThis.fetch = vi.fn() as unknown as typeof fetch;
    const loaded = await syncFeed(url, config.syncIntervalHours, false);
    expect(loaded.url).toBe(url);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe("readCachedFeed", () => {
  const dir = join(tmpdir(), `epg-read-cache-${Date.now()}`);
  const previous = process.env.STREAMER_CHANNELS_DIR;

  beforeEach(() => {
    mkdirSync(join(dir, "cache", "epg"), { recursive: true });
    process.env.STREAMER_CHANNELS_DIR = dir;
  });

  afterEach(() => {
    process.env.STREAMER_CHANNELS_DIR = previous;
  });

  it("reads a valid cache entry", async () => {
    const url = "https://example.com/hit.xml";
    const index = buildFeedIndex(url, XML);
    const cacheDir = join(dir, "cache", "epg");
    writeFileSync(join(cacheDir, `${feedHash(url)}.json`), JSON.stringify(index));
    const loaded = await readCachedFeed(url);
    expect(loaded?.url).toBe(url);
  });

  it("returns null when missing or corrupt", async () => {
    const url = "https://missing.example/epg.xml";
    expect(await readCachedFeed(url)).toBeNull();
    const cacheDir = join(dir, "cache", "epg");
    writeFileSync(join(cacheDir, `${feedHash(url)}.json`), "broken");
    expect(await readCachedFeed(url)).toBeNull();
  });
});

describe("syncEpg", () => {
  const dir = join(tmpdir(), `epg-sync-run-${Date.now()}`);
  const previous = process.env.STREAMER_CHANNELS_DIR;
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    mkdirSync(join(dir, "cache", "epg"), { recursive: true });
    mkdirSync(dir, { recursive: true });
    process.env.STREAMER_CHANNELS_DIR = dir;
  });

  afterEach(() => {
    process.env.STREAMER_CHANNELS_DIR = previous;
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("fetches feeds and records progress", async () => {
    const url = "https://example.com/epg.xml";
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(XML, { status: 200, headers: { "Content-Type": "application/xml" } }),
      ) as unknown as typeof fetch;

    const progress: string[] = [];
    const merged: string[] = [];
    const result = await syncEpg({
      sources: [catalogSource({ id: "main", epgUrl: url })],
      channels: [],
      config,
      force: true,
      onProgress: (p) => progress.push(`${p.current}/${p.total}:${p.file}`),
      onFeedMerged: (feed) => {
        merged.push(feed.url);
      },
    });

    expect(result.errors).toEqual([]);
    expect(result.feeds).toHaveLength(1);
    expect(merged).toEqual([url]);
    expect(progress.some((line) => line.includes("epg.xml"))).toBe(true);
  });

  it("falls back to cached feeds when fetch fails", async () => {
    const url = "https://example.com/stale.xml";
    const index = buildFeedIndex(url, XML);
    const cacheDir = join(dir, "cache", "epg");
    writeFileSync(join(cacheDir, `${feedHash(url)}.json`), JSON.stringify(index));

    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response("", { status: 500, statusText: "err" }),
      ) as unknown as typeof fetch;

    const result = await syncEpg({
      sources: [catalogSource({ id: "main", epgUrl: url })],
      channels: [],
      config,
      force: true,
    });

    expect(result.errors.length).toBe(1);
    expect(result.feeds).toHaveLength(1);
    expect(result.feeds[0].url).toBe(url);
  });
});
