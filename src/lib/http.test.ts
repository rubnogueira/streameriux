import { afterEach, describe, expect, it, vi } from 'vitest'
import { mediaFetch, mediaSource } from './http'

const realFetch = globalThis.fetch

function setMockFetch(mock: ReturnType<typeof vi.fn>): void {
  ;(globalThis as { fetch: typeof fetch }).fetch = Object.assign(mock, {
    preconnect: vi.fn(),
  }) as typeof fetch
}

function empty204(): Response {
  return {
    ok: true,
    status: 204,
    headers: new Headers(),
    clone() {
      return this
    },
    async arrayBuffer() {
      return new ArrayBuffer(0)
    },
  } as Response
}

afterEach(() => {
  globalThis.fetch = realFetch
})

describe('mediaFetch', () => {
  it('fetches playlists like a browser GET (no Range, default gzip)', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(
      new Response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\na.m3u8\n', {
        status: 200,
        headers: { 'Content-Type': 'application/vnd.apple.mpegurl', 'Content-Length': '42' },
      }),
    )
    setMockFetch(fetch)

    const response = await mediaFetch(
      'https://example.com/live/playlist.m3u8',
      { headers: { Range: 'bytes=0-' } },
    )
    const body = await response.text()

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(200)
    expect(body.startsWith('#EXTM3U')).toBe(true)

    const headers = new Headers(fetch.mock.calls[0]?.[1]?.headers)
    expect(headers.has('Accept-Encoding')).toBe(false)
    expect(headers.get('Range')).toBeNull()
  })

  it('retries playlists with identity encoding after an empty response', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(empty204())
      .mockResolvedValueOnce(
        new Response('#EXTM3U\n', {
          status: 200,
          headers: { 'Content-Type': 'application/vnd.apple.mpegurl' },
        }),
      )
    setMockFetch(fetch)

    const response = await mediaFetch('https://example.com/live/playlist.m3u8')

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(response.status).toBe(200)
    const retryHeaders = new Headers(fetch.mock.calls[1]?.[1]?.headers)
    expect(retryHeaders.get('Accept-Encoding')).toBe('identity')
    expect(retryHeaders.get('Range')).toBeNull()
  })

  it('returns a 502 when every playlist attempt is empty', async () => {
    const fetch = vi.fn().mockResolvedValue(empty204())
    setMockFetch(fetch)

    const response = await mediaFetch(
      'https://example.com/live/alt/playlist.m3u8',
    )

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(response.status).toBe(502)
    expect(response.statusText).toBe('Playlist Empty')
  })

  it('retries segment fetches without Range on 204', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(empty204())
      .mockResolvedValueOnce(new Response('segment', { status: 200 }))
    setMockFetch(fetch)

    const response = await mediaFetch('https://example.com/seg.ts', {
      headers: { Range: 'bytes=0-' },
    })

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(response.status).toBe(200)
    const retryHeaders = new Headers(fetch.mock.calls[1]?.[1]?.headers)
    expect(retryHeaders.has('Range')).toBe(false)
  })
})

describe('mediaSource', () => {
  it('passes an explicit referer from channel config', () => {
    const source = mediaSource('https://example.com/live.m3u8', {
      referrer: 'https://example.com/watch',
    })
    expect(source).toBeTruthy()
  })
})
