import { describe, expect, it, vi } from "vitest";
import type { Channel } from "../catalog/channel";
import { epgFeedIndex } from "../test-fixtures/epg-feed-index";
import { EpgStore } from "./store";
import { epgBackgroundSyncEnabled, hydrateCachedFeeds } from "./use-epg-hydrate";

vi.mock("./sync", () => ({
  readCachedFeed: vi.fn(async () => null),
}));

vi.mock("./config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./config")>();
  return {
    ...actual,
    isSyncDue: vi.fn(() => false),
  };
});

const channel: Channel = {
  id: "acme",
  name: "Acme",
  url: "https://example.com/a.m3u8",
  sourceFile: "a.toml",
  sourceKind: "toml",
  editable: false,
};

describe("epgBackgroundSyncEnabled", () => {
  it("is false under vitest", () => {
    vi.stubEnv("VITEST", "true");
    expect(epgBackgroundSyncEnabled()).toBe(false);
    vi.stubEnv("VITEST", "false");
    expect(epgBackgroundSyncEnabled()).toBe(true);
  });
});

describe("hydrateCachedFeeds", () => {
  it("loads cached feeds and finishes merge", async () => {
    const { readCachedFeed } = await import("./sync");
    vi.mocked(readCachedFeed).mockResolvedValueOnce(epgFeedIndex("https://example.com/epg.xml"));
    const store = new EpgStore();
    const setStatus = vi.fn();
    const runSync = vi.fn(async () => {});
    const hydrateGenerationRef = { current: 1 };

    await hydrateCachedFeeds({
      urls: ["https://example.com/epg.xml"],
      generation: 1,
      hydrateGenerationRef,
      store,
      channels: [channel],
      config: {
        enabled: true,
        syncIntervalHours: 12,
        guideHoursBefore: 6,
        guideHoursAfter: 24,
        customUrls: [],
        lastSyncAt: "",
      },
      syncActive: false,
      setStatus,
      runSync,
    });

    expect(setStatus.mock.calls.length).toBeGreaterThan(0);
  });

  it("skips missing cached feeds", async () => {
    const { readCachedFeed } = await import("./sync");
    vi.mocked(readCachedFeed).mockResolvedValueOnce(null);
    const store = new EpgStore();
    const setStatus = vi.fn();
    await hydrateCachedFeeds({
      urls: ["https://example.com/missing.xml"],
      generation: 1,
      hydrateGenerationRef: { current: 1 },
      store,
      channels: [channel],
      config: {
        enabled: true,
        syncIntervalHours: 12,
        guideHoursBefore: 6,
        guideHoursAfter: 24,
        customUrls: [],
        lastSyncAt: "",
      },
      syncActive: false,
      setStatus,
      runSync: vi.fn(),
    });
    expect(setStatus.mock.calls.length).toBeGreaterThan(0);
  });

  it("stops when generation changes mid-loop", async () => {
    const { readCachedFeed } = await import("./sync");
    const hydrateGenerationRef = { current: 1 };
    vi.mocked(readCachedFeed).mockImplementation(async () => {
      hydrateGenerationRef.current = 2;
      return epgFeedIndex("https://example.com/epg.xml");
    });
    const store = new EpgStore();
    await hydrateCachedFeeds({
      urls: ["https://example.com/epg.xml"],
      generation: 1,
      hydrateGenerationRef,
      store,
      channels: [channel],
      config: {
        enabled: true,
        syncIntervalHours: 12,
        guideHoursBefore: 6,
        guideHoursAfter: 24,
        customUrls: [],
        lastSyncAt: "",
      },
      syncActive: false,
      setStatus: vi.fn(),
      runSync: vi.fn(),
    });
  });

  it("stops when generation changes", async () => {
    const store = new EpgStore();
    const setStatus = vi.fn();
    const hydrateGenerationRef = { current: 2 };

    await hydrateCachedFeeds({
      urls: ["https://example.com/epg.xml"],
      generation: 1,
      hydrateGenerationRef,
      store,
      channels: [channel],
      config: {
        enabled: true,
        syncIntervalHours: 12,
        guideHoursBefore: 6,
        guideHoursAfter: 24,
        customUrls: [],
        lastSyncAt: "",
      },
      syncActive: false,
      setStatus,
      runSync: vi.fn(),
    });

    expect(setStatus).not.toHaveBeenCalled();
  });

  it("triggers sync when due after hydrate", async () => {
    const { isSyncDue } = await import("./config");
    vi.mocked(isSyncDue).mockReturnValueOnce(true);
    const runSync = vi.fn(async () => {});
    const store = new EpgStore();
    const hydrateGenerationRef = { current: 1 };

    await hydrateCachedFeeds({
      urls: [],
      generation: 1,
      hydrateGenerationRef,
      store,
      channels: [channel],
      config: {
        enabled: true,
        syncIntervalHours: 12,
        guideHoursBefore: 6,
        guideHoursAfter: 24,
        customUrls: [],
        lastSyncAt: "",
      },
      syncActive: false,
      setStatus: vi.fn(),
      runSync,
    });

    expect(runSync).toHaveBeenCalledWith(false);
  });
});
