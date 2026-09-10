import { useMemo, useState } from "react"
import { APP_VERSION } from "../../version"
import { SETTINGS_TABS, type SettingsTab } from "../../settings/app-settings"
import { NO_GROUP, type CatalogSource, type Channel } from "../../catalog"
import type { UseEpgResult } from "../../epg/use-epg"
import type { SidebarView } from "../../settings/app-settings"
import { playerFocusedRef } from "../focus"
import { AddChip, Overlay } from "../components/primitives"
import { C, FONT } from "../theme"
import { GeneralPanel } from "./general-panel"
import { PlaylistsPanel } from "./playlists-panel"
import { ChannelsPanel } from "./channels-panel"
import { GroupsPanel } from "./groups-panel"
import { EpgPanel } from "./epg-panel"
import { SettingsTabBar } from "./settings-tab-bar"
import type { ChannelDraft } from "./channel-editor"

export function SettingsDialog({
  sources,
  channels,
  groups,
  usePlaylistGroups,
  groupAssignments,
  counts,
  epg,
  defaultSidebarView,
  onDefaultSidebarView,
  nativeVideo,
  nativeVideoSupported,
  onNativeVideo,
  baseFolder,
  resolvedBaseFolder,
  onPickBaseFolder,
  onSetBaseFolder,
  onClose,
  onAddLink,
  onDeleteSource,
  onSaveChannel,
  onDeleteChannel,
  onAssignGroup,
  onTogglePlaylistGroups,
  onAddCustomGroup,
  onRemoveCustomGroup,
  customGroupNames,
  onPickFile,
}: {
  sources: CatalogSource[]
  channels: Channel[]
  groups: string[]
  usePlaylistGroups: boolean
  groupAssignments: Record<string, string>
  counts: Map<string, number>
  epg: UseEpgResult
  defaultSidebarView: SidebarView
  onDefaultSidebarView: (view: SidebarView) => Promise<void>
  nativeVideo: boolean
  nativeVideoSupported: boolean
  onNativeVideo: (enabled: boolean) => Promise<void>
  baseFolder: string | null
  resolvedBaseFolder: string
  onPickBaseFolder: () => Promise<string | null>
  onSetBaseFolder: (dir: string | null) => Promise<void>
  onClose: () => void
  onAddLink: (ref: string) => Promise<void>
  onDeleteSource: (source: CatalogSource) => Promise<void>
  onSaveChannel: (draft: ChannelDraft) => Promise<void>
  onDeleteChannel: (channel: Channel) => Promise<void>
  onAssignGroup: (channel: Channel, group: string | null) => Promise<void>
  onTogglePlaylistGroups: (enabled: boolean) => Promise<void>
  onAddCustomGroup: (name: string) => Promise<void>
  onRemoveCustomGroup: (name: string) => Promise<void>
  customGroupNames: string[]
  onPickFile: () => Promise<string | null>
}) {
  const [tab, setTab] = useState<SettingsTab>('general')
  const availableGroups = useMemo(() => groups.filter((group) => group !== NO_GROUP), [groups])

  return (
    <Overlay
      onMouseEnter={() => {
        playerFocusedRef.current = false
      }}
    >
      <div
        style={{
          width: 720,
          height: 640,
          borderRadius: 16,
          backgroundColor: C.sidebar,
          borderWidth: 1,
          borderColor: C.border,
          display: 'flex',
          flexDirection: 'column',
          padding: 18,
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <text style={{ fontSize: 16, fontFamily: FONT, fontWeight: '600', color: C.text }}>Settings</text>
          <text testId="app-version" style={{ flexGrow: 1, fontSize: 11, fontFamily: FONT, color: C.tertiary }}>
            {`v${APP_VERSION}`}
          </text>
          <AddChip label="Close" testId="settings-close" onClick={onClose} />
        </div>
        <SettingsTabBar tab={tab} onTab={setTab} />

        {tab === 'general' ? (
          <GeneralPanel
            defaultSidebarView={defaultSidebarView}
            onDefaultSidebarView={onDefaultSidebarView}
            nativeVideo={nativeVideo}
            nativeVideoSupported={nativeVideoSupported}
            onNativeVideo={onNativeVideo}
            baseFolder={baseFolder}
            resolvedBaseFolder={resolvedBaseFolder}
            onPickBaseFolder={onPickBaseFolder}
            onSetBaseFolder={onSetBaseFolder}
          />
        ) : tab === 'playlists' ? (
          <PlaylistsPanel
            sources={sources}
            channels={channels}
            counts={counts}
            onAddLink={onAddLink}
            onPickFile={onPickFile}
            onDeleteSource={onDeleteSource}
          />
        ) : tab === 'channels' ? (
          <ChannelsPanel
            channels={channels}
            groups={availableGroups}
            usePlaylistGroups={usePlaylistGroups}
            groupAssignments={groupAssignments}
            onSaveChannel={onSaveChannel}
            onDeleteChannel={onDeleteChannel}
            onAssignGroup={onAssignGroup}
          />
        ) : tab === 'groups' ? (
          <GroupsPanel
            playlistGroups={groups}
            channels={channels}
            usePlaylistGroups={usePlaylistGroups}
            groupAssignments={groupAssignments}
            customGroupNames={customGroupNames}
            onTogglePlaylistGroups={onTogglePlaylistGroups}
            onAddCustomGroup={onAddCustomGroup}
            onRemoveCustomGroup={onRemoveCustomGroup}
          />
        ) : (
          <EpgPanel sources={sources} epg={epg} />
        )}
      </div>
    </Overlay>
  )
}

