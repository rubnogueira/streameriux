import type { CatalogSource, Channel } from "../../catalog";

export const HIDDEN_SOURCE_LABELS = new Set(["user.toml"]);

export type PlaylistRow =
  | { kind: "playlist"; source: CatalogSource; count: number; open: boolean }
  | { kind: "channel"; channel: Channel }
  | { kind: "note"; label: string };

export function visiblePlaylists(sources: CatalogSource[]): CatalogSource[] {
  return sources.filter(
    (source) => !(source.kind === "file" && HIDDEN_SOURCE_LABELS.has(source.label)),
  );
}

export function channelsGroupedBySource(channels: Channel[]): Map<string, Channel[]> {
  const map = new Map<string, Channel[]>();
  for (const channel of channels) {
    const list = map.get(channel.sourceFile);
    if (list) list.push(channel);
    else map.set(channel.sourceFile, [channel]);
  }
  return map;
}

export function toggleOpenSet(open: Set<string>, id: string): Set<string> {
  const next = new Set(open);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function buildPlaylistRows(
  playlists: CatalogSource[],
  open: Set<string>,
  counts: Map<string, number>,
  channelsBySource: Map<string, Channel[]>,
): PlaylistRow[] {
  const list: PlaylistRow[] = [];
  for (const source of playlists) {
    const isOpen = open.has(source.id);
    list.push({ kind: "playlist", source, count: counts.get(source.path) ?? 0, open: isOpen });
    if (isOpen) {
      const items = channelsBySource.get(source.path) ?? [];
      if (items.length === 0)
        list.push({ kind: "note", label: "No channels loaded from this source yet" });
      for (const channel of items) list.push({ kind: "channel", channel });
    }
  }
  return list;
}
