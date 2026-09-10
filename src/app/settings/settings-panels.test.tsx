import React from "react";
import { describe, expect, it, vi } from "vitest";
import { createTestRoot, hasNativeTestRenderer } from "@gpuix/react/testing";
import { connectTest } from "@gpuix/react/automation";
import type { CatalogSource, Channel } from "../../catalog";
import type { UseEpgResult } from "../../epg/use-epg";
import { GeneralPanel } from "./general-panel";
import { PlaylistsPanel } from "./playlists-panel";
import { ChannelsPanel } from "./channels-panel";
import { GroupsPanel } from "./groups-panel";
import { EpgPanel } from "./epg-panel";
import { SettingsDialog } from "./settings-dialog";
import { SettingsTabBar } from "./settings-tab-bar";

const describeNative = hasNativeTestRenderer ? describe : describe.skip;

const channels: Channel[] = [
  {
    id: "acme",
    name: "Acme TV",
    url: "https://example.com/acme.m3u8",
    group: "United States",
    sourceFile: "default.toml",
    sourceKind: "toml",
    editable: false,
  },
  {
    id: "mine",
    name: "My Stream",
    url: "https://example.com/mine.m3u8",
    group: "Custom",
    sourceFile: "user.toml",
    sourceKind: "toml",
    editable: true,
  },
];

const sources: CatalogSource[] = [
  {
    id: "file:default.toml",
    kind: "file",
    path: "default.toml",
    label: "default.toml",
    remote: false,
    epgUrl: "https://example.com/epg.xml",
  },
];

function fakeEpg(overrides: Partial<UseEpgResult> = {}): UseEpgResult {
  return {
    enabled: true,
    config: {
      enabled: true,
      syncIntervalHours: 12,
      guideHoursBefore: 6,
      guideHoursAfter: 24,
      customUrls: ["https://example.com/custom.xml"],
      lastSyncAt: "2020-01-01T00:00:00.000Z",
    },
    status: {
      feedCount: 1,
      programmeCount: 10,
      channelCount: 2,
      matchedChannelCount: 1,
      lastSyncAt: null,
      error: "sync failed",
    },
    syncing: false,
    syncProgress: null,
    syncLabel: null,
    getNow: () => null,
    getSchedule: () => [],
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

describeNative("settings panels", () => {
  it("renders the tab bar and general panel actions", async () => {
    const onDefault = vi.fn(async () => {});
    const onNative = vi.fn(async () => {});
    const onSetBase = vi.fn(async () => {});
    const { render, renderer } = createTestRoot({ width: 720, height: 640 });
    render(
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <SettingsTabBar tab="general" onTab={() => {}} />
        <GeneralPanel
          defaultSidebarView="all"
          onDefaultSidebarView={onDefault}
          nativeVideo={false}
          nativeVideoSupported
          onNativeVideo={onNative}
          baseFolder="/tmp/custom"
          resolvedBaseFolder="/default"
          onPickBaseFolder={async () => "/tmp/picked"}
          onSetBaseFolder={onSetBase}
        />
      </div>,
    );
    const app = await connectTest(renderer);
    await app.getByTestId("default-sidebar-view-favorites").waitFor();
    await app.getByTestId("default-sidebar-view-favorites").click();
    await app.getByTestId("native-video-toggle").click();
    await app.getByTestId("base-folder-choose").click();
    await app.getByTestId("base-folder-reset").click();
    await renderer.advanceTime(50);
    expect(onDefault).toHaveBeenCalled();
    await app.close();
  });

  it("hides native video when unsupported and picks a new base folder", async () => {
    const onSetBase = vi.fn(async () => {});
    const { render, renderer } = createTestRoot({ width: 720, height: 640 });
    render(
      <GeneralPanel
        defaultSidebarView="all"
        onDefaultSidebarView={vi.fn(async () => {})}
        nativeVideo={false}
        nativeVideoSupported={false}
        onNativeVideo={vi.fn(async () => {})}
        baseFolder={null}
        resolvedBaseFolder="/default"
        onPickBaseFolder={async () => "/tmp/new-base"}
        onSetBaseFolder={onSetBase}
      />,
    );
    const app = await connectTest(renderer);
    await app.getByTestId("base-folder-choose").waitFor();
    await app.getByTestId("base-folder-choose").click();
    await renderer.advanceTime(50);
    expect(onSetBase).toHaveBeenCalledWith("/tmp/new-base");
    await app.close();
  });

  it("covers the playlists panel", async () => {
    const counts = new Map([["default.toml", 2]]);
    const { render, renderer } = createTestRoot({ width: 720, height: 640 });
    render(
      <PlaylistsPanel
        sources={sources}
        channels={channels}
        counts={counts}
        onAddLink={vi.fn(async () => {
          throw new Error("bad url");
        })}
        onPickFile={async () => "https://example.com/list.m3u8"}
        onDeleteSource={vi.fn(async () => {})}
      />,
    );
    const app = await connectTest(renderer);
    await app.getByTestId("settings-add-url").waitFor();
    await app.getByTestId("settings-add-url").fill("https://example.com/x.m3u8");
    await app.getByTestId("settings-add-url-btn").click();
    await renderer.advanceTime(50);
    await app.getByTestId("settings-add-file").click();
    await renderer.advanceTime(50);
    await app.close();
  });

  it("covers channels and groups panels", async () => {
    const { render, renderer } = createTestRoot({ width: 720, height: 640 });
    render(
      <ChannelsPanel
        channels={channels}
        groups={["United States", "Custom"]}
        usePlaylistGroups
        groupAssignments={{}}
        onSaveChannel={vi.fn(async () => {})}
        onDeleteChannel={vi.fn(async () => {})}
        onAssignGroup={vi.fn(async () => {})}
      />,
    );
    renderer.flush();
    renderer.advanceTime(300);
    const app = await connectTest(renderer);
    await app.getByTestId("channels-add").waitFor();
    await app.getByTestId("channels-add").click();
    await app.getByTestId("channel-editor-back").waitFor();
    await app.getByTestId("channel-editor-back").click();

    render(
      <GroupsPanel
        playlistGroups={["United States", "Custom"]}
        channels={channels}
        usePlaylistGroups
        groupAssignments={{}}
        customGroupNames={["Custom"]}
        onTogglePlaylistGroups={vi.fn(async () => {})}
        onAddCustomGroup={vi.fn(async () => {})}
        onRemoveCustomGroup={vi.fn(async () => {})}
      />,
    );
    renderer.flush();
    renderer.advanceTime(300);
    await app.getByTestId("toggle-playlist-groups").waitFor();
    await app.getByTestId("toggle-playlist-groups").click();
    await app.getByTestId("settings-add-group").fill("Extra");
    await app.getByTestId("settings-add-group-btn").click();
    await app.close();
  });

  it("covers the epg panel and settings dialog tabs", async () => {
    const epg = fakeEpg();
    const { render, renderer } = createTestRoot({ width: 720, height: 640 });
    render(<EpgPanel sources={sources} epg={epg} />);
    const app = await connectTest(renderer);
    await app.getByTestId("toggle-epg").waitFor();
    await app.getByTestId("toggle-epg").click();
    await app.getByTestId("epg-sync-interval-12").click();
    await app.getByTestId("epg-guide-before-12").click();
    await app.getByTestId("epg-guide-after-24").click();
    await app.getByTestId("epg-custom-interval").fill("8");
    await app.getByTestId("epg-set-interval").click();
    await app.getByTestId("epg-custom-url").fill("https://example.com/guide.xml");
    await app.getByTestId("epg-add-url").click();
    await app.getByTestId("epg-sync-now").click();
    await app.getByTestId("epg-remove-url-0").click();

    render(
      <SettingsDialog
        sources={sources}
        channels={channels}
        groups={["United States", "Custom"]}
        usePlaylistGroups
        groupAssignments={{}}
        counts={new Map([["default.toml", 2]])}
        epg={epg}
        defaultSidebarView="all"
        onDefaultSidebarView={vi.fn(async () => {})}
        nativeVideo={false}
        nativeVideoSupported
        onNativeVideo={vi.fn(async () => {})}
        baseFolder={null}
        resolvedBaseFolder="/default"
        onPickBaseFolder={async () => null}
        onSetBaseFolder={vi.fn(async () => {})}
        onClose={vi.fn()}
        onAddLink={vi.fn(async () => {})}
        onDeleteSource={vi.fn(async () => {})}
        onSaveChannel={vi.fn(async () => {})}
        onDeleteChannel={vi.fn(async () => {})}
        onAssignGroup={vi.fn(async () => {})}
        onTogglePlaylistGroups={vi.fn(async () => {})}
        onAddCustomGroup={vi.fn(async () => {})}
        onRemoveCustomGroup={vi.fn(async () => {})}
        customGroupNames={[]}
        onPickFile={async () => null}
      />,
    );
    await app.getByTestId("app-version").waitFor();
    for (const tab of ["playlists", "channels", "groups", "epg"] as const) {
      await app.getByTestId(`settings-tab-${tab}`).click();
    }
    await app.getByTestId("settings-close").click();
    await app.close();
  });
});
