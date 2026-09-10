import { describe, expect, it } from 'vitest'
import type { Channel } from '../catalog/channel'
import { EpgStore, findProgrammeAt } from './store'
import type { EpgProgramme } from './xmltv'

const PROGRAMMES: EpgProgramme[] = [
  { start: 1000, stop: 2000, title: 'First' },
  { start: 2000, stop: 3000, title: 'Second' },
  { start: 3000, stop: 4000, title: 'Third' },
]

const channel: Channel = {
  id: 'one',
  name: 'One',
  url: 'https://example.com/one.m3u8',
  tvgId: 'ONE.us',
  sourceFile: 'p.m3u8',
  sourceKind: 'm3u',
  editable: false,
}

describe('findProgrammeAt', () => {
  it('finds the programme covering a timestamp', () => {
    expect(findProgrammeAt(PROGRAMMES, 2500)?.title).toBe('Second')
    expect(findProgrammeAt(PROGRAMMES, 3999)?.title).toBe('Third')
    expect(findProgrammeAt(PROGRAMMES, 5000)).toBeNull()
  })
})

describe('EpgStore', () => {
  it('resolves now and schedule for a channel', () => {
    const store = new EpgStore()
    store.load([
      {
        url: 'https://example.com/epg.xml.gz',
        fetchedAt: '2026-09-08T00:00:00.000Z',
        channels: [{ id: 'ONE.us', displayNames: ['One'] }],
        programmes: { 'ONE.us': PROGRAMMES },
      },
    ])
    expect(store.getNow(channel, 2500)?.title).toBe('Second')
    expect(store.getSchedule(channel, 1500, 3500).map((p) => p.title)).toEqual(['First', 'Second', 'Third'])
    expect(store.status([channel]).matchedChannelCount).toBe(1)
  })
})
