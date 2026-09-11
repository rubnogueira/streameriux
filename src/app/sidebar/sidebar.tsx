import { memo, useMemo, useState } from "react";
import { SIDEBAR_VIEWS, type SidebarView } from "../../settings/app-settings";
import { NO_GROUP, resolveGroupKey, type Channel } from "../../catalog";
import { buildCountryMap, countryLabel, NO_COUNTRY, orderedCountryKeys } from "../../geo/countries";
import type { EpgProgramme } from "../../epg/xmltv";
import { playerFocusedRef, textInputFocusProps } from "../focus";
import { AppBrand } from "../components/app-brand";
import { Icon, IconButton } from "../components/primitives";
import { ChannelRow, GroupRow } from "../components/channel";
import { WindowedList } from "../components/list";
import { channelMatchesSearch, orderedKeys, programmeSubtitle } from "../utils";
import { C, FONT, SIDEBAR_WIDTH, SIDEBAR_TOP_INSET, SIDEBAR_SIDE_INSET } from "../theme";

export function ViewTabs({
  view,
  onView,
}: {
  view: SidebarView;
  onView: (view: SidebarView) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        gap: 2,
        padding: 3,
        borderRadius: 10,
        backgroundColor: C.raised,
        borderWidth: 1,
        borderColor: C.border,
      }}
    >
      {SIDEBAR_VIEWS.map((tab) => {
        const active = tab.id === view;
        return (
          <div
            key={tab.id}
            testId={`view-${tab.id}`}
            onClick={() => onView(tab.id)}
            style={{
              flexGrow: 1,
              height: 26,
              borderRadius: 7,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              backgroundColor: active ? C.overlayStrong : undefined,
              hover: active ? undefined : { backgroundColor: C.overlay },
            }}
          >
            <text
              style={{
                fontSize: 11,
                fontFamily: FONT,
                fontWeight: active ? "600" : "500",
                color: active ? C.text : C.tertiary,
              }}
            >
              {tab.label}
            </text>
          </div>
        );
      })}
    </div>
  );
}

export const Sidebar = memo(function Sidebar({
  channels,
  selectedId,
  query,
  loading,
  usePlaylistGroups,
  groupAssignments,
  epgEnabled,
  epgSyncLabel,
  getNow,
  onQuery,
  onSelect,
  onSettings,
  onRefresh,
  onToggleFavorite,
  onToggleCollapsed,
  catalogError,
  defaultSidebarView,
}: {
  channels: Channel[];
  selectedId: string | null;
  query: string;
  loading: boolean;
  usePlaylistGroups: boolean;
  groupAssignments: Record<string, string>;
  epgEnabled: boolean;
  epgSyncLabel: string | null;
  getNow: (channel: Channel) => EpgProgramme | null;
  onQuery: (value: string) => void;
  onSelect: (channel: Channel) => void;
  onSettings: () => void;
  onRefresh: () => void;
  onToggleFavorite: (channel: Channel) => void;
  onToggleCollapsed: () => void;
  catalogError: string | null;
  defaultSidebarView: SidebarView;
}) {
  const groupFor = (channel: Channel) =>
    resolveGroupKey(channel, usePlaylistGroups, groupAssignments);
  const [view, setView] = useState<SidebarView>(defaultSidebarView);
  const [prevDefaultSidebarView, setPrevDefaultSidebarView] = useState(defaultSidebarView);
  const [drill, setDrill] = useState<string | null>(null);

  if (defaultSidebarView !== prevDefaultSidebarView) {
    setPrevDefaultSidebarView(defaultSidebarView);
    setView(defaultSidebarView);
    setDrill(null);
  }

  const byGroup = useMemo(() => {
    const map = new Map<string, Channel[]>();
    for (const channel of channels) {
      const key = groupFor(channel);
      (map.get(key) ?? map.set(key, []).get(key)!).push(channel);
    }
    return map;
  }, [channels, usePlaylistGroups, groupAssignments]);

  const byCountry = useMemo(() => buildCountryMap(channels), [channels]);

  const favorites = useMemo(() => channels.filter((channel) => channel.favorite), [channels]);
  const allChannels = channels;

  const needle = query.trim().toLowerCase();
  const searching = needle.length > 0;
  const searchResults = useMemo(() => {
    if (!searching) return [];
    return channels.filter((channel) => channelMatchesSearch(channel, needle));
  }, [channels, needle, searching]);

  const changeView = (next: SidebarView) => {
    setView(next);
    setDrill(null);
  };

  const goBack = () => {
    if (drill !== null) setDrill(null);
    else if (searching) onQuery("");
  };

  // Resolve what the body shows: a nav list (groups/countries) or channels.
  const usesDrill = !searching && (view === "groups" || view === "countries");
  const navMap = view === "countries" ? byCountry : byGroup;
  const navTail = view === "countries" ? NO_COUNTRY : NO_GROUP;
  const navNames = useMemo(() => {
    if (!usesDrill || drill !== null) return [];
    return view === "countries"
      ? orderedCountryKeys(navMap, navTail)
      : orderedKeys(navMap, navTail);
  }, [usesDrill, drill, navMap, navTail, view]);

  const channelList: Channel[] = searching
    ? searchResults
    : view === "all"
      ? allChannels
      : view === "favorites"
        ? favorites
        : drill !== null
          ? (navMap.get(drill) ?? [])
          : [];

  const showNav = usesDrill && drill === null;
  const showBack = drill !== null || searching;
  const emptyChannelsLabel = searching
    ? "No matches"
    : view === "favorites"
      ? "No favorites yet — tap the star on a channel"
      : loading
        ? "Loading…"
        : "No channels yet";

  const statusText = searching
    ? `${searchResults.length} results`
    : view === "favorites"
      ? `${favorites.length} favorites`
      : view === "all"
        ? `${allChannels.length} channels`
        : `${navNames.length} ${view === "countries" ? "countries" : "groups"} · ${channels.length} channels`;

  const subtitleFor = (channel: Channel): string => {
    if (epgEnabled) {
      const now = programmeSubtitle(channel, getNow);
      if (now) return now;
    }
    return view === "countries"
      ? (channel.group ?? NO_GROUP)
      : groupFor(channel) !== NO_GROUP
        ? groupFor(channel)
        : channel.country
          ? countryLabel(channel.country.split(";")[0] ?? "")
          : NO_GROUP;
  };

  return (
    <div
      testId="sidebar"
      onMouseEnter={() => {
        playerFocusedRef.current = false;
      }}
      style={{
        width: SIDEBAR_WIDTH,
        height: "100%",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        backgroundColor: C.sidebar,
        borderRightWidth: 1,
        borderColor: C.border,
      }}
    >
      <div
        style={{
          paddingTop: SIDEBAR_TOP_INSET,
          paddingLeft: SIDEBAR_SIDE_INSET,
          paddingRight: SIDEBAR_SIDE_INSET,
          paddingBottom: 12,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 6 }}>
          <IconButton
            icon="menu"
            testId="collapse-sidebar"
            onClick={onToggleCollapsed}
            color={C.secondary}
            size={30}
          />
          <AppBrand />
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            height: 36,
            paddingLeft: 10,
            paddingRight: 10,
            borderRadius: 10,
            backgroundColor: C.raised,
            borderWidth: 1,
            borderColor: C.border,
          }}
        >
          <Icon name="search" size={13} color={C.ghost} />
          <input
            testId="search"
            value={query}
            placeholder="Search channels"
            onChange={(event) => onQuery(event.value ?? "")}
            {...textInputFocusProps()}
            style={{ flexGrow: 1, fontSize: 13, fontFamily: FONT, color: C.text }}
          />
        </div>
        {searching ? null : <ViewTabs view={view} onView={changeView} />}
        {showBack ? (
          <div
            testId="back-groups"
            onClick={goBack}
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              minHeight: 20,
              cursor: "pointer",
            }}
          >
            <Icon name="chevronLeft" size={14} color={C.secondary} />
            <text
              style={{
                flexGrow: 1,
                minWidth: 0,
                fontSize: 12,
                fontFamily: FONT,
                fontWeight: "600",
                color: C.text,
              }}
            >
              {searching
                ? "Search results"
                : view === "countries" && drill
                  ? countryLabel(drill)
                  : drill}
            </text>
            <text style={{ fontSize: 11, fontFamily: FONT, color: C.ghost }}>
              {String(channelList.length)}
            </text>
          </div>
        ) : (
          <text style={{ fontSize: 11, fontFamily: FONT, color: C.ghost }}>
            {loading ? "Loading…" : statusText}
          </text>
        )}
      </div>

      {showNav ? (
        navNames.length === 0 ? (
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
              {loading ? "Loading…" : view === "countries" ? "No countries yet" : "No groups yet"}
            </text>
          </div>
        ) : (
          <WindowedList
            listKey={`nav-${view}`}
            count={navNames.length}
            estimatedItemHeight={48}
            renderRow={(index) => {
              const name = navNames[index]!;
              return (
                <GroupRow
                  name={view === "countries" ? countryLabel(name) : name}
                  count={(navMap.get(name) ?? []).length}
                  testId={`${view === "countries" ? "country" : "group"}-${name}`}
                  onClick={() => setDrill(name)}
                />
              );
            }}
          />
        )
      ) : channelList.length === 0 ? (
        <div
          style={{
            flexGrow: 1,
            minHeight: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            paddingLeft: 24,
            paddingRight: 24,
          }}
        >
          <text style={{ fontSize: 13, fontFamily: FONT, color: C.tertiary, textAlign: "center" }}>
            {emptyChannelsLabel}
          </text>
        </div>
      ) : (
        <WindowedList
          listKey={searching ? `search-${needle}` : `${view}-${drill ?? "root"}`}
          count={channelList.length}
          estimatedItemHeight={60}
          renderRow={(index) => {
            const channel = channelList[index]!;
            return (
              <ChannelRow
                channel={channel}
                active={channel.id === selectedId}
                subtitle={subtitleFor(channel)}
                onClick={() => onSelect(channel)}
                onToggleFavorite={() => onToggleFavorite(channel)}
              />
            );
          }}
        />
      )}

      <div
        style={{
          flexShrink: 0,
          padding: 12,
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          borderTopWidth: 1,
          borderColor: C.border,
        }}
      >
        <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
          {catalogError ? (
            <text style={{ fontSize: 12, fontFamily: FONT, color: C.accent }}>
              Some sources failed to load
            </text>
          ) : null}
          {epgSyncLabel ? (
            <text
              testId="epg-sync-status"
              style={{
                fontSize: 11,
                fontFamily: FONT,
                color: epgSyncLabel.startsWith("Syncing") ? C.secondary : C.ghost,
              }}
            >
              {epgSyncLabel}
            </text>
          ) : null}
        </div>
        <IconButton
          icon="refresh"
          testId="refresh-catalog"
          onClick={onRefresh}
          color={C.secondary}
        />
        <IconButton
          icon="settings"
          testId="open-settings"
          onClick={onSettings}
          color={catalogError ? C.accent : C.secondary}
        />
      </div>
    </div>
  );
});
