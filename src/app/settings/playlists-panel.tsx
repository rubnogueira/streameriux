import { useMemo, useState } from "react"
import type { CatalogSource, Channel } from "../../catalog"
import { ActionButton, Icon, IconButton, TextField, useAsyncAction } from "../components/primitives"
import { ChannelNumber } from "../components/channel"
import { WindowedList } from "../components/list"
import { C, FONT } from "../theme"

export const HIDDEN_SOURCE_LABELS = new Set(['user.toml'])

type PlaylistRow =
  | { kind: 'playlist'; source: CatalogSource; count: number; open: boolean }
  | { kind: 'channel'; channel: Channel }
  | { kind: 'note'; label: string }

export function PlaylistsPanel({
  sources,
  channels,
  counts,
  onAddLink,
  onPickFile,
  onDeleteSource,
}: {
  sources: CatalogSource[]
  channels: Channel[]
  counts: Map<string, number>
  onAddLink: (ref: string) => Promise<void>
  onPickFile: () => Promise<string | null>
  onDeleteSource: (source: CatalogSource) => Promise<void>
}) {
  const [ref, setRef] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const { busy, error, run } = useAsyncAction()

  const playlists = useMemo(
    () => sources.filter((source) => !(source.kind === 'file' && HIDDEN_SOURCE_LABELS.has(source.label))),
    [sources],
  )
  const channelsBySource = useMemo(() => {
    const map = new Map<string, Channel[]>()
    for (const channel of channels) {
      const list = map.get(channel.sourceFile)
      if (list) list.push(channel)
      else map.set(channel.sourceFile, [channel])
    }
    return map
  }, [channels])

  const rows = useMemo<PlaylistRow[]>(() => {
    const list: PlaylistRow[] = []
    for (const source of playlists) {
      const isOpen = open.has(source.id)
      list.push({ kind: 'playlist', source, count: counts.get(source.path) ?? 0, open: isOpen })
      if (isOpen) {
        const items = channelsBySource.get(source.path) ?? []
        if (items.length === 0) list.push({ kind: 'note', label: 'No channels loaded from this source yet' })
        for (const channel of items) list.push({ kind: 'channel', channel })
      }
    }
    return list
  }, [playlists, open, counts, channelsBySource])

  const add = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed || busy) return
    run(onAddLink(trimmed), () => setRef(''))
  }
  const browse = () => {
    void onPickFile().then((path) => {
      if (path) add(path)
    })
  }
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div style={{ flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 2, paddingRight: 2 }}>
        <TextField
          value={ref}
          testId="settings-add-url"
          placeholder="Playlist link (.m3u8 / .m3u / .toml or panel URL)"
          onChange={setRef}
          onSubmit={() => add(ref)}
        />
        <ActionButton icon="plus" label="Add" testId="settings-add-url-btn" onClick={() => add(ref)} />
        <ActionButton icon="folderPlus" label="Add file" testId="settings-add-file" onClick={browse} />
      </div>
      {error ? <text style={{ fontSize: 12, fontFamily: FONT, color: C.accent }}>{error}</text> : null}

      {playlists.length === 0 ? (
        <div style={{ flexGrow: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <text style={{ fontSize: 13, fontFamily: FONT, color: C.tertiary }}>No playlists yet</text>
        </div>
      ) : (
        <WindowedList
          listKey="settings-playlists"
          count={rows.length}
          estimatedItemHeight={56}
          renderRow={(index) => {
            const row = rows[index]!
            if (row.kind === 'note') {
              return (
                <div style={{ paddingLeft: 44, paddingRight: 10, minHeight: 36, display: 'flex', alignItems: 'center' }}>
                  <text style={{ fontSize: 11, fontFamily: FONT, color: C.ghost }}>{row.label}</text>
                </div>
              )
            }
            if (row.kind === 'channel') {
              return (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    minHeight: 44,
                    paddingLeft: 44,
                    paddingRight: 10,
                  }}
                >
                  {row.channel.chno ? <ChannelNumber chno={row.channel.chno} /> : null}
                  <text style={{ flexGrow: 1, minWidth: 0, fontSize: 12, fontFamily: FONT, color: C.secondary, whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    {row.channel.name}
                  </text>
                  <text style={{ fontSize: 11, fontFamily: FONT, color: C.ghost }}>{row.channel.group ?? ''}</text>
                </div>
              )
            }
            const source = row.source
            return (
              <div
                testId={`source-${source.id}`}
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
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
                  onClick={() => toggle(source.id)}
                  style={{ width: 22, height: 22, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                >
                  <text style={{ fontSize: 12, fontFamily: FONT, color: C.tertiary }}>{row.open ? '▾' : '▸'}</text>
                </div>
                <Icon name={source.kind === 'playlist' ? 'radio' : 'inbox'} size={16} color={C.secondary} />
                <div
                  onClick={() => toggle(source.id)}
                  style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, cursor: 'pointer' }}
                >
                  <text style={{ fontSize: 13, fontFamily: FONT, fontWeight: '500', color: C.text, whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    {source.label}
                  </text>
                  <text style={{ fontSize: 11, fontFamily: FONT, color: C.ghost, whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    {source.path}
                  </text>
                </div>
                <text style={{ fontSize: 11, fontFamily: FONT, color: C.tertiary }}>{`${row.count} ch`}</text>
                <IconButton icon="trash" size={30} color={C.ghost} onClick={() => void onDeleteSource(source)} />
              </div>
            )
          }}
        />
      )}
    </div>
  )
}

