import { useMemo, useState } from "react"
import { NO_GROUP, resolveGroupKey, type Channel } from "../../catalog"
import { ActionButton, Icon, SectionHeader } from "../components/primitives"
import { ChannelMark } from "../components/channel"
import { WindowedList } from "../components/list"
import { C, FONT } from "../theme"
import { ChannelEditor, type ChannelDraft } from "./channel-editor"

export function ChannelsPanel({
  channels,
  groups,
  usePlaylistGroups,
  groupAssignments,
  onSaveChannel,
  onDeleteChannel,
  onAssignGroup,
}: {
  channels: Channel[]
  groups: string[]
  usePlaylistGroups: boolean
  groupAssignments: Record<string, string>
  onSaveChannel: (draft: ChannelDraft) => Promise<void>
  onDeleteChannel: (channel: Channel) => Promise<void>
  onAssignGroup: (channel: Channel, group: string | null) => Promise<void>
}) {
  const [editing, setEditing] = useState<Channel | 'new' | null>(null)
  const mine = useMemo(() => channels.filter((channel) => channel.editable), [channels])
  const fromPlaylists = useMemo(() => channels.filter((channel) => !channel.editable), [channels])

  type ChannelRowItem =
    | { kind: 'section'; label: string; count: number }
    | { kind: 'channel'; channel: Channel; playlist: boolean }

  const rows = useMemo<ChannelRowItem[]>(() => {
    const list: ChannelRowItem[] = []
    list.push({ kind: 'section', label: 'Your channels', count: mine.length })
    for (const channel of mine) list.push({ kind: 'channel', channel, playlist: false })
    list.push({ kind: 'section', label: 'From playlists', count: fromPlaylists.length })
    for (const channel of fromPlaylists) list.push({ kind: 'channel', channel, playlist: true })
    return list
  }, [mine, fromPlaylists])

  if (editing !== null) {
    const channel = editing === 'new' ? null : editing
    const groupOnly = channel !== null && !channel.editable
    const resolved = channel ? resolveGroupKey(channel, usePlaylistGroups, groupAssignments) : ''
    const initialGroup = resolved === NO_GROUP ? '' : resolved
    return (
      <ChannelEditor
        channel={channel}
        groups={groups}
        groupOnly={groupOnly}
        initialGroup={initialGroup}
        onBack={() => setEditing(null)}
        onSave={onSaveChannel}
        onAssignGroup={
          channel
            ? (draft) => onAssignGroup(channel, draft.group.trim() || null)
            : undefined
        }
        onDelete={channel && channel.editable ? () => onDeleteChannel(channel) : null}
      />
    )
  }

  return (
    <div style={{ flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 2, paddingRight: 2 }}>
        <text style={{ flexGrow: 1, fontSize: 12, fontFamily: FONT, color: C.secondary }}>
          Edit your own streams or assign playlist channels to groups.
        </text>
        <ActionButton icon="plus" label="Add channel" testId="channels-add" primary onClick={() => setEditing('new')} />
      </div>
      {rows.length <= 2 ? (
        <div style={{ flexGrow: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <text style={{ fontSize: 13, fontFamily: FONT, color: C.tertiary }}>No channels yet</text>
        </div>
      ) : (
        <WindowedList
          listKey={`settings-channels-${mine.length}-${fromPlaylists.length}`}
          count={rows.length}
          estimatedItemHeight={56}
          renderRow={(index) => {
            const row = rows[index]!
            if (row.kind === 'section') {
              return <SectionHeader label={row.label} count={row.count} />
            }
            const channel = row.channel
            const group = resolveGroupKey(channel, usePlaylistGroups, groupAssignments)
            return (
              <div
                testId={`settings-channel-${channel.id}`}
                onClick={() => setEditing(channel)}
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  minHeight: 56,
                  paddingLeft: 8,
                  paddingRight: 6,
                  borderRadius: 12,
                  cursor: 'pointer',
                  hover: { backgroundColor: C.overlay },
                }}
              >
                <ChannelMark channel={channel} size={32} />
                <div style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <text style={{ fontSize: 13, fontFamily: FONT, fontWeight: '500', color: C.text, whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    {channel.name}
                  </text>
                  <text style={{ fontSize: 11, fontFamily: FONT, color: C.ghost, whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    {group !== NO_GROUP ? `${group} · ` : ''}{row.playlist ? 'Playlist' : channel.url}
                  </text>
                </div>
                <Icon name="chevronRight" size={16} color={C.ghost} />
              </div>
            )
          }}
        />
      )}
    </div>
  )
}

