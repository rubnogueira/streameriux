import React from "react";
import { describe, expect, it, vi } from "vitest";
import { createTestRoot, hasNativeTestRenderer } from "@gpuix/react/testing";
import { connectTest } from "@gpuix/react/automation";
import type { Channel } from "../../catalog";
import type { UseEpgResult } from "../../epg/use-epg";
import type { EpgProgramme } from "../../epg/xmltv";
import { EpgGuidePanel } from "./epg-guide-panel";

const describeNative = hasNativeTestRenderer ? describe : describe.skip;

const channel: Channel = {
  id: "acme",
  name: "Acme TV",
  url: "https://example.com/acme.m3u8",
  sourceFile: "default.toml",
  sourceKind: "toml",
  editable: false,
};

const now = Date.now();
const schedule: EpgProgramme[] = [
  {
    start: now - 3_600_000,
    stop: now - 1_800_000,
    title: "Morning",
    desc: "Old show",
    category: "News",
  },
  {
    start: now - 1_800_000,
    stop: now + 1_800_000,
    title: "Live block",
    desc: "Detailed synopsis",
    category: "Live",
  },
];

function epgStub(overrides: Partial<UseEpgResult> = {}): UseEpgResult {
  return {
    enabled: true,
    config: {
      enabled: true,
      syncIntervalHours: 12,
      guideHoursBefore: 6,
      guideHoursAfter: 24,
      customUrls: [],
      lastSyncAt: "",
    },
    status: {
      feedCount: 0,
      programmeCount: schedule.length,
      channelCount: 1,
      matchedChannelCount: 1,
      lastSyncAt: null,
      error: null,
    },
    syncing: false,
    syncProgress: null,
    syncLabel: null,
    getNow: () => schedule[1] ?? null,
    getSchedule: () => schedule,
    resolveEpgId: () => "acme.test",
    syncNow: vi.fn(async () => {}),
    setEnabled: vi.fn(async () => {}),
    setSyncIntervalHours: vi.fn(async () => {}),
    setGuideHoursBefore: vi.fn(async () => {}),
    setGuideHoursAfter: vi.fn(async () => {}),
    addCustomUrl: vi.fn(async () => {}),
    removeCustomUrl: vi.fn(async () => {}),
    ...overrides,
  };
}

describeNative("EpgGuidePanel", () => {
  it("lists programmes and expands descriptions", async () => {
    const onClose = vi.fn();
    const { render, renderer } = createTestRoot({ width: 520, height: 680 });
    render(<EpgGuidePanel channel={channel} epg={epgStub()} onClose={onClose} />);
    const app = await connectTest(renderer);
    await app.getByTestId("guide-now").waitFor();
    await app.getByTestId("guide-now").click();
    expect(renderer.getPaintedText().join(" ")).toContain("Detailed synopsis");
    await app.getByTestId("guide-close").click();
    expect(onClose).toHaveBeenCalled();
    await app.close();
  });

  it("shows empty states when guide data is missing", async () => {
    const { render, renderer } = createTestRoot({ width: 520, height: 400 });
    render(
      <EpgGuidePanel
        channel={channel}
        epg={epgStub({ enabled: false, resolveEpgId: () => null, getSchedule: () => [] })}
        onClose={() => {}}
      />,
    );
    expect(renderer.getPaintedText().join(" ")).toContain("EPG is disabled");
    render(
      <EpgGuidePanel
        channel={channel}
        epg={epgStub({ resolveEpgId: () => null, getSchedule: () => [] })}
        onClose={() => {}}
      />,
    );
    expect(renderer.getPaintedText().join(" ")).toContain("No guide data");
    render(
      <EpgGuidePanel
        channel={channel}
        epg={epgStub({ getSchedule: () => [] })}
        onClose={() => {}}
      />,
    );
    expect(renderer.getPaintedText().join(" ")).toContain("No programmes");
  });
});
