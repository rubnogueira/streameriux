import { describe, expect, it } from "vitest";
import type { CatalogSource, Channel } from "../../catalog";
import {
  buildPlaylistRows,
  channelsGroupedBySource,
  toggleOpenSet,
  visiblePlaylists,
} from "./playlists-panel.logic";

const fileSource = (path: string): CatalogSource => ({
  id: `file:${path}`,
  kind: "file",
  path,
  label: path,
  remote: false,
});

const channel: Channel = {
  id: "acme",
  name: "Acme",
  url: "https://example.com/a.m3u8",
  sourceFile: "default.toml",
  sourceKind: "toml",
  editable: false,
};

describe("playlists panel logic", () => {
  it("hides user.toml and groups channels", () => {
    const sources = [fileSource("default.toml"), fileSource("user.toml")];
    expect(visiblePlaylists(sources)).toHaveLength(1);
    const grouped = channelsGroupedBySource([channel, { ...channel, id: "b", sourceFile: "x" }]);
    expect(grouped.get("default.toml")).toHaveLength(1);
    expect(grouped.get("x")).toHaveLength(1);
  });

  it("toggles open ids", () => {
    expect(toggleOpenSet(new Set(["a"]), "a").size).toBe(0);
    expect(toggleOpenSet(new Set(), "b").has("b")).toBe(true);
  });

  it("builds collapsed and expanded rows", () => {
    const playlists = [fileSource("default.toml"), fileSource("empty.toml")];
    const counts = new Map([
      ["default.toml", 1],
      ["empty.toml", 0],
    ]);
    const bySource = channelsGroupedBySource([channel]);
    const collapsed = buildPlaylistRows(playlists, new Set(), counts, bySource);
    expect(collapsed).toHaveLength(2);

    const open = new Set(["file:default.toml", "file:empty.toml"]);
    const expanded = buildPlaylistRows(playlists, open, counts, bySource);
    expect(expanded.some((row) => row.kind === "channel")).toBe(true);
    expect(expanded.some((row) => row.kind === "note")).toBe(true);
  });
});
