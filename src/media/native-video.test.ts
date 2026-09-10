import { describe, expect, it } from 'vitest'
import { videoFitMode, type VideoFit } from './native-video'

describe('videoFitMode', () => {
  it('maps fit modes to native integers', () => {
    const modes: VideoFit[] = ['contain', 'cover', 'fill']
    expect(modes.map(videoFitMode)).toEqual([0, 1, 2])
  })
})
