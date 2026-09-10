import { describe, expect, it } from 'vitest'
import { cycleVideoFit, videoFitIcon, videoFitLabel, videoFitTestId } from './video-fit'

describe('cycleVideoFit', () => {
  it('rotates through normal, zoomed, and vertical fit', () => {
    expect(cycleVideoFit('contain')).toBe('cover')
    expect(cycleVideoFit('cover')).toBe('fill')
    expect(cycleVideoFit('fill')).toBe('contain')
  })
})

describe('videoFitLabel', () => {
  it('labels each mode for the UI', () => {
    expect(videoFitLabel('contain')).toBe('Normal')
    expect(videoFitLabel('cover')).toBe('Zoomed')
    expect(videoFitLabel('fill')).toBe('Vertical fit')
  })
})

describe('videoFitIcon', () => {
  it('picks a distinct icon per mode', () => {
    expect(videoFitIcon('contain')).toBe('shrinkVertical')
    expect(videoFitIcon('cover')).toBe('sparkle')
    expect(videoFitIcon('fill')).toBe('expandVertical')
  })
})

describe('videoFitTestId', () => {
  it('uses stable test ids per mode', () => {
    expect(videoFitTestId('cover')).toBe('video-fit-cover')
  })
})
