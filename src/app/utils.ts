import type { Channel } from '../catalog'
import { countryLabel, expandTvgCountry } from '../geo/countries'
import type { EpgProgramme } from '../epg/xmltv'
import { formatClock, formatTime24 } from '../lib/time'
import { LIVE_EDGE_SNAP } from './theme'

const SEEK_PLACEHOLDER = '--:--:--'

export type SeekBarModel = {
  /** Display timeline the bar renders in (media seconds, or wall-clock seconds). */
  start: number
  end: number
  time: number
  startLabel: string
  endLabel: string
  timeLabel: string
  /** Show the draggable rewind circle and allow scrubbing. */
  seekable: boolean
  /** Pin the thumb (and full red fill) to the live edge when the playhead is near it. */
  pinLive: boolean
  /** Map a display-timeline value back to a media timestamp for `player.seek`. */
  toMedia: (displayTime: number) => number
}

/**
 * The single source of truth for what the seek bar shows, given the player state
 * and the current EPG programme. Pure, so the (fiddly) live/DVR/EPG rules are
 * unit-tested rather than tangled into the component:
 *
 * - **EPG programme (live):** the bar spans the programme's wall-clock window and
 *   the cursor tracks the playhead's real-time position inside it. The rewind
 *   circle appears only when the stream is seekable.
 * - **Live, no EPG:** the bar reads oldest-available → `LIVE`. Seekable streams
 *   show the oldest timestamp on the left and a draggable circle; non-seekable
 *   streams show a full bar with `LIVE` on the right and a blank left (no rewind).
 * - **VOD:** an ordinary `0:00 → duration` progress bar.
 *
 * `unixOffset` (`wallClock = mediaTime + unixOffset`) turns media timestamps into
 * real times; it is always present for live streams (0 for Unix streams, derived
 * otherwise), so both the EPG cursor and the oldest-available label are real times.
 */
export function seekBarModel(opts: {
  ready: boolean
  live: boolean
  seekable: boolean
  start: number
  end: number
  time: number
  unixOffset: number | null
  programme: EpgProgramme | null
  nowMs?: number
}): SeekBarModel {
  const { ready, live, seekable, start, end, time, unixOffset, programme, nowMs = Date.now() } = opts
  const hasWall = unixOffset != null
  const identity = (displayTime: number) => displayTime

  if (programme && live) {
    const pStart = programme.start / 1000
    const pEnd = programme.stop / 1000
    const wallPlayhead = hasWall ? time + unixOffset : nowMs / 1000
    const cursor = Math.min(pEnd, Math.max(pStart, wallPlayhead))
    return {
      start: pStart,
      end: pEnd,
      time: cursor,
      startLabel: formatTime24(pStart),
      endLabel: formatTime24(pEnd),
      timeLabel: formatTime24(cursor),
      seekable: seekable && hasWall,
      pinLive: false,
      toMedia: hasWall ? (displayTime) => displayTime - unixOffset : () => time,
    }
  }

  if (live) {
    const behind = Math.max(0, end - time)
    const atEdge = behind <= LIVE_EDGE_SNAP
    if (!seekable) {
      return {
        start,
        end,
        time: end,
        startLabel: '',
        endLabel: ready ? 'LIVE' : SEEK_PLACEHOLDER,
        timeLabel: ready ? 'LIVE' : SEEK_PLACEHOLDER,
        seekable: false,
        pinLive: true,
        toMedia: identity,
      }
    }
    if (hasWall) {
      return {
        start: start + unixOffset,
        end: end + unixOffset,
        time: time + unixOffset,
        startLabel: ready ? formatTime24(start + unixOffset) : SEEK_PLACEHOLDER,
        endLabel: ready ? 'LIVE' : SEEK_PLACEHOLDER,
        timeLabel: ready ? (atEdge ? 'LIVE' : formatTime24(time + unixOffset)) : SEEK_PLACEHOLDER,
        seekable: true,
        pinLive: true,
        toMedia: (displayTime) => displayTime - unixOffset,
      }
    }
    return {
      start,
      end,
      time,
      startLabel: ready ? `-${formatClock(Math.max(0, end - start))}` : SEEK_PLACEHOLDER,
      endLabel: ready ? 'LIVE' : SEEK_PLACEHOLDER,
      timeLabel: ready ? (atEdge ? 'LIVE' : `-${formatClock(behind)}`) : SEEK_PLACEHOLDER,
      seekable: true,
      pinLive: true,
      toMedia: identity,
    }
  }

  return {
    start,
    end,
    time,
    startLabel: ready ? formatClock(start) : SEEK_PLACEHOLDER,
    endLabel: ready ? formatClock(end) : SEEK_PLACEHOLDER,
    timeLabel: ready ? formatClock(time) : SEEK_PLACEHOLDER,
    seekable,
    pinLive: false,
    toMedia: identity,
  }
}

export function dedupeProgrammes(programmes: EpgProgramme[]): EpgProgramme[] {
  const seen = new Set<string>()
  const unique: EpgProgramme[] = []
  for (const programme of programmes) {
    const key = `${programme.start}-${programme.stop}-${programme.title}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(programme)
  }
  return unique
}

export function programmeSubtitle(
  channel: Channel,
  getNow: (channel: Channel) => EpgProgramme | null,
): string | undefined {
  const programme = getNow(channel)
  return programme?.title
}

export function channelSearchHaystack(channel: Channel): string {
  const countries = expandTvgCountry(channel.country).map((code) => countryLabel(code)).join(' ')
  return `${channel.name} ${channel.group ?? ''} ${channel.country ?? ''} ${countries} ${channel.chno ?? ''}`.toLowerCase()
}

export function channelMatchesSearch(channel: Channel, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return false
  return channelSearchHaystack(channel).includes(needle)
}

export function orderedKeys(map: Map<string, Channel[]>, tail: string): string[] {
  const named = [...map.keys()].filter((name) => name !== tail).sort((a, b) => a.localeCompare(b))
  if (map.has(tail)) named.push(tail)
  return named
}
