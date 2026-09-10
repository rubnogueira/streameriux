import { describe, expect, it } from 'vitest'
import { seekBarModel } from './utils'
import type { EpgProgramme } from '../epg/xmltv'

const programme: EpgProgramme = {
  // 2026-09-09 20:00:00 – 21:30:00 local, in milliseconds.
  start: new Date(2026, 8, 9, 20, 0, 0).getTime(),
  stop: new Date(2026, 8, 9, 21, 30, 0).getTime(),
  title: 'News at Eight',
}

const base = {
  ready: true,
  live: false,
  seekable: true,
  start: 0,
  end: 300,
  time: 120,
  unixOffset: null as number | null,
  programme: null as EpgProgramme | null,
  nowMs: Date.now(),
}

describe('seekBarModel — VOD', () => {
  it('is an ordinary 0:00 → duration progress bar', () => {
    const m = seekBarModel({ ...base, start: 30, end: 300, time: 90 })
    expect(m.startLabel).toBe('0:30')
    expect(m.endLabel).toBe('5:00')
    expect(m.timeLabel).toBe('1:30')
    expect(m.seekable).toBe(true)
    expect(m.pinLive).toBe(false)
    expect(m.toMedia(75)).toBe(75) // identity mapping
  })

  it('shows placeholders before ready', () => {
    const m = seekBarModel({ ...base, ready: false })
    expect(m.startLabel).toBe('--:--:--')
    expect(m.endLabel).toBe('--:--:--')
  })
})

describe('seekBarModel — live without EPG', () => {
  it('non-seekable live: full bar, LIVE on the end, blank start, no circle', () => {
    const m = seekBarModel({ ...base, live: true, seekable: false, unixOffset: 0 })
    expect(m.startLabel).toBe('')
    expect(m.endLabel).toBe('LIVE')
    expect(m.seekable).toBe(false)
    expect(m.pinLive).toBe(true)
  })

  it('seekable DVR with a wall clock: oldest timestamp on the left, LIVE on the right', () => {
    // Unix stream: media time IS wall clock, offset 0. Window 20:00:00–20:40:00.
    const at = (h: number, mi: number) => new Date(2026, 8, 9, h, mi, 0).getTime() / 1000
    const m = seekBarModel({
      ...base,
      live: true,
      seekable: true,
      unixOffset: 0,
      start: at(20, 0),
      end: at(20, 40),
      time: at(20, 40), // at the live edge
    })
    expect(m.startLabel).toBe('20:00:00')
    expect(m.endLabel).toBe('LIVE')
    expect(m.timeLabel).toBe('LIVE') // pinned at the edge
    expect(m.seekable).toBe(true)
    expect(m.pinLive).toBe(true)
  })

  it('derives a wall clock for non-Unix DVR so the oldest time is a real timestamp', () => {
    // Non-unix media time; offset maps the live edge to "now".
    const now = new Date(2026, 8, 9, 21, 0, 0).getTime() / 1000
    const end = 5400 // media seconds at the live edge
    const offset = now - end // wall = media + offset
    const m = seekBarModel({
      ...base,
      live: true,
      seekable: true,
      unixOffset: offset,
      start: end - 1800, // 30-min window
      end,
      time: end - 600, // rewound 10 min
    })
    expect(m.startLabel).toBe('20:30:00') // 30 min before 21:00
    expect(m.timeLabel).toBe('20:50:00') // 10 min behind live
    // Dragging to 20:40 wall-clock maps back to the right media time.
    const wall2040 = new Date(2026, 8, 9, 20, 40, 0).getTime() / 1000
    expect(m.toMedia(wall2040)).toBeCloseTo(wall2040 - offset, 3)
  })
})

describe('seekBarModel — live with EPG programme', () => {
  const pStart = programme.start / 1000
  const pEnd = programme.stop / 1000

  it('spans the programme window and places the cursor at the playhead time', () => {
    // Unix stream, playhead at 20:45 wall-clock (offset 0 → media == wall).
    const playheadWall = new Date(2026, 8, 9, 20, 45, 0).getTime() / 1000
    const m = seekBarModel({
      ...base,
      live: true,
      seekable: true,
      unixOffset: 0,
      time: playheadWall,
      programme,
    })
    expect(m.start).toBe(pStart)
    expect(m.end).toBe(pEnd)
    expect(m.startLabel).toBe('20:00:00')
    expect(m.endLabel).toBe('21:30:00')
    expect(m.timeLabel).toBe('20:45:00')
    expect(m.seekable).toBe(true) // circle shown — can rewind
  })

  it('clamps the cursor into the programme window', () => {
    const beforeStart = programme.start / 1000 - 600 // 10 min before the programme
    const m = seekBarModel({ ...base, live: true, seekable: true, unixOffset: 0, time: beforeStart, programme })
    expect(m.time).toBe(pStart)
  })

  it('shows the programme times but no circle when the stream is not seekable', () => {
    const m = seekBarModel({ ...base, live: true, seekable: false, unixOffset: 0, time: pStart + 100, programme })
    expect(m.startLabel).toBe('20:00:00')
    expect(m.endLabel).toBe('21:30:00')
    expect(m.seekable).toBe(false) // no rewind circle
  })

  it('maps a dragged wall-clock position back to a media timestamp', () => {
    const offset = 1_000_000 // arbitrary non-unix offset
    const m = seekBarModel({ ...base, live: true, seekable: true, unixOffset: offset, time: 0, programme })
    const target = pStart + 1200 // 20 min into the programme (wall-clock seconds)
    expect(m.toMedia(target)).toBeCloseTo(target - offset, 3)
  })
})
