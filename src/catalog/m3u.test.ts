import { describe, expect, it } from 'vitest'
import { isM3uPlaylistText, parseM3u, parseM3uHeader } from './m3u'

const SAMPLE = `#EXTM3U x-tvg-url="https://epg.example.com/guide.xml.gz"
#EXTINF:-1 tvg-name="Kanali 7" tvg-logo="https://i.imgur.com/rL2v9pM.png" tvg-id="Kanali7.al" tvg-country="AL" group-title="Albania",Kanali 7
https://example.com/kanali7.m3u8
#EXTGRP:United States
#EXTVLCOPT:http-user-agent=VLC/3.0
#EXTINF:-1 tvg-id="Acme.us" tvg-logo="https://cdn.example/acme.png" group-title="United States",Acme TV
https://example.com/acme-live.m3u8
#EXTINF:-1 tvg-name="Skip me",YouTube
https://www.youtube.com/@x/live
`

describe('parseM3u', () => {
  it('detects an IPTV playlist', () => {
    expect(isM3uPlaylistText(SAMPLE)).toBe(true)
    expect(isM3uPlaylistText('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nchunk.m3u8\n')).toBe(false)
  })

  it('detects a playlist despite a leading comment or BOM before #EXTM3U', () => {
    expect(isM3uPlaylistText('﻿# my list\n#EXTM3U\n#EXTINF:-1,A\nhttps://x/a.m3u8\n')).toBe(true)
  })

  it('does not treat an HLS media playlist as an IPTV list', () => {
    // Has #EXTINF (segment durations) but is a single stream manifest.
    const media = '#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:10.0,\nseg0.ts\n#EXTINF:10.0,\nseg1.ts\n'
    expect(isM3uPlaylistText(media)).toBe(false)
  })

  it('reads EXTINF attributes used by Free-TV playlists', () => {
    const channels = parseM3u(SAMPLE, 'playlist.m3u8')
    expect(channels).toHaveLength(3)
    expect(channels[0]).toMatchObject({
      name: 'Kanali 7',
      group: 'Albania',
      icon: 'https://i.imgur.com/rL2v9pM.png',
      tvgId: 'Kanali7.al',
      tvgName: 'Kanali 7',
      country: 'AL',
      url: 'https://example.com/kanali7.m3u8',
      sourceKind: 'm3u',
    })
    expect(channels[1]).toMatchObject({
      name: 'Acme TV',
      group: 'United States',
      userAgent: 'VLC/3.0',
      url: 'https://example.com/acme-live.m3u8',
    })
  })

  it('reads the #EXTM3U header attributes', () => {
    const header = parseM3uHeader(
      '#EXTM3U url-tvg="https://example.com/epg.xml.gz" tvg-shift="2" catchup="default" catchup-days="7"\n',
    )
    expect(header).toEqual({
      epgUrl: 'https://example.com/epg.xml.gz',
      epgUrls: ['https://example.com/epg.xml.gz'],
      tvgShift: '2',
      catchup: 'default',
      catchupSource: undefined,
      catchupDays: '7',
    })
  })

  it('captures channel numbers, radio, catch-up, and multi-group titles', () => {
    const channels = parseM3u(
      `#EXTM3U url-tvg="https://epg/x.xml"
#EXTINF:-1 tvg-chno="12" tvg-country="UK" tvg-language="English" radio="true" catchup="shift" catchup-source="?utc={utc}" group-title="Music;Rock",Rock FM
https://example.com/rock.m3u8
`,
      'p.m3u8',
    )
    expect(channels[0]).toMatchObject({
      chno: '12',
      country: 'UK',
      language: 'English',
      radio: true,
      catchup: 'shift',
      catchupSource: '?utc={utc}',
      group: 'Music',
      epgUrl: 'https://epg/x.xml',
    })
  })

  it('reads EXTVLCOPT after EXTINF and preserves unsupported options', () => {
    const channels = parseM3u(
      `#EXTM3U
#EXTINF:-1,Acme TV
#EXTVLCOPT:http-user-agent=After/EXTINF
#EXTVLCOPT:program=1025
https://example.com/live.m3u8
`,
      'p.m3u8',
    )
    expect(channels[0]).toMatchObject({
      name: 'Acme TV',
      userAgent: 'After/EXTINF',
      url: 'https://example.com/live.m3u8',
      vlcOptions: { program: '1025' },
    })
  })

  it('lets pipe URL headers override EXTVLCOPT', () => {
    const channels = parseM3u(
      `#EXTINF:-1,News
#EXTVLCOPT:http-user-agent=VLC/3.0
https://example.com/live.m3u8|User-Agent="Override/1.0"
`,
      'p.m3u8',
    )
    expect(channels[0]?.userAgent).toBe('Override/1.0')
  })

  it('reads http basic auth from EXTVLCOPT', () => {
    const channels = parseM3u(
      `#EXTINF:-1,Auth
#EXTVLCOPT:http-user=alice
#EXTVLCOPT:http-pwd=secret
https://example.com/live.m3u8
`,
      'p.m3u8',
    )
    expect(channels[0]?.headers?.Authorization).toBe(`Basic ${Buffer.from('alice:secret').toString('base64')}`)
  })

  it('keeps semicolon-separated tvg-country values', () => {
    const channels = parseM3u(
      `#EXTINF:-1 tvg-country="US;CA;MX" group-title="News",CNN
https://example.com/cnn.m3u8
`,
      'p.m3u8',
    )
    expect(channels[0]?.country).toBe('US;CA;MX')
  })
})
