import { useState } from "react";
import type { CatalogSource } from "../../catalog";
import type { UseEpgResult } from "../../epg/use-epg";
import {
  ActionButton,
  IconButton,
  IntervalChip,
  SettingToggle,
  TextField,
  useAsyncAction,
} from "../components/primitives";
import { C, FONT } from "../theme";

const PRESET_INTERVALS = [6, 12, 24] as const;
const PRESET_GUIDE_HOURS = [3, 6, 12, 24] as const;

export function EpgPanel({ sources, epg }: { sources: CatalogSource[]; epg: UseEpgResult }) {
  const [customUrl, setCustomUrl] = useState("");
  const [customInterval, setCustomInterval] = useState("");
  const { busy, error, run } = useAsyncAction();
  const detected = sources.filter((source) => source.epgUrl);

  const addUrl = () => {
    const trimmed = customUrl.trim();
    if (!trimmed || busy) return;
    run(epg.addCustomUrl(trimmed), () => setCustomUrl(""));
  };

  const applyCustomInterval = () => {
    const hours = Number.parseInt(customInterval.trim(), 10);
    if (!Number.isFinite(hours) || hours < 1 || busy) return;
    run(epg.setSyncIntervalHours(hours), () => setCustomInterval(""));
  };

  const lastSync = epg.status.lastSyncAt
    ? new Date(epg.status.lastSyncAt).toLocaleString()
    : epg.config.lastSyncAt
      ? new Date(epg.config.lastSyncAt).toLocaleString()
      : "Never";

  const intervalActive = (hours: number) => epg.config.syncIntervalHours === hours;

  return (
    <div style={{ flexGrow: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 10 }}>
      <SettingToggle
        label="Enable EPG"
        hint="Show current programmes and the TV guide when guide data is available."
        checked={epg.enabled}
        testId="toggle-epg"
        onChange={(checked) => void epg.setEnabled(checked)}
      />
      <text
        style={{
          fontSize: 11,
          fontFamily: FONT,
          fontWeight: "600",
          color: C.tertiary,
          paddingLeft: 2,
        }}
      >
        SYNC INTERVAL
      </text>
      <div
        style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 6, paddingLeft: 2 }}
      >
        {PRESET_INTERVALS.map((hours) => (
          <IntervalChip
            key={hours}
            testId={`epg-sync-interval-${hours}`}
            label={`${hours}h`}
            active={intervalActive(hours)}
            onClick={() => void epg.setSyncIntervalHours(hours)}
          />
        ))}
      </div>
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
          value={customInterval}
          testId="epg-custom-interval"
          placeholder="Custom interval (hours)"
          onChange={setCustomInterval}
          onSubmit={applyCustomInterval}
        />
        <ActionButton
          icon="check"
          label="Set"
          testId="epg-set-interval"
          onClick={applyCustomInterval}
        />
        <text style={{ fontSize: 11, fontFamily: FONT, color: C.ghost }}>
          Current: {epg.config.syncIntervalHours}h
        </text>
      </div>
      <text
        style={{
          fontSize: 11,
          fontFamily: FONT,
          fontWeight: "600",
          color: C.tertiary,
          paddingLeft: 2,
        }}
      >
        GUIDE TIME RANGE
      </text>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 2 }}>
        <text style={{ fontSize: 11, fontFamily: FONT, color: C.secondary }}>Hours before now</text>
        <div style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {PRESET_GUIDE_HOURS.map((hours) => (
            <IntervalChip
              key={`before-${hours}`}
              testId={`epg-guide-before-${hours}`}
              label={`${hours}h`}
              active={epg.config.guideHoursBefore === hours}
              onClick={() => void epg.setGuideHoursBefore(hours)}
            />
          ))}
        </div>
        <text style={{ fontSize: 11, fontFamily: FONT, color: C.secondary, marginTop: 4 }}>
          Hours after now
        </text>
        <div style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {PRESET_GUIDE_HOURS.map((hours) => (
            <IntervalChip
              key={`after-${hours}`}
              testId={`epg-guide-after-${hours}`}
              label={`${hours}h`}
              active={epg.config.guideHoursAfter === hours}
              onClick={() => void epg.setGuideHoursAfter(hours)}
            />
          ))}
        </div>
      </div>
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
          value={customUrl}
          testId="epg-custom-url"
          placeholder="Custom XMLTV URL (.xml or .xml.gz)"
          onChange={setCustomUrl}
          onSubmit={addUrl}
        />
        <ActionButton icon="plus" label="Add" testId="epg-add-url" onClick={addUrl} />
        <ActionButton
          icon="refresh"
          label={epg.syncing || busy ? "Syncing…" : "Sync now"}
          testId="epg-sync-now"
          primary
          onClick={() => run(epg.syncNow(true))}
        />
      </div>
      {error ? (
        <text style={{ fontSize: 12, fontFamily: FONT, color: C.accent }}>{error}</text>
      ) : null}
      {epg.status.error ? (
        <text style={{ fontSize: 12, fontFamily: FONT, color: C.accent }}>{epg.status.error}</text>
      ) : null}
      <div
        style={{
          padding: 10,
          borderRadius: 10,
          backgroundColor: C.raised,
          borderWidth: 1,
          borderColor: C.border,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <text style={{ fontSize: 12, fontFamily: FONT, color: C.text }}>Status</text>
        <text style={{ fontSize: 11, fontFamily: FONT, color: C.ghost }}>
          Last sync: {lastSync}
        </text>
        <text style={{ fontSize: 11, fontFamily: FONT, color: C.ghost }}>
          {`${epg.status.feedCount} feeds · ${epg.status.programmeCount} programmes · ${epg.status.matchedChannelCount} channels matched`}
        </text>
      </div>
      {epg.config.customUrls.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <text
            style={{
              fontSize: 11,
              fontFamily: FONT,
              fontWeight: "600",
              color: C.tertiary,
              paddingLeft: 2,
            }}
          >
            CUSTOM URLS
          </text>
          {epg.config.customUrls.map((url, index) => (
            <div
              key={url}
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                minHeight: 36,
                paddingLeft: 10,
                paddingRight: 6,
                borderRadius: 8,
                backgroundColor: C.raised,
              }}
            >
              <text
                style={{
                  flexGrow: 1,
                  fontSize: 11,
                  fontFamily: FONT,
                  color: C.secondary,
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                }}
              >
                {url}
              </text>
              <IconButton
                icon="trash"
                size={28}
                color={C.ghost}
                testId={`epg-remove-url-${index}`}
                onClick={() => void epg.removeCustomUrl(url)}
              />
            </div>
          ))}
        </div>
      ) : null}
      {detected.length ? (
        <div
          style={{ flexGrow: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 4 }}
        >
          <text
            style={{
              fontSize: 11,
              fontFamily: FONT,
              fontWeight: "600",
              color: C.tertiary,
              paddingLeft: 2,
            }}
          >
            DETECTED FROM PLAYLISTS
          </text>
          <div
            style={{
              flexGrow: 1,
              minHeight: 0,
              overflow: "scroll",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {detected.map((source) => (
              <div
                key={source.id}
                style={{
                  paddingLeft: 10,
                  paddingRight: 10,
                  paddingTop: 8,
                  paddingBottom: 8,
                  borderRadius: 8,
                  backgroundColor: C.raised,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                <text style={{ fontSize: 12, fontFamily: FONT, color: C.text }}>
                  {source.label}
                </text>
                <text
                  style={{
                    fontSize: 10,
                    fontFamily: FONT,
                    color: C.ghost,
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                  }}
                >
                  {(source.epgUrl ?? "").slice(0, 120)}
                  {(source.epgUrl?.length ?? 0) > 120 ? "…" : ""}
                </text>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <text style={{ fontSize: 11, fontFamily: FONT, color: C.ghost, paddingLeft: 2 }}>
          Add a playlist with `x-tvg-url` in its header to auto-detect EPG sources.
        </text>
      )}
    </div>
  );
}
