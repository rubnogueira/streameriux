/**
 * Paints the streamer shell through the GPU test renderer.
 * Playback is not exercised here; that needs a live playlist.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import React from 'react'
import { beforeAll, describe, expect, it } from 'vitest'
import { connectTest } from '@gpuix/react/automation'
import { createTestRoot, hasNativeTestRenderer } from '@gpuix/react/testing'

import { formatClock } from './app'
import { StreamerApp } from './src/app/streamer-app'

const describeNative = hasNativeTestRenderer ? describe : describe.skip

describe('formatClock', () => {
  it('formats media timestamps', () => {
    expect(formatClock(75)).toBe('1:15')
    expect(formatClock(3723)).toBe('1:02:03')
  })
})

describeNative('streamer app', () => {
  // The app ships with no channels, so the test seeds its own catalog dir.
  beforeAll(() => {
    const dir = join(tmpdir(), `gpiux-catalog-${Date.now()}`)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'sources.toml'), 'files = ["default.toml"]\nplaylists = []\n')
    writeFileSync(join(dir, 'settings.toml'), 'default_sidebar_view = "all"\n')
    writeFileSync(
      join(dir, 'default.toml'),
      `
[[channel]]
id = "castr"
name = "Castr"
group = "Live"
url = "https://example.com/castr.m3u8"

[[channel]]
id = "acme"
name = "Acme TV"
group = "United States"
url = "https://example.com/acme.m3u8"
`,
    )
    process.env.STREAMER_CHANNELS_DIR = dir
  })

  it('lists catalog channels and the empty player', async () => {
    const { render, renderer } = createTestRoot({ width: 1280, height: 800 })
    render(<StreamerApp />)
    const app = await connectTest(renderer)

    await app.getByTestId('channel-acme').waitFor({ timeoutMs: 10_000 })
    await app.getByTestId('channel-castr').waitFor()
    await app.getByTestId('player-empty').waitFor()

    const painted = renderer.getPaintedText()
    expect(painted).toContain('streameriux')
    expect(painted).toContain('United States')
    expect(painted).toContain('Acme TV')
    expect(painted).toContain('Select a channel to play')

    await app.close()
  })
})
