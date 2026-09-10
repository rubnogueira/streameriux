import type { ReactNode } from "react";
import type { CatalogSource } from "../../catalog";
import { ChannelNumber } from "../components/channel";
import { Icon, IconButton } from "../components/primitives";
import { C, FONT } from "../theme";
import type { PlaylistRow } from "./playlists-panel.logic";

export function renderPlaylistRow(
  row: PlaylistRow,
  handlers: {
    toggle: (id: string) => void;
    onDeleteSource: (source: CatalogSource) => void | Promise<void>;
  },
): ReactNode {
  if (row.kind === "note") {
    return (
      <div
        style={{
          paddingLeft: 44,
          paddingRight: 10,
          minHeight: 36,
          display: "flex",
          alignItems: "center",
        }}
      >
        <text style={{ fontSize: 11, fontFamily: FONT, color: C.ghost }}>{row.label}</text>
      </div>
    );
  }
  if (row.kind === "channel") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          minHeight: 44,
          paddingLeft: 44,
          paddingRight: 10,
        }}
      >
        {row.channel.chno ? <ChannelNumber chno={row.channel.chno} /> : null}
        <text
          style={{
            flexGrow: 1,
            minWidth: 0,
            fontSize: 12,
            fontFamily: FONT,
            color: C.secondary,
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
          }}
        >
          {row.channel.name}
        </text>
        <text style={{ fontSize: 11, fontFamily: FONT, color: C.ghost }}>
          {row.channel.group ?? ""}
        </text>
      </div>
    );
  }
  const source = row.source;
  return (
    <div
      testId={`source-${source.id}`}
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        minHeight: 56,
        paddingLeft: 8,
        paddingRight: 6,
        borderRadius: 12,
        hover: { backgroundColor: C.overlay },
      }}
    >
      <div
        testId={`source-toggle-${source.id}`}
        onClick={() => handlers.toggle(source.id)}
        style={{
          width: 22,
          height: 22,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
        }}
      >
        <text style={{ fontSize: 12, fontFamily: FONT, color: C.tertiary }}>
          {row.open ? "▾" : "▸"}
        </text>
      </div>
      <Icon
        name={source.kind === "playlist" ? "radio" : "inbox"}
        size={16}
        color={C.secondary}
      />
      <div
        onClick={() => handlers.toggle(source.id)}
        style={{
          flexGrow: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 3,
          cursor: "pointer",
        }}
      >
        <text
          style={{
            fontSize: 13,
            fontFamily: FONT,
            fontWeight: "500",
            color: C.text,
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
          }}
        >
          {source.label}
        </text>
        <text
          style={{
            fontSize: 11,
            fontFamily: FONT,
            color: C.ghost,
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
          }}
        >
          {source.path}
        </text>
      </div>
      <text style={{ fontSize: 11, fontFamily: FONT, color: C.tertiary }}>{`${row.count} ch`}</text>
      <IconButton
        icon="trash"
        size={30}
        color={C.ghost}
        testId={`source-delete-${source.id}`}
        onClick={() => void handlers.onDeleteSource(source)}
      />
    </div>
  );
}
