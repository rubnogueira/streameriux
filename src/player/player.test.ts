import { describe, expect, it } from 'vitest'
import { computeSeekable, isMissingSegmentError, LIVE_DVR_MIN_WINDOW } from './index'

describe('isMissingSegmentError', () => {
  it('detects mediabunny segment 404 errors', () => {
    const error = new Error(
      'Error fetching https://str.yodacdn.net/medeniyyettele/tracks-v1a1/2026/09/09/02/11/01-02000.ts: 404 Not Found',
    )
    expect(isMissingSegmentError(error)).toBe(true)
  })

  it('ignores unrelated errors', () => {
    expect(isMissingSegmentError(new Error('Network timeout'))).toBe(false)
  })
})

describe('computeSeekable', () => {
  it('treats VOD as seekable whenever it has a duration', () => {
    expect(computeSeekable(false, 0, 300)).toBe(true)
    expect(computeSeekable(false, 100, 400)).toBe(true)
  })

  it('treats a zero-length VOD window as not seekable', () => {
    expect(computeSeekable(false, 50, 50)).toBe(false)
  })

  it('allows seeking a live stream only once the DVR window is large enough', () => {
    // A plain sliding live window (nothing meaningful to rewind into).
    expect(computeSeekable(true, 1000, 1000 + LIVE_DVR_MIN_WINDOW - 1)).toBe(false)
    // A genuine DVR window.
    expect(computeSeekable(true, 1000, 1000 + LIVE_DVR_MIN_WINDOW)).toBe(true)
    expect(computeSeekable(true, 0, 3600)).toBe(true)
  })
})
