/** @vitest-environment jsdom */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Channel } from "../catalog/channel";
import { testTempDir } from "../lib/ensure-dir";
import { renderHookProbe } from "../test-fixtures/render-hook";
import type { EpgConfig } from "./config";
import type { syncEpg } from "./sync";
import { useEpg } from "./use-epg";

const { syncEpgMock } = vi.hoisted(() => ({
  syncEpgMock: vi.fn<typeof syncEpg>(async () => ({
    errors: [],
    feeds: [],
    syncedAt: "",
  })),
}));

vi.mock("./sync", () => ({
  syncEpg: syncEpgMock,
  readCachedFeed: vi.fn(async () => null),
  urlsToSync: vi.fn(() => ["https://example.com/epg.xml"]),
}));

vi.mock("./worker-client", () => ({
  shutdownEpgWorker: vi.fn(),
}));

vi.mock("./config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./config")>();
  return {
    ...actual,
    readEpgConfig: vi.fn(async () => ({
      enabled: true,
      syncIntervalHours: 12,
      guideHoursBefore: 6,
      guideHoursAfter: 24,
      customUrls: [],
      lastSyncAt: "",
    })),
    writeEpgConfig: vi.fn(async (_config: EpgConfig) => {}),
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
const channels = [channel];
const sources: never[] = [];

async function renderUseEpg() {
  const hook = await renderHookProbe(() => useEpg(sources, channels, false));
  return {
    get latest() {
      return hook.latest;
    },
    rerender: () => hook.rerender(),
    unmount: () => hook.unmount(),
  };
}

describe("useEpg", () => {
  const previousDir = process.env.STREAMER_CHANNELS_DIR;

  beforeEach(() => {
    process.env.STREAMER_CHANNELS_DIR = testTempDir("use-epg");
    process.env.VITEST = "true";
  });

  afterEach(() => {
    process.env.STREAMER_CHANNELS_DIR = previousDir;
    vi.clearAllMocks();
  });

  it("loads config and exposes schedule helpers", async () => {
    const hook = await renderUseEpg();
    await hook.rerender();
    expect(hook.latest.enabled).toBe(true);
    expect(hook.latest.getNow(channel)).toBeNull();
    expect(hook.latest.getSchedule(channel, 0, 1)).toEqual([]);
    hook.unmount();
  });

  it("persists interval changes", async () => {
    const hook = await renderUseEpg();
    await hook.rerender();
    await act(async () => {
      await hook.latest.setSyncIntervalHours(6);
    });
    await hook.rerender();
    expect(hook.latest.config.syncIntervalHours).toBe(6);
    hook.unmount();
  });

  it("returns null schedule helpers when disabled", async () => {
    const { readEpgConfig, writeEpgConfig } = await import("./config");
    vi.mocked(readEpgConfig).mockResolvedValueOnce({
      enabled: false,
      syncIntervalHours: 12,
      guideHoursBefore: 6,
      guideHoursAfter: 24,
      customUrls: [],
      lastSyncAt: "",
    });
    const hook = await renderUseEpg();
    await hook.rerender();
    expect(hook.latest.getNow(channel)).toBeNull();
    expect(hook.latest.getSchedule(channel, 0, 1)).toEqual([]);
    expect(hook.latest.resolveEpgId(channel)).toBeNull();
    hook.unmount();
    vi.mocked(readEpgConfig).mockResolvedValue({
      enabled: true,
      syncIntervalHours: 12,
      guideHoursBefore: 6,
      guideHoursAfter: 24,
      customUrls: [],
      lastSyncAt: "",
    });
    void writeEpgConfig;
  });

  it("runs sync and handles progress, merge, and errors", async () => {
    const { readEpgConfig, isSyncDue } = await import("./config");
    vi.mocked(isSyncDue).mockReturnValue(true);
    syncEpgMock.mockImplementationOnce(async (opts) => {
      opts.onProgress?.({ current: 1, total: 2, file: "epg.xml" });
      await opts.onFeedMerged?.({
        url: "https://example.com/epg.xml",
        programmes: {},
        channels: [],
        fetchedAt: "",
      });
      await opts.onFeedMerged?.({
        url: "https://example.com/epg2.xml",
        programmes: {},
        channels: [],
        fetchedAt: "",
      });
      return { errors: ["sync warn"], feeds: [], syncedAt: "" };
    });
    vi.mocked(readEpgConfig).mockResolvedValueOnce({
      enabled: true,
      syncIntervalHours: 12,
      guideHoursBefore: 6,
      guideHoursAfter: 24,
      customUrls: [],
      lastSyncAt: "",
    });
    const hook = await renderUseEpg();
    await hook.rerender();
    await act(async () => {
      await hook.latest.syncNow(true);
    });
    await hook.rerender();
    expect(hook.latest.status.error).toContain("sync warn");
    hook.unmount();
  });

  it("records sync failures", async () => {
    syncEpgMock.mockRejectedValueOnce(new Error("boom"));
    const hook = await renderUseEpg();
    await hook.rerender();
    await act(async () => {
      await hook.latest.syncNow(true);
    });
    await hook.rerender();
    expect(hook.latest.status.error).toBe("boom");
    hook.unmount();
  });

  it("starts cache hydration outside vitest", async () => {
    vi.stubEnv("VITEST", "false");
    const hydrate = vi.spyOn(await import("./use-epg-hydrate"), "hydrateCachedFeeds");
    const hook = await renderUseEpg();
    await hook.rerender();
    expect(hydrate).toHaveBeenCalled();
    hydrate.mockRestore();
    vi.stubEnv("VITEST", "true");
    hook.unmount();
  });

  it("persists guide hours and custom urls", async () => {
    const { writeEpgConfig, readEpgConfig } = await import("./config");
    let saved = {
      enabled: true,
      syncIntervalHours: 12,
      guideHoursBefore: 6,
      guideHoursAfter: 24,
      customUrls: [] as string[],
      lastSyncAt: "",
    };
    vi.mocked(writeEpgConfig).mockImplementation(async (config) => {
      saved = config;
    });
    vi.mocked(readEpgConfig).mockImplementation(async () => saved);
    const hook = await renderUseEpg();
    await hook.rerender();
    await act(async () => {
      await hook.latest.setGuideHoursBefore(2);
    });
    await act(async () => {
      await hook.latest.setGuideHoursAfter(12);
    });
    await act(async () => {
      await hook.latest.addCustomUrl("  https://epg.example/xml  ");
    });
    await act(async () => {
      await hook.latest.addCustomUrl("https://epg.example/xml");
    });
    await act(async () => {
      await hook.latest.removeCustomUrl("https://epg.example/xml");
    });
    expect(saved.guideHoursBefore).toBe(2);
    expect(saved.guideHoursAfter).toBe(12);
    expect(saved.customUrls).toEqual([]);
    hook.unmount();
    vi.mocked(writeEpgConfig).mockImplementation(async () => {});
    vi.mocked(readEpgConfig).mockResolvedValue({
      enabled: true,
      syncIntervalHours: 12,
      guideHoursBefore: 6,
      guideHoursAfter: 24,
      customUrls: [],
      lastSyncAt: "",
    });
  });
});
