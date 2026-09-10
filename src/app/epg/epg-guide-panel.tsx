import { useMemo, useState, type ReactNode } from "react";
import type { Channel } from "../../catalog";
import type { UseEpgResult } from "../../epg/use-epg";
import { formatEpgRange } from "../../lib/time";
import { AddChip, Overlay } from "../components/primitives";
import { ChannelMark } from "../components/channel";
import { WindowedList } from "../components/list";
import { dedupeProgrammes } from "../utils";
import { C, FONT } from "../theme";

export function EpgGuidePanel({
  channel,
  epg,
  onClose,
}: {
  channel: Channel;
  epg: UseEpgResult;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const now = Date.now();
  const from = now - epg.config.guideHoursBefore * 60 * 60 * 1000;
  const to = now + epg.config.guideHoursAfter * 60 * 60 * 1000;
  const schedule = dedupeProgrammes(epg.getSchedule(channel, from, to));
  const epgId = epg.resolveEpgId(channel);
  const activeIndex = useMemo(
    () => schedule.findIndex((programme) => now >= programme.start && now < programme.stop),
    [schedule, now],
  );

  let body: ReactNode;
  if (!epg.enabled) {
    body = (
      <text style={{ fontSize: 13, fontFamily: FONT, color: C.tertiary }}>
        EPG is disabled — enable it in Settings
      </text>
    );
  } else if (!epgId) {
    body = (
      <text style={{ fontSize: 13, fontFamily: FONT, color: C.tertiary }}>
        No guide data for this channel
      </text>
    );
  } else if (schedule.length === 0) {
    body = (
      <text style={{ fontSize: 13, fontFamily: FONT, color: C.tertiary }}>
        No programmes in this window — try Sync now in Settings
      </text>
    );
  } else {
    body = (
      <WindowedList
        listKey={`guide-${channel.id}`}
        count={schedule.length}
        estimatedItemHeight={72}
        scrollToIndex={activeIndex >= 0 ? activeIndex : null}
        renderRow={(index) => {
          const programme = schedule[index]!;
          const active = now >= programme.start && now < programme.stop;
          const open = expanded === index;
          return (
            <div
              testId={active ? "guide-now" : undefined}
              onClick={() => setExpanded(open ? null : index)}
              style={{
                paddingLeft: 10,
                paddingRight: 10,
                paddingTop: 8,
                paddingBottom: 8,
                borderRadius: 10,
                cursor: programme.desc ? "pointer" : "default",
                backgroundColor: active ? C.accentSoft : C.raised,
                borderWidth: 1,
                borderColor: active ? C.accent : C.border,
                hover: programme.desc
                  ? { backgroundColor: active ? C.accentSoft : C.overlay }
                  : undefined,
              }}
            >
              <text style={{ fontSize: 10, fontFamily: FONT, color: active ? C.live : C.ghost }}>
                {formatEpgRange(programme.start, programme.stop, now)}
              </text>
              <text
                style={{
                  fontSize: 13,
                  fontFamily: FONT,
                  fontWeight: active ? "600" : "500",
                  color: C.text,
                }}
              >
                {programme.title}
              </text>
              {programme.category ? (
                <text style={{ fontSize: 10, fontFamily: FONT, color: C.tertiary }}>
                  {programme.category}
                </text>
              ) : null}
              {open && programme.desc ? (
                <text style={{ fontSize: 11, fontFamily: FONT, color: C.secondary, marginTop: 4 }}>
                  {programme.desc}
                </text>
              ) : null}
            </div>
          );
        }}
      />
    );
  }

  return (
    <Overlay>
      <div
        style={{
          width: 480,
          height: 640,
          borderRadius: 16,
          backgroundColor: C.sidebar,
          borderWidth: 1,
          borderColor: C.border,
          display: "flex",
          flexDirection: "column",
          padding: 18,
          gap: 12,
        }}
      >
        <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 10 }}>
          <ChannelMark channel={channel} size={32} />
          <div
            style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}
          >
            <text style={{ fontSize: 15, fontFamily: FONT, fontWeight: "600", color: C.text }}>
              {channel.name}
            </text>
            {epgId ? (
              <text style={{ fontSize: 10, fontFamily: FONT, color: C.ghost }}>{epgId}</text>
            ) : null}
          </div>
          <AddChip label="Close" testId="guide-close" onClick={onClose} />
        </div>
        {body}
      </div>
    </Overlay>
  );
}
