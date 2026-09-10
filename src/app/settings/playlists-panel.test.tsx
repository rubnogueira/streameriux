import React from "react";
import { describe, expect, it, vi } from "vitest";
import { createTestRoot, hasNativeTestRenderer } from "@gpuix/react/testing";
import { connectTest } from "@gpuix/react/automation";
import type { CatalogSource, Channel } from "../../catalog";
import { PlaylistsPanel } from "./playlists-panel";

const describeNative = hasNativeTestRenderer ? describe : describe.skip;

const sources: CatalogSource[] = [
  {
    id: "file:default.toml",
    kind: "file",
    path: "default.toml",
    label: "default.toml",
    remote: false,
  },
  {
    id: "file:empty.toml",
    kind: "file",
    path: "empty.toml",
    label: "empty.toml",
    remote: false,
  },
];

const channels: Channel[] = [
  {
    id: "acme",
    name: "Acme TV",
    url: "https://example.com/acme.m3u8",
    sourceFile: "default.toml",
    sourceKind: "toml",
    editable: false,
  },
];

describeNative("PlaylistsPanel", () => {
  it("shows the empty state", () => {
    const { render, renderer } = createTestRoot({ width: 640, height: 480 });
    render(
      <PlaylistsPanel
        sources={[]}
        channels={[]}
        counts={new Map()}
        onAddLink={vi.fn(async () => {})}
        onPickFile={async () => null}
        onDeleteSource={vi.fn(async () => {})}
      />,
    );
    renderer.flush();
  });

  it("ignores blank submissions while busy", async () => {
    let resolve!: () => void;
    const pending = new Promise<void>((r) => {
      resolve = r;
    });
    const onAddLink = vi.fn(() => pending);
    const { render, renderer } = createTestRoot({ width: 720, height: 640 });
    render(
      <PlaylistsPanel
        sources={sources}
        channels={channels}
        counts={new Map([["default.toml", 1]])}
        onAddLink={onAddLink}
        onPickFile={async () => null}
        onDeleteSource={vi.fn(async () => {})}
      />,
    );
    const app = await connectTest(renderer);
    await app.getByTestId("settings-add-url-btn").waitFor();
    await app.getByTestId("settings-add-url-btn").click();
    await app.getByTestId("settings-add-url").fill("   ");
    await app.getByTestId("settings-add-url-btn").click();
    resolve();
    await renderer.advanceTime(50);
    await app.close();
    expect(onAddLink).not.toHaveBeenCalled();
  });

  it("adds links and picks files", async () => {
    const onAddLink = vi.fn(async () => {});
    const { render, renderer } = createTestRoot({ width: 720, height: 640 });
    render(
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
        <PlaylistsPanel
          sources={sources}
          channels={channels}
          counts={new Map([
            ["default.toml", 1],
            ["empty.toml", 0],
          ])}
          onAddLink={onAddLink}
          onPickFile={async () => "https://example.com/list.m3u8"}
          onDeleteSource={vi.fn(async () => {})}
        />
      </div>,
    );
    renderer.flush();
    renderer.advanceTime(300);
    const app = await connectTest(renderer);
    await app.getByTestId("settings-add-url").waitFor();
    await app.getByTestId("settings-add-url").fill("https://example.com/new.m3u8");
    await app.getByTestId("settings-add-url-btn").click();
    await app.getByTestId("settings-add-file").click();
    await renderer.advanceTime(50);
    await app.close();
    expect(onAddLink).toHaveBeenCalled();
  });
});
