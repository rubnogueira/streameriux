import type { Channel } from './channel'

/** Parsed value for one `#EXTVLCOPT:` entry (VLC per-item MRL option). */
export type ExtVlcOptValue = string | boolean

export type ParsedExtVlcOpt = {
  /** Raw string after `EXTVLCOPT:` (preserved for round-trip). */
  raw: string
  name: string
  value: ExtVlcOptValue
}

export type ExtVlcOptType = 'string' | 'int' | 'float' | 'ms' | 'bool' | 'url' | 'enum' | 'csv'

export type ExtVlcOptCatalogEntry = {
  name: string
  type: ExtVlcOptType
  category: ExtVlcOptCategory
  meaning: string
  /** Honored by GPIUX Streamer at playback / fetch time. */
  supported: boolean
}

export type ExtVlcOptCategory =
  | 'http'
  | 'playback'
  | 'av'
  | 'mpegts'
  | 'dvb'
  | 'sout'
  | 'other'

/**
 * Snapshot of the VLC per-item option namespace (from `vlc -H` / module config).
 * Not exhaustive for every VLC build — unknown names are still parsed and stored.
 */
export const EXTVLCOPT_CATALOG: readonly ExtVlcOptCatalogEntry[] = [
  // HTTP / network (IPTV must-have)
  { name: 'http-user-agent', type: 'string', category: 'http', meaning: 'HTTP User-Agent header', supported: true },
  { name: 'http-referrer', type: 'url', category: 'http', meaning: 'HTTP Referer header (VLC spelling: referrer)', supported: true },
  { name: 'http-reconnect', type: 'bool', category: 'http', meaning: 'Reconnect HTTP streams on drop', supported: false },
  { name: 'http-user', type: 'string', category: 'http', meaning: 'HTTP basic auth username', supported: true },
  { name: 'http-pwd', type: 'string', category: 'http', meaning: 'HTTP basic auth password', supported: true },
  { name: 'http-proxy', type: 'url', category: 'http', meaning: 'HTTP proxy URL', supported: false },
  { name: 'http-proxy-pwd', type: 'string', category: 'http', meaning: 'HTTP proxy password', supported: false },
  { name: 'http-forward-cookies', type: 'bool', category: 'http', meaning: 'Forward cookies on HTTP requests', supported: false },
  { name: 'http-caching', type: 'ms', category: 'http', meaning: 'Legacy HTTP cache (ms)', supported: false },
  { name: 'network-caching', type: 'ms', category: 'http', meaning: 'Network cache (ms, VLC 2+)', supported: false },
  { name: 'file-caching', type: 'ms', category: 'http', meaning: 'Local file cache (ms)', supported: false },
  { name: 'live-caching', type: 'ms', category: 'http', meaning: 'Live capture cache (ms)', supported: false },
  { name: 'disc-caching', type: 'ms', category: 'http', meaning: 'Optical disc cache (ms)', supported: false },
  { name: 'rtsp-tcp', type: 'bool', category: 'http', meaning: 'RTSP interleaved over TCP', supported: false },
  { name: 'rtsp-frame-buffer-size', type: 'int', category: 'http', meaning: 'RTSP frame buffer (bytes)', supported: false },
  { name: 'rtsp-user', type: 'string', category: 'http', meaning: 'RTSP username', supported: false },
  { name: 'rtsp-pwd', type: 'string', category: 'http', meaning: 'RTSP password', supported: false },
  { name: 'rtmp-caching', type: 'ms', category: 'http', meaning: 'RTMP cache (ms)', supported: false },
  { name: 'mms-caching', type: 'ms', category: 'http', meaning: 'MMS cache (ms, legacy)', supported: false },
  { name: 'udp-caching', type: 'ms', category: 'http', meaning: 'UDP cache (ms, legacy)', supported: false },
  { name: 'mtu', type: 'int', category: 'http', meaning: 'Network MTU', supported: false },
  { name: 'ipv4', type: 'bool', category: 'http', meaning: 'Force IPv4', supported: false },
  { name: 'ipv6', type: 'bool', category: 'http', meaning: 'Force IPv6', supported: false },
  { name: 'socks', type: 'string', category: 'http', meaning: 'SOCKS proxy', supported: false },
  { name: 'socks-user', type: 'string', category: 'http', meaning: 'SOCKS username', supported: false },
  { name: 'socks-pwd', type: 'string', category: 'http', meaning: 'SOCKS password', supported: false },
  { name: 'http-host', type: 'string', category: 'http', meaning: 'HTTP bind/host override', supported: false },

  // Playback / input
  { name: 'start-time', type: 'float', category: 'playback', meaning: 'Start offset (seconds)', supported: false },
  { name: 'stop-time', type: 'float', category: 'playback', meaning: 'Stop offset (seconds)', supported: false },
  { name: 'run-time', type: 'float', category: 'playback', meaning: 'Play duration (seconds)', supported: false },
  { name: 'rate', type: 'float', category: 'playback', meaning: 'Playback speed (1 = 100%)', supported: false },
  { name: 'input-repeat', type: 'int', category: 'playback', meaning: 'Repeat count (-1 = forever)', supported: false },
  { name: 'input-slave', type: 'url', category: 'playback', meaning: 'Extra audio/subs input URL', supported: false },
  { name: 'input-title-format', type: 'string', category: 'playback', meaning: 'Title format string', supported: false },
  { name: 'bookmarks', type: 'string', category: 'playback', meaning: 'Bookmark list', supported: false },
  { name: 'access', type: 'string', category: 'playback', meaning: 'Force access module', supported: false },
  { name: 'demux', type: 'string', category: 'playback', meaning: 'Force demuxer module', supported: false },
  { name: 'codec', type: 'string', category: 'playback', meaning: 'Force decoder module', supported: false },
  { name: 'stream-filter', type: 'string', category: 'playback', meaning: 'Stream filter module', supported: false },
  { name: 'clock-synchro', type: 'int', category: 'playback', meaning: 'Clock sync mode', supported: false },
  { name: 'clock-jitter', type: 'ms', category: 'playback', meaning: 'Max clock jitter (ms)', supported: false },
  { name: 'cr-average', type: 'int', category: 'playback', meaning: 'Clock reference average', supported: false },
  { name: 'network-synchronisation', type: 'bool', category: 'playback', meaning: 'Network synchronisation', supported: false },
  { name: 'file-cat', type: 'bool', category: 'playback', meaning: 'Play truncated files (legacy)', supported: false },

  // Audio / video / subs
  { name: 'audio', type: 'bool', category: 'av', meaning: 'Enable audio', supported: false },
  { name: 'no-audio', type: 'bool', category: 'av', meaning: 'Disable audio', supported: false },
  { name: 'video', type: 'bool', category: 'av', meaning: 'Enable video', supported: false },
  { name: 'no-video', type: 'bool', category: 'av', meaning: 'Disable video', supported: false },
  { name: 'audio-track', type: 'int', category: 'av', meaning: '0-based audio track index', supported: false },
  { name: 'audio-track-id', type: 'int', category: 'av', meaning: 'Audio track by id', supported: false },
  { name: 'audio-language', type: 'csv', category: 'av', meaning: 'Preferred audio languages', supported: false },
  { name: 'audio-desync', type: 'ms', category: 'av', meaning: 'Audio delay (ms)', supported: false },
  { name: 'volume', type: 'int', category: 'av', meaning: 'Volume (legacy scale)', supported: false },
  { name: 'aout', type: 'string', category: 'av', meaning: 'Audio output module', supported: false },
  { name: 'audio-filter', type: 'string', category: 'av', meaning: 'Audio filter chain', supported: false },
  { name: 'video-track', type: 'int', category: 'av', meaning: '0-based video track index', supported: false },
  { name: 'video-track-id', type: 'int', category: 'av', meaning: 'Video track by id', supported: false },
  { name: 'aspect-ratio', type: 'string', category: 'av', meaning: 'Display aspect ratio', supported: false },
  { name: 'deinterlace', type: 'enum', category: 'av', meaning: 'Deinterlace mode', supported: false },
  { name: 'deinterlace-mode', type: 'enum', category: 'av', meaning: 'Deinterlace algorithm', supported: false },
  { name: 'video-filter', type: 'string', category: 'av', meaning: 'Video filter chain', supported: false },
  { name: 'vout', type: 'string', category: 'av', meaning: 'Video output module', supported: false },
  { name: 'sub-track', type: 'int', category: 'av', meaning: '0-based subtitle track index', supported: false },
  { name: 'sub-track-id', type: 'int', category: 'av', meaning: 'Subtitle track by id', supported: false },
  { name: 'sub-file', type: 'string', category: 'av', meaning: 'External subtitle path', supported: false },
  { name: 'sub-language', type: 'csv', category: 'av', meaning: 'Preferred subtitle languages', supported: false },
  { name: 'sub-autodetect-file', type: 'bool', category: 'av', meaning: 'Autodetect sidecar subtitles', supported: false },
  { name: 'sub-delay', type: 'float', category: 'av', meaning: 'Subtitle delay (seconds)', supported: false },
  { name: 'sub-fps', type: 'float', category: 'av', meaning: 'Subtitle FPS (0 = default)', supported: false },
  { name: 'subsdec-encoding', type: 'string', category: 'av', meaning: 'Subtitle charset', supported: false },
  { name: 'subsdec-align', type: 'int', category: 'av', meaning: 'Subtitle alignment', supported: false },
  { name: 'freetype-rel-fontsize', type: 'int', category: 'av', meaning: 'Relative subtitle font size', supported: false },
  { name: 'spu', type: 'bool', category: 'av', meaning: 'Enable subpictures', supported: false },
  { name: 'no-spu', type: 'bool', category: 'av', meaning: 'Disable subpictures', supported: false },

  // MPEG-TS
  { name: 'program', type: 'int', category: 'mpegts', meaning: 'MPEG-TS program (PMT) number', supported: false },
  { name: 'programs', type: 'csv', category: 'mpegts', meaning: 'Multiple MPEG-TS program numbers', supported: false },
  { name: 'ts-es-id-pid', type: 'bool', category: 'mpegts', meaning: 'Set ES id = PID', supported: false },
  { name: 'ts-out', type: 'string', category: 'mpegts', meaning: 'Dump transport stream', supported: false },
  { name: 'ts-csa-ck', type: 'string', category: 'mpegts', meaning: 'CSA key', supported: false },
  { name: 'ts-csa2-ck', type: 'string', category: 'mpegts', meaning: 'CSA2 key', supported: false },
  { name: 'ts-csa-pkt', type: 'int', category: 'mpegts', meaning: 'CSA packet size', supported: false },
  { name: 'ts-split-es', type: 'bool', category: 'mpegts', meaning: 'Split elementary streams', supported: false },
  { name: 'ts-seek-percent', type: 'bool', category: 'mpegts', meaning: 'Seek by percent', supported: false },
  { name: 'ts-out-mtu', type: 'int', category: 'mpegts', meaning: 'TS output MTU', supported: false },
  { name: 'sout-ts-pid-video', type: 'int', category: 'mpegts', meaning: 'Fixed video PID (sout)', supported: false },
  { name: 'sout-ts-pid-audio', type: 'int', category: 'mpegts', meaning: 'Fixed audio PID (sout)', supported: false },
  { name: 'sout-ts-pid-spu', type: 'int', category: 'mpegts', meaning: 'Fixed SPU PID (sout)', supported: false },
  { name: 'sout-ts-pid-pmt', type: 'int', category: 'mpegts', meaning: 'Fixed PMT PID (sout)', supported: false },
  { name: 'sout-ts-es-id-pid', type: 'bool', category: 'mpegts', meaning: 'Sout PID = ES id', supported: false },
  { name: 'sout-ts-dts-delay', type: 'ms', category: 'mpegts', meaning: 'DTS delay (sout)', supported: false },

  // DVB / capture
  { name: 'dvb-adapter', type: 'int', category: 'dvb', meaning: 'DVB adapter index', supported: false },
  { name: 'dvb-device', type: 'int', category: 'dvb', meaning: 'DVB frontend/device index', supported: false },
  { name: 'dvb-frequency', type: 'int', category: 'dvb', meaning: 'Tuner frequency (Hz/kHz per system)', supported: false },
  { name: 'dvb-bandwidth', type: 'int', category: 'dvb', meaning: 'Channel bandwidth (MHz)', supported: false },
  { name: 'dvb-srate', type: 'int', category: 'dvb', meaning: 'Symbol rate', supported: false },
  { name: 'dvb-voltage', type: 'int', category: 'dvb', meaning: 'LNB voltage (13/18 V)', supported: false },
  { name: 'dvb-satno', type: 'int', category: 'dvb', meaning: 'DiSEqC satellite number', supported: false },
  { name: 'dvb-tone', type: 'int', category: 'dvb', meaning: '22 kHz tone', supported: false },
  { name: 'dvb-fec', type: 'int', category: 'dvb', meaning: 'Forward error correction', supported: false },
  { name: 'dvb-modulation', type: 'string', category: 'dvb', meaning: 'Modulation (e.g. 64QAM)', supported: false },
  { name: 'dvb-transmission', type: 'int', category: 'dvb', meaning: 'Transmission mode', supported: false },
  { name: 'dvb-guard', type: 'int', category: 'dvb', meaning: 'Guard interval', supported: false },
  { name: 'dvb-hierarchy', type: 'int', category: 'dvb', meaning: 'Hierarchy (-1 = auto)', supported: false },
  { name: 'dvb-inversion', type: 'int', category: 'dvb', meaning: 'Inversion (-1 = auto)', supported: false },
  { name: 'dvb-probe', type: 'bool', category: 'dvb', meaning: 'Probe DVB card', supported: false },
  { name: 'dvb-caching', type: 'ms', category: 'dvb', meaning: 'DVB cache (ms)', supported: false },
  { name: 'dvb-high-voltage', type: 'bool', category: 'dvb', meaning: 'High LNB voltage', supported: false },
  { name: 'dvb-lnb-lof1', type: 'int', category: 'dvb', meaning: 'LNB LOF1 (kHz)', supported: false },
  { name: 'dvb-lnb-lof2', type: 'int', category: 'dvb', meaning: 'LNB LOF2 (kHz)', supported: false },
  { name: 'dvb-lnb-slof', type: 'int', category: 'dvb', meaning: 'LNB switch LOF (kHz)', supported: false },
  { name: 'dvb-code-rate-hp', type: 'int', category: 'dvb', meaning: 'HP code rate', supported: false },
  { name: 'dvb-code-rate-lp', type: 'int', category: 'dvb', meaning: 'LP code rate', supported: false },
  { name: 'dvb-budget-mode', type: 'bool', category: 'dvb', meaning: 'DVB budget mode', supported: false },
  { name: 'screen-fps', type: 'float', category: 'dvb', meaning: 'Desktop capture FPS', supported: false },
  { name: 'screen-caching', type: 'ms', category: 'dvb', meaning: 'Desktop capture cache (ms)', supported: false },
  { name: 'screen-left', type: 'int', category: 'dvb', meaning: 'Capture rectangle left', supported: false },
  { name: 'screen-top', type: 'int', category: 'dvb', meaning: 'Capture rectangle top', supported: false },
  { name: 'screen-width', type: 'int', category: 'dvb', meaning: 'Capture rectangle width', supported: false },
  { name: 'screen-height', type: 'int', category: 'dvb', meaning: 'Capture rectangle height', supported: false },
  { name: 'fake-file-reload', type: 'int', category: 'dvb', meaning: 'fake:// image reload interval', supported: false },

  // Stream output (unsafe on untrusted playlists)
  { name: 'sout', type: 'string', category: 'sout', meaning: 'Stream output chain', supported: false },
  { name: 'sout-keep', type: 'bool', category: 'sout', meaning: 'Keep sout open across items', supported: false },
  { name: 'sout-all', type: 'bool', category: 'sout', meaning: 'Sout all streams', supported: false },
  { name: 'sout-audio', type: 'bool', category: 'sout', meaning: 'Sout audio', supported: false },
  { name: 'sout-video', type: 'bool', category: 'sout', meaning: 'Sout video', supported: false },
  { name: 'sout-spu', type: 'bool', category: 'sout', meaning: 'Sout subpictures', supported: false },
  { name: 'sout-transcode-vcodec', type: 'string', category: 'sout', meaning: 'Sout video codec', supported: false },
  { name: 'sout-transcode-acodec', type: 'string', category: 'sout', meaning: 'Sout audio codec', supported: false },
  { name: 'sout-transcode-vb', type: 'int', category: 'sout', meaning: 'Sout video bitrate', supported: false },
  { name: 'sout-transcode-ab', type: 'int', category: 'sout', meaning: 'Sout audio bitrate', supported: false },
  { name: 'sout-transcode-channels', type: 'int', category: 'sout', meaning: 'Sout audio channels', supported: false },
  { name: 'sout-transcode-width', type: 'int', category: 'sout', meaning: 'Sout transcode width', supported: false },
  { name: 'sout-transcode-height', type: 'int', category: 'sout', meaning: 'Sout transcode height', supported: false },
  { name: 'sout-transcode-deinterlace', type: 'bool', category: 'sout', meaning: 'Sout deinterlace', supported: false },
  { name: 'sout-standard-mux', type: 'string', category: 'sout', meaning: 'Sout mux standard', supported: false },
  { name: 'sout-standard-access', type: 'string', category: 'sout', meaning: 'Sout access standard', supported: false },
  { name: 'sout-standard-dst', type: 'string', category: 'sout', meaning: 'Sout destination', supported: false },
  { name: 'sout-mux-caching', type: 'ms', category: 'sout', meaning: 'Sout mux cache (ms)', supported: false },
  { name: 'sout-udp-caching', type: 'ms', category: 'sout', meaning: 'Sout UDP cache (ms)', supported: false },
  { name: 'sout-rtp-caching', type: 'ms', category: 'sout', meaning: 'Sout RTP cache (ms)', supported: false },
  { name: 'sout-livehttp-caching', type: 'bool', category: 'sout', meaning: 'Sout live HTTP caching', supported: false },
] as const

const CATALOG_BY_NAME = new Map(EXTVLCOPT_CATALOG.map((entry) => [entry.name, entry]))

/** Names GPIUX Streamer maps onto fetch / channel fields today. */
export const SUPPORTED_EXTVLCOPT_NAMES = EXTVLCOPT_CATALOG.filter((entry) => entry.supported).map(
  (entry) => entry.name,
)

const EXTVLCOPT_TAG = /^#?\s*EXTVLCOPT\s*:/i

export function isExtVlcOptLine(line: string): boolean {
  return EXTVLCOPT_TAG.test(line.trim())
}

/** Parse the option string after `EXTVLCOPT:` (VLC MRL `:option` form). */
export function parseExtVlcOptRaw(raw: string): ParsedExtVlcOpt | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const eq = trimmed.indexOf('=')
  if (eq > 0) {
    const name = trimmed.slice(0, eq).trim().toLowerCase()
    const value = trimmed.slice(eq + 1)
    if (!name) return null
    return { raw: trimmed, name, value }
  }

  if (trimmed.startsWith('no-')) {
    const name = trimmed.slice(3).trim().toLowerCase()
    if (!name) return null
    return { raw: trimmed, name, value: false }
  }

  const name = trimmed.toLowerCase()
  if (!/^[a-z0-9-]+$/.test(name)) return null
  return { raw: trimmed, name, value: true }
}

/** Parse a full M3U line (`#EXTVLCOPT:…`). Returns null for invalid lines. */
export function parseExtVlcOptLine(line: string): ParsedExtVlcOpt | null {
  const trimmed = line.trim()
  const match = trimmed.match(/^#\s*EXTVLCOPT\s*:(.*)$/i)
  if (!match) return null
  return parseExtVlcOptRaw(match[1] ?? '')
}

function parseBool(value: ExtVlcOptValue): boolean {
  if (typeof value === 'boolean') return value
  const v = value.trim().toLowerCase()
  if (v === '' || v === '1' || v === 'true' || v === 'yes') return true
  if (v === '0' || v === 'false' || v === 'no') return false
  return true
}

function basicAuthHeader(user: string, pwd: string): string {
  return `Basic ${Buffer.from(`${user}:${pwd}`, 'utf8').toString('base64')}`
}

type VlcOptTarget = Pick<Channel, 'userAgent' | 'referrer' | 'headers' | 'vlcOptions'>

/**
 * Apply parsed EXTVLCOPT entries onto channel fetch fields.
 * Supported names become `userAgent`, `referrer`, or HTTP headers; the rest land in `vlcOptions`.
 * Later duplicate names win (VLC keeps a list; we collapse for playback fields).
 */
export function applyExtVlcOpts(target: VlcOptTarget, opts: readonly ParsedExtVlcOpt[]): void {
  if (opts.length === 0) return

  const extras: Record<string, ExtVlcOptValue> = { ...target.vlcOptions }
  let httpUser: string | undefined
  let httpPwd: string | undefined

  for (const opt of opts) {
    const name = opt.name
    switch (name) {
      case 'http-user-agent':
      case 'user-agent':
        if (typeof opt.value === 'string' && opt.value.length > 0) target.userAgent = opt.value
        continue
      case 'http-referrer':
      case 'http-referer':
      case 'referrer':
        if (typeof opt.value === 'string' && opt.value.length > 0) target.referrer = opt.value
        continue
      case 'http-user':
        if (typeof opt.value === 'string') httpUser = opt.value
        continue
      case 'http-pwd':
        if (typeof opt.value === 'string') httpPwd = opt.value
        continue
      default:
        extras[name] = opt.value
        continue
    }
  }

  if (httpUser != null && httpPwd != null) {
    const headers = { ...target.headers }
    headers.Authorization = basicAuthHeader(httpUser, httpPwd)
    target.headers = headers
  }

  if (Object.keys(extras).length > 0) target.vlcOptions = extras
  else if (target.vlcOptions && Object.keys(target.vlcOptions).length === 0) target.vlcOptions = undefined
}

/** Lookup catalog metadata; unknown VLC build options return undefined. */
export function extVlcOptCatalogEntry(name: string): ExtVlcOptCatalogEntry | undefined {
  return CATALOG_BY_NAME.get(name.toLowerCase())
}

/** Parse raw strings from TOML `extvlcopt = [ "…", … ]`. */
export function parseExtVlcOptList(entries: readonly string[]): ParsedExtVlcOpt[] {
  const parsed: ParsedExtVlcOpt[] = []
  for (const entry of entries) {
    const opt = parseExtVlcOptRaw(entry)
    if (opt) parsed.push(opt)
  }
  return parsed
}

/** Parse a TOML `[channel.vlc_options]` / inline table into parsed options. */
export function parseExtVlcOptTable(table: Record<string, unknown>): ParsedExtVlcOpt[] {
  const parsed: ParsedExtVlcOpt[] = []
  for (const [key, value] of Object.entries(table)) {
    const name = key.trim().toLowerCase()
    if (!name) continue
    if (typeof value === 'boolean') {
      parsed.push({ raw: value ? name : `no-${name}`, name, value })
      continue
    }
    if (typeof value === 'number') {
      parsed.push({ raw: `${name}=${value}`, name, value: String(value) })
      continue
    }
    const str = typeof value === 'string' ? value : value == null ? '' : String(value)
    if (str === '') parsed.push({ raw: name, name, value: true })
    else parsed.push({ raw: `${name}=${str}`, name, value: str })
  }
  return parsed
}

export function isSupportedExtVlcOpt(name: string): boolean {
  return extVlcOptCatalogEntry(name)?.supported === true
}

export function coerceExtVlcOptBool(value: ExtVlcOptValue): boolean {
  return parseBool(value)
}
