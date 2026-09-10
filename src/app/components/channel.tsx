import { memo } from 'react'
import { countryLabel } from '../../geo/countries'
import { NO_GROUP } from '../../catalog'
import type { Channel } from '../../catalog'
import { useResolvedIcon } from '../../lib/icon'
import { Icon, IconButton } from './primitives'
import { ICONS } from '../icons'
import { C, CHANNEL_MARK_ASPECT, FONT } from '../theme'

export function ChannelMark({ channel, active, size = 36 }: { channel: Channel; active?: boolean; size?: number }) {
  const icon = useResolvedIcon(channel.icon)
  const height = size
  const width = Math.round(size * CHANNEL_MARK_ASPECT)
  if (icon) {
    return (
      <img
        src={icon}
        objectFit="contain"
        style={{
          width,
          height,
          flexShrink: 0,
        }}
      />
    )
  }
  return (
    <div
      style={{
        width,
        height,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: active ? C.accent : C.raised,
      }}
    >
      <Icon name="radio" size={Math.round(size * 0.42)} color={active ? C.onAccent : C.secondary} />
    </div>
  )
}

export function ChannelNumber({ chno }: { chno: string }) {
  return (
    <div
      style={{
        minWidth: 34,
        height: 20,
        paddingLeft: 6,
        paddingRight: 6,
        borderRadius: 6,
        backgroundColor: C.raised,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <text style={{ fontSize: 11, fontFamily: FONT, fontWeight: '600', color: C.secondary }}>{chno}</text>
    </div>
  )
}

export const ChannelRow = memo(function ChannelRow({
  channel,
  active,
  subtitle,
  onClick,
  onToggleFavorite,
}: {
  channel: Channel
  active: boolean
  subtitle?: string
  onClick: () => void
  onToggleFavorite: () => void
}) {
  return (
    <div
      testId={`channel-${channel.id}`}
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        minHeight: 56,
        paddingLeft: 8,
        paddingRight: 6,
        borderRadius: 12,
        cursor: 'pointer',
        backgroundColor: active ? C.overlayStrong : undefined,
        hover: active ? undefined : { backgroundColor: C.overlay },
      }}
    >
      {channel.chno ? <ChannelNumber chno={channel.chno} /> : null}
      <ChannelMark channel={channel} active={active} />
      <div style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <text
          style={{
            fontSize: 14,
            fontFamily: FONT,
            fontWeight: active ? '600' : '500',
            color: C.text,
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
          }}
        >
          {channel.name}
        </text>
        <text
          style={{ fontSize: 11, fontFamily: FONT, color: C.ghost, whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}
        >
          {subtitle ??
            channel.group ??
            (channel.country ? countryLabel(channel.country.split(';')[0] ?? '') : NO_GROUP)}
        </text>
      </div>
      <IconButton
        icon="star"
        testId={`favorite-${channel.id}`}
        size={30}
        color={channel.favorite ? C.star : C.ghost}
        onClick={onToggleFavorite}
      />
    </div>
  )
})

export function GroupRow({
  name,
  count,
  testId,
  onClick,
}: {
  name: string
  count: number
  testId: string
  onClick: () => void
}) {
  return (
    <div
      testId={testId}
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        minHeight: 44,
        paddingLeft: 10,
        paddingRight: 10,
        borderRadius: 10,
        cursor: 'pointer',
        hover: { backgroundColor: C.overlay },
      }}
    >
      <text style={{ flexGrow: 1, fontSize: 13, fontFamily: FONT, color: C.text }}>{name}</text>
      <text style={{ fontSize: 11, fontFamily: FONT, color: C.ghost }}>{String(count)}</text>
      <Icon name="chevronRight" size={14} color={C.ghost} />
    </div>
  )
}
