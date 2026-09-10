import { describe, expect, it } from 'vitest'
import {
  EXTVLCOPT_CATALOG,
  applyExtVlcOpts,
  isExtVlcOptLine,
  parseExtVlcOptLine,
  parseExtVlcOptList,
  parseExtVlcOptRaw,
  parseExtVlcOptTable,
  SUPPORTED_EXTVLCOPT_NAMES,
} from './extvlcopt'
import type { Channel } from './channel'

describe('parseExtVlcOptRaw', () => {
  it('parses assignments, flags, and no- flags', () => {
    expect(parseExtVlcOptRaw('http-user-agent=Mozilla/5.0')).toEqual({
      raw: 'http-user-agent=Mozilla/5.0',
      name: 'http-user-agent',
      value: 'Mozilla/5.0',
    })
    expect(parseExtVlcOptRaw('rtsp-tcp')).toEqual({
      raw: 'rtsp-tcp',
      name: 'rtsp-tcp',
      value: true,
    })
    expect(parseExtVlcOptRaw('no-video')).toEqual({
      raw: 'no-video',
      name: 'video',
      value: false,
    })
  })

  it('rejects empty and malformed names', () => {
    expect(parseExtVlcOptRaw('')).toBeNull()
    expect(parseExtVlcOptRaw('=value')).toBeNull()
    expect(parseExtVlcOptRaw('bad name')).toBeNull()
  })

  it('keeps values with spaces and extra equals signs', () => {
    expect(parseExtVlcOptRaw('http-user-agent=Mozilla/5.0 (X11; Linux)')).toMatchObject({
      value: 'Mozilla/5.0 (X11; Linux)',
    })
    expect(parseExtVlcOptRaw('sout=#transcode{vcodec=h264}:std{access=http,mux=ts,dst=:8080}')).toMatchObject({
      name: 'sout',
      value: '#transcode{vcodec=h264}:std{access=http,mux=ts,dst=:8080}',
    })
  })
})

describe('parseExtVlcOptLine', () => {
  it('matches case-insensitively and trims after the colon', () => {
    expect(parseExtVlcOptLine('#extvlcopt: start-time=1')).toMatchObject({ name: 'start-time', value: '1' })
    expect(parseExtVlcOptLine('  #EXTVLCOPT:http-referrer=https://x/')).toMatchObject({
      name: 'http-referrer',
      value: 'https://x/',
    })
  })

  it('rejects invalid tag forms seen in the wild', () => {
    expect(parseExtVlcOptLine('#EXTVLCOPT--http-reconnect=true')).toBeNull()
    expect(parseExtVlcOptLine('#EXTVLCOPT rogram=17713')).toBeNull()
    expect(parseExtVlcOptLine('#EXTVLCOPT:')).toBeNull()
  })
})

describe('isExtVlcOptLine', () => {
  it('detects valid lines only', () => {
    expect(isExtVlcOptLine('#EXTVLCOPT:program=1')).toBe(true)
    expect(isExtVlcOptLine('#EXTINF:-1,News')).toBe(false)
  })
})

describe('applyExtVlcOpts', () => {
  it('maps supported HTTP options and stores the rest', () => {
    const channel: Channel = {
      id: 'x',
      name: 'X',
      url: 'https://example.com/a.m3u8',
      sourceFile: 'p.m3u8',
      sourceKind: 'm3u',
      editable: false,
    }
    applyExtVlcOpts(channel, parseExtVlcOptList([
      'http-user-agent=Custom/1.0',
      'http-referrer=https://example.com/page',
      'http-user=alice',
      'http-pwd=secret',
      'program=1025',
      'no-video',
    ]))
    expect(channel.userAgent).toBe('Custom/1.0')
    expect(channel.referrer).toBe('https://example.com/page')
    expect(channel.headers?.Authorization).toBe(`Basic ${Buffer.from('alice:secret').toString('base64')}`)
    expect(channel.vlcOptions).toEqual({
      program: '1025',
      video: false,
    })
  })

  it('lets later duplicate names win in vlcOptions', () => {
    const channel: Pick<Channel, 'userAgent' | 'referrer' | 'headers' | 'vlcOptions'> = {}
    applyExtVlcOpts(channel, parseExtVlcOptList(['program=1', 'program=2']))
    expect(channel.vlcOptions).toEqual({ program: '2' })
  })
})

describe('parseExtVlcOptTable', () => {
  it('reads TOML tables with bool and numeric values', () => {
    expect(parseExtVlcOptTable({ 'http-user-agent': 'UA', program: 1025, 'rtsp-tcp': true })).toEqual([
      { raw: 'http-user-agent=UA', name: 'http-user-agent', value: 'UA' },
      { raw: 'program=1025', name: 'program', value: '1025' },
      { raw: 'rtsp-tcp', name: 'rtsp-tcp', value: true },
    ])
  })
})

describe('EXTVLCOPT_CATALOG', () => {
  it('lists every known name exactly once', () => {
    const names = EXTVLCOPT_CATALOG.map((entry) => entry.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names.length).toBeGreaterThan(100)
  })

  it('marks the IPTV HTTP subset as supported', () => {
    expect(SUPPORTED_EXTVLCOPT_NAMES).toEqual([
      'http-user-agent',
      'http-referrer',
      'http-user',
      'http-pwd',
    ])
  })
})
