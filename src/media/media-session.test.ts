import { describe, expect, it } from 'vitest'
import { artworkUrlForSession, mediaSessionUpdate } from './media-session'
import type { PlayerState } from '../player'

const ready: PlayerState = {
  status: 'ready',
  playing: true,
  live: false,
  seekable: true,
  muted: false,
  volume: 1,
  time: 125,
  start: 100,
  end: 400,
  unix: false,
  unixOffset: null,
  width: 1280,
  height: 720,
  framePath: null,
  warning: null,
  error: null,
  channelId: 'acme',
}

describe('mediaSessionUpdate', () => {
  it('maps channel and playback to Now Playing fields', () => {
    const info = mediaSessionUpdate(
      {
        id: 'acme',
        name: 'Acme TV',
        url: 'https://example.com/acme.m3u8',
        group: 'United States',
        icon: 'https://cdn.example/logo.png',
        sourceFile: 'playlist.m3u8',
        sourceKind: 'm3u',
        editable: false,
      },
      ready,
    )
    expect(info).toMatchObject({
      title: 'Acme TV',
      artist: 'United States',
      album: 'Streamer',
      artworkUrl: 'https://cdn.example/logo.png',
      duration: 300,
      elapsed: 25,
      state: 'playing',
    })
  })

  it('uses programme title when EPG data is available', () => {
    const info = mediaSessionUpdate(
      {
        id: 'acme',
        name: 'Acme TV',
        url: 'https://example.com/acme.m3u8',
        group: 'United States',
        sourceFile: 'playlist.m3u8',
        sourceKind: 'm3u',
        editable: false,
      },
      ready,
      { start: 0, stop: 1000, title: 'Evening News' },
    )
    expect(info).toMatchObject({
      title: 'Evening News',
      artist: 'Acme TV',
      album: 'United States',
    })
  })
  it('returns null when nothing is playing', () => {
    expect(mediaSessionUpdate(null, ready)).toBeNull()
    expect(
      mediaSessionUpdate(
        {
          id: 'x',
          name: 'X',
          url: 'https://x',
          sourceFile: 'x',
          sourceKind: 'm3u',
          editable: false,
        },
        { ...ready, status: 'idle' },
      ),
    ).toBeNull()
  })

  it('passes through remote artwork URLs', () => {
    expect(artworkUrlForSession('https://cdn.example/logo.png')).toBe('https://cdn.example/logo.png')
  })
})
