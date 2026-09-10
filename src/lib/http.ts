import { UrlSource } from 'mediabunny'

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36'

const cookiesByOrigin = new Map<string, Map<string, string>>()

type FetchShape = {
  stripRange: boolean
  identityEncoding: boolean
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

function originOf(url: string): string {
  return new URL(url).origin
}

function isPlaylist(url: string): boolean {
  const path = new URL(url).pathname.toLowerCase()
  return path.endsWith('.m3u8') || path.endsWith('.m3u') || path.includes('.smil/')
}

function cookieHeader(origin: string): string | null {
  const jar = cookiesByOrigin.get(origin)
  if (!jar || jar.size === 0) return null
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ')
}

function storeCookies(url: string, response: Response): void {
  const origin = originOf(url)
  const raw =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie')].filter((value): value is string => !!value)
  if (raw.length === 0) return
  let jar = cookiesByOrigin.get(origin)
  if (!jar) {
    jar = new Map()
    cookiesByOrigin.set(origin, jar)
  }
  for (const header of raw) {
    const pair = header.split(';', 1)[0]
    if (!pair) continue
    const eq = pair.indexOf('=')
    if (eq <= 0) continue
    jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
  }
}

function buildHeaders(
  input: RequestInfo | URL,
  init?: RequestInit,
  { stripRange = false, identityEncoding = false }: FetchShape = { stripRange: false, identityEncoding: false },
): Headers {
  const headers = new Headers(init?.headers)
  if (input instanceof Request) {
    input.headers.forEach((value, key) => {
      if (!headers.has(key)) headers.set(key, value)
    })
  }
  if (!headers.has('User-Agent')) headers.set('User-Agent', BROWSER_UA)
  headers.set('Accept', '*/*')
  // Match browser/curl: let the runtime negotiate gzip. Forcing identity makes some
  // live-stream playlists return 204 No Content. Browsers also forbid setting this header.
  if (identityEncoding) {
    headers.set('Accept-Encoding', 'identity')
  } else {
    headers.delete('Accept-Encoding')
  }
  if (stripRange) headers.delete('Range')
  const url = requestUrl(input)
  const cookie = cookieHeader(originOf(url))
  if (cookie) headers.set('Cookie', cookie)
  return headers
}

async function doFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  shape: FetchShape,
): Promise<Response> {
  const headers = buildHeaders(input, init, shape)
  const url = requestUrl(input)
  const response = await fetch(input, { ...init, headers })
  storeCookies(url, response)
  return response
}

async function playlistHasBody(response: Response): Promise<boolean> {
  if (response.status === 204) return false
  if (!response.ok) return true
  const body = await response.clone().arrayBuffer()
  return body.byteLength > 0
}

// Match a normal browser GET: no Range, default gzip. UrlSource always adds Range;
// strip it for playlists — some CDNs return 200 + gzip with CL=compressed size (mediabunny
// 1.56.0 ignores that on cors), but 206 + Range still hits the Content-Length hole.
const PLAYLIST_FETCH_SHAPES: FetchShape[] = [
  { stripRange: true, identityEncoding: false },
  { stripRange: true, identityEncoding: true },
]

async function fetchPlaylist(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = requestUrl(input)
  for (const shape of PLAYLIST_FETCH_SHAPES) {
    const response = await doFetch(input, init, shape)
    if (await playlistHasBody(response)) return response
  }
  // Do not throw: UrlSource retries thrown fetch errors indefinitely.
  return new Response(`Playlist returned empty for ${url}`, {
    status: 502,
    statusText: 'Playlist Empty',
  })
}

/**
 * Fetch adapter for Mediabunny's UrlSource.
 *
 * Live CDNs gzip playlists and/or ignore Range requests (some answer 204;
 * gzip Content-Length is the compressed size). UrlSource then truncates the
 * M3U8, which surfaces as a bogus STREAM-INF parse error or 404s on cut URLs.
 */
export async function mediaFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = requestUrl(input)
  if (isPlaylist(url)) {
    return fetchPlaylist(input, init)
  }

  try {
    const response = await doFetch(input, init, { stripRange: false, identityEncoding: false })
    if (response.status === 204 || response.status === 416) {
      return await doFetch(input, init, { stripRange: true, identityEncoding: false })
    }
    return response
  } catch (error) {
    return await doFetch(input, init, { stripRange: true, identityEncoding: false })
  }
}

export function mediaSource(
  url: string,
  extra: { userAgent?: string; referrer?: string; headers?: Record<string, string> } = {},
): UrlSource {
  const headers: Record<string, string> = {
    Accept: '*/*',
    ...extra.headers,
    'User-Agent': extra.userAgent || extra.headers?.['User-Agent'] || BROWSER_UA,
  }
  if (extra.referrer) headers.Referer = extra.referrer
  else if (extra.headers?.Referer) headers.Referer = extra.headers.Referer
  return new UrlSource(url, {
    requestInit: { headers },
    fetchFn: mediaFetch as typeof fetch,
    maxCacheSize: 8 * 1024 * 1024,
  })
}
