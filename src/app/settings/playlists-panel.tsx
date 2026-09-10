import { useMemo, useState } from "react";
import type { CatalogSource, Channel } from "../../catalog";
import { ActionButton, TextField, useAsyncAction } from "../components/primitives";
import { WindowedList } from "../components/list";
import { C, FONT } from "../theme";
import {
  buildPlaylistRows,
  channelsGroupedBySource,
  toggleOpenSet,
  visiblePlaylists,
} from "./playlists-panel.logic";
import { renderPlaylistRow } from "./playlists-panel-row";

export { HIDDEN_SOURCE_LABELS } from "./playlists-panel.logic";

export function PlaylistsPanel({
  sources,
  channels,
  counts,
  onAddLink,
  onPickFile,
  onDeleteSource,
}: {
  sources: CatalogSource[];
  channels: Channel[];
  counts: Map<string, number>;
  onAddLink: (ref: string) => Promise<void>;
  onPickFile: () => Promise<string | null>;
  onDeleteSource: (source: CatalogSource) => Promise<void>;
}) {
  const [ref, setRef] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const { busy, error, run } = useAsyncAction();

  const playlists = useMemo(() => visiblePlaylists(sources), [sources]);
  const channelsBySource = useMemo(() => channelsGroupedBySource(channels), [channels]);
  const rows = useMemo(
    () => buildPlaylistRows(playlists, open, counts, channelsBySource),
    [playlists, open, counts, channelsBySource],
  );

  const add = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || busy) return;
    run(onAddLink(trimmed), () => setRef(""));
  };
  const browse = () => {
    void onPickFile().then((path) => {
      if (path) add(path);
    });
  };
  const toggle = (id: string) => setOpen((prev) => toggleOpenSet(prev, id));

  return (
    <div style={{ flexGrow: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingLeft: 2,
          paddingRight: 2,
        }}
      >
        <TextField
          value={ref}
          testId="settings-add-url"
          placeholder="Playlist link (.m3u8 / .m3u / .toml or panel URL)"
          onChange={setRef}
          onSubmit={() => add(ref)}
        />
        <ActionButton
          icon="plus"
          label="Add"
          testId="settings-add-url-btn"
          onClick={() => add(ref)}
        />
        <ActionButton
          icon="folderPlus"
          label="Add file"
          testId="settings-add-file"
          onClick={browse}
        />
      </div>
      {error ? (
        <text style={{ fontSize: 12, fontFamily: FONT, color: C.accent }}>{error}</text>
      ) : null}

      {playlists.length === 0 ? (
        <div
          style={{
            flexGrow: 1,
            minHeight: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <text style={{ fontSize: 13, fontFamily: FONT, color: C.tertiary }}>
            No playlists yet
          </text>
        </div>
      ) : (
        <WindowedList
          listKey="settings-playlists"
          count={rows.length}
          estimatedItemHeight={56}
          renderRow={(index) =>
            renderPlaylistRow(rows[index]!, { toggle, onDeleteSource })
          }
        />
      )}
    </div>
  );
}
