import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isSyncDue, readEpgConfig, type EpgConfig } from './config'

const base: EpgConfig = {
  enabled: true,
  syncIntervalHours: 12,
  guideHoursBefore: 6,
  guideHoursAfter: 24,
  customUrls: [],
  lastSyncAt: '',
}

describe('readEpgConfig', () => {
  const dir = join(tmpdir(), `epg-config-${Date.now()}`)
  const previous = process.env.STREAMER_CHANNELS_DIR

  beforeAll(() => {
    mkdirSync(dir, { recursive: true })
    process.env.STREAMER_CHANNELS_DIR = dir
  })

  afterAll(() => {
    process.env.STREAMER_CHANNELS_DIR = previous
  })

  it('reads custom guide hours and sync interval', async () => {
    writeFileSync(
      join(dir, 'epg.toml'),
      'enabled = true\nsync_interval_hours = 48\nguide_hours_before = 12\nguide_hours_after = 36\n',
    )
    const config = await readEpgConfig()
    expect(config.syncIntervalHours).toBe(48)
    expect(config.guideHoursBefore).toBe(12)
    expect(config.guideHoursAfter).toBe(36)
  })
})

describe('isSyncDue', () => {
  it('is due when never synced', () => {
    expect(isSyncDue(base)).toBe(true)
  })

  it('is not due within the interval', () => {
    const now = Date.parse('2026-09-09T12:00:00.000Z')
    expect(
      isSyncDue(
        { ...base, lastSyncAt: '2026-09-09T06:00:00.000Z' },
        now,
      ),
    ).toBe(false)
  })

  it('is due after the interval', () => {
    const now = Date.parse('2026-09-09T19:00:00.000Z')
    expect(
      isSyncDue(
        { ...base, lastSyncAt: '2026-09-09T06:00:00.000Z' },
        now,
      ),
    ).toBe(true)
  })
})
