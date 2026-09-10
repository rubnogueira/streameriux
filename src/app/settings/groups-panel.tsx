import { useMemo, useState } from 'react'
import { NO_GROUP, resolveGroupKey, type Channel } from '../../catalog'
import { IconButton, SettingToggle, TextField, useAsyncAction } from '../components/primitives'
import { WindowedList } from '../components/list'
import { C, FONT } from '../theme'

type GroupRowItem = { kind: 'group'; name: string; count: number; custom: boolean }

export function GroupsPanel({
  playlistGroups,
  channels,
  usePlaylistGroups,
  groupAssignments,
  customGroupNames,
  onTogglePlaylistGroups,
  onAddCustomGroup,
  onRemoveCustomGroup,
}: {
  playlistGroups: string[]
  channels: Channel[]
  usePlaylistGroups: boolean
  groupAssignments: Record<string, string>
  customGroupNames: string[]
  onTogglePlaylistGroups: (enabled: boolean) => Promise<void>
  onAddCustomGroup: (name: string) => Promise<void>
  onRemoveCustomGroup: (name: string) => Promise<void>
}) {
  const [newGroup, setNewGroup] = useState('')
  const { busy, error, run } = useAsyncAction()

  const countByGroup = useMemo(() => {
    const map = new Map<string, number>()
    for (const channel of channels) {
      const key = resolveGroupKey(channel, usePlaylistGroups, groupAssignments)
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return map
  }, [channels, usePlaylistGroups, groupAssignments])

  const customSet = useMemo(() => new Set(customGroupNames), [customGroupNames])

  const rows = useMemo<GroupRowItem[]>(() => {
    const names = new Set(playlistGroups.filter((group) => group !== NO_GROUP))
    return [...names]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({
        kind: 'group' as const,
        name,
        count: countByGroup.get(name) ?? 0,
        custom: customSet.has(name),
      }))
  }, [playlistGroups, countByGroup, customSet])

  const addGroup = () => {
    const trimmed = newGroup.trim()
    if (!trimmed || busy) return
    run(onAddCustomGroup(trimmed), () => setNewGroup(''))
  }

  return (
    <div style={{ flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <SettingToggle
        label="Use groups from playlists"
        hint="When off, only manual group assignments from the Channels tab are shown."
        checked={usePlaylistGroups}
        testId="toggle-playlist-groups"
        onChange={(checked) => void onTogglePlaylistGroups(checked)}
      />
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 2, paddingRight: 2 }}>
        <TextField
          value={newGroup}
          testId="settings-add-group"
          placeholder="New custom group name"
          onChange={setNewGroup}
          onSubmit={addGroup}
        />
        <div
          testId="settings-add-group-btn"
          onClick={addGroup}
          style={{
            height: 36,
            paddingLeft: 14,
            paddingRight: 14,
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: C.accent,
            cursor: 'pointer',
            hover: { backgroundColor: '#FF6E64' },
          }}
        >
          <text style={{ fontSize: 12, fontFamily: FONT, fontWeight: '600', color: C.onAccent }}>Add</text>
        </div>
      </div>
      {error ? <text style={{ fontSize: 12, fontFamily: FONT, color: C.accent }}>{error}</text> : null}
      {rows.length === 0 ? (
        <div style={{ flexGrow: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <text style={{ fontSize: 13, fontFamily: FONT, color: C.tertiary }}>No groups yet — add a custom group above</text>
        </div>
      ) : (
        <WindowedList
          listKey={`groups-${rows.length}`}
          count={rows.length}
          estimatedItemHeight={48}
          renderRow={(index) => {
            const row = rows[index]!
            return (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  minHeight: 48,
                  paddingLeft: 10,
                  paddingRight: 6,
                  borderRadius: 10,
                  hover: { backgroundColor: C.overlay },
                }}
              >
                <text style={{ flexGrow: 1, minWidth: 0, fontSize: 13, fontFamily: FONT, color: C.text, whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  {row.name}
                </text>
                <text style={{ fontSize: 11, fontFamily: FONT, color: C.ghost }}>{`${row.count} ch`}</text>
                {row.custom ? (
                  <IconButton
                    icon="trash"
                    size={28}
                    color={C.ghost}
                    onClick={() => void onRemoveCustomGroup(row.name)}
                  />
                ) : null}
              </div>
            )
          }}
        />
      )}
    </div>
  )
}
