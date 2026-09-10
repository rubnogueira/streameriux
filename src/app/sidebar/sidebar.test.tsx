import React from "react";
import { describe, expect, it, vi } from "vitest";
import { createTestRoot, hasNativeTestRenderer } from "@gpuix/react/testing";
import { connectTest } from "@gpuix/react/automation";
import type { Channel } from "../../catalog";
import { Sidebar } from "./sidebar";

const describeNative = hasNativeTestRenderer ? describe : describe.skip;

const channels: Channel[] = [
  {
    id: "acme",
    name: "Acme TV",
    url: "https://example.com/acme.m3u8",
    group: "United States",
    country: "US",
    sourceFile: "default.toml",
    sourceKind: "toml",
    editable: false,
    favorite: true,
  },
  {
    id: "castr",
    name: "Castr",
    url: "https://example.com/castr.m3u8",
    group: "Live",
    country: "PT",
    sourceFile: "default.toml",
    sourceKind: "toml",
    editable: false,
  },
];

describeNative("Sidebar", () => {
  it("navigates views, search, and drill-down", async () => {
    const onSelect = vi.fn();
    const onQuery = vi.fn();
    const { render, renderer } = createTestRoot({ width: 320, height: 720 });
    render(
        <Sidebar
          channels={channels}
          selectedId="acme"
          query=""
          loading={false}
          usePlaylistGroups
          groupAssignments={{}}
          epgEnabled={false}
          epgSyncLabel="Synced 1m ago"
          getNow={() => null}
          onQuery={onQuery}
          onSelect={onSelect}
          onSettings={vi.fn()}
          onRefresh={vi.fn()}
          onToggleFavorite={vi.fn()}
          catalogError="broken"
          defaultSidebarView="all"
        />
    );
    const app = await connectTest(renderer);
    await app.getByTestId("view-groups").click();
    await app.getByTestId("group-Live").click();
    await app.getByTestId("channel-castr").click();
    await app.getByTestId("back-groups").click();
    await app.getByTestId("view-countries").click();
    await app.getByTestId("country-US").click();
    await app.getByTestId("search").fill("acme");
    await app.getByTestId("back-groups").click();
    await app.getByTestId("view-favorites").click();
    await app.getByTestId("refresh-catalog").click();
    await app.getByTestId("open-settings").click();
    expect(onSelect).toHaveBeenCalled();
    await app.close();
  });

  it("follows defaultSidebarView prop changes", () => {
    const { render, renderer } = createTestRoot({ width: 320, height: 520 });
    render(
      <Sidebar
        channels={channels}
        selectedId={null}
        query=""
        loading={false}
        usePlaylistGroups
        groupAssignments={{}}
        epgEnabled={false}
        epgSyncLabel={null}
        getNow={() => null}
        onQuery={vi.fn()}
        onSelect={vi.fn()}
        onSettings={vi.fn()}
        onRefresh={vi.fn()}
        onToggleFavorite={vi.fn()}
        catalogError={null}
        defaultSidebarView="all"
      />,
    );
    render(
      <Sidebar
        channels={channels}
        selectedId={null}
        query=""
        loading={false}
        usePlaylistGroups
        groupAssignments={{}}
        epgEnabled={false}
        epgSyncLabel={null}
        getNow={() => null}
        onQuery={vi.fn()}
        onSelect={vi.fn()}
        onSettings={vi.fn()}
        onRefresh={vi.fn()}
        onToggleFavorite={vi.fn()}
        catalogError={null}
        defaultSidebarView="favorites"
      />,
    );
    renderer.flush();
  });

  it("shows empty nav and loading labels", () => {
    const { render, renderer } = createTestRoot({ width: 320, height: 520 });
    render(
      <Sidebar
        channels={[]}
        selectedId={null}
        query=""
        loading
        usePlaylistGroups
        groupAssignments={{}}
        epgEnabled={false}
        epgSyncLabel={null}
        getNow={() => null}
        onQuery={() => {}}
        onSelect={() => {}}
        onSettings={() => {}}
        onRefresh={() => {}}
        onToggleFavorite={() => {}}
        catalogError={null}
        defaultSidebarView="groups"
      />,
    );
    expect(renderer.getPaintedText().join(" ")).toContain("Loading");
  });
});
