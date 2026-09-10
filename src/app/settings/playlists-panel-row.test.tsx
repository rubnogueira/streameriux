import React from "react";
import { describe, expect, it, vi } from "vitest";
import { createTestRoot, hasNativeTestRenderer } from "@gpuix/react/testing";
import { connectTest } from "@gpuix/react/automation";
import type { CatalogSource, Channel } from "../../catalog";
import { buildPlaylistRows } from "./playlists-panel.logic";
import { renderPlaylistRow } from "./playlists-panel-row";

const describeNative = hasNativeTestRenderer ? describe : describe.skip;

const fileSource = (path: string): CatalogSource => ({
  id: `file:${path}`,
  kind: "file",
  path,
  label: path,
  remote: false,
});

const playlistSource: CatalogSource = {
  id: "playlist:remote",
  kind: "playlist",
  path: "https://example.com/list.m3u8",
  label: "Remote list",
  remote: true,
};

const channel: Channel = {
  id: "acme",
  name: "Acme TV",
  url: "https://example.com/a.m3u8",
  group: "News",
  chno: "3",
  sourceFile: "default.toml",
  sourceKind: "toml",
  editable: false,
};

describeNative("renderPlaylistRow", () => {
  it("renders note, channel, file, and playlist rows", async () => {
    const toggle = vi.fn();
    const onDelete = vi.fn();
    const rows = buildPlaylistRows(
      [fileSource("default.toml"), fileSource("empty.toml"), playlistSource],
      new Set(["file:default.toml", "file:empty.toml"]),
      new Map([
        ["default.toml", 1],
        ["empty.toml", 0],
      ]),
      new Map([["default.toml", [channel]]]),
    );
    const { render, renderer } = createTestRoot({ width: 720, height: 480 });
    render(
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {rows.map((row, index) => (
          <div key={index}>{renderPlaylistRow(row, { toggle, onDeleteSource: onDelete })}</div>
        ))}
      </div>,
    );
    renderer.flush();
    const app = await connectTest(renderer);
    await app.getByTestId("source-toggle-file:default.toml").waitFor();
    await app.getByTestId("source-toggle-file:default.toml").click();
    await app.getByTestId("source-delete-file:default.toml").click();
    await app.getByTestId("source-toggle-playlist:remote").click();
    expect(toggle).toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalled();
    await app.close();
  });
});
