import { describe, expect, it } from 'vitest'
import { formatEpgSyncLabel, formatSyncedAgo } from './label'

describe('formatSyncedAgo', () => {
  const now = Date.parse('2026-09-09T12:00:00.000Z')

  it('formats minutes and hours', () => {
    expect(formatSyncedAgo('2026-09-09T11:48:00.000Z', now)).toBe('Synced 12 min ago')
    expect(formatSyncedAgo('2026-09-09T10:00:00.000Z', now)).toBe('Synced 2h ago')
  })
})

describe('formatEpgSyncLabel', () => {
  it('shows sync progress while syncing', () => {
    expect(
      formatEpgSyncLabel({
        enabled: true,
        syncing: true,
        progress: { current: 2, total: 5, file: 'epg_ripper_PT1.xml.gz' },
        lastSyncAt: null,
      }),
    ).toBe('Syncing file 2 of 5 · epg_ripper_PT1.xml.gz')
  })

  it('shows relative time when idle', () => {
    expect(
      formatEpgSyncLabel({
        enabled: true,
        syncing: false,
        progress: null,
        lastSyncAt: '2026-09-09T11:48:00.000Z',
        now: Date.parse('2026-09-09T12:00:00.000Z'),
      }),
    ).toBe('Synced 12 min ago')
  })

  it('returns null when disabled', () => {
    expect(
      formatEpgSyncLabel({
        enabled: false,
        syncing: false,
        progress: null,
        lastSyncAt: '2026-09-09T11:48:00.000Z',
      }),
    ).toBeNull()
  })
})
