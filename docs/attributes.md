# Channel attributes reference

TOML catalogs use the **same attribute names as M3U8 playlists**, so anything you
can express in an `#EXTINF` line has an identical TOML key. When you import an M3U,
each attribute maps straight across — no renaming.

TOML allows hyphens in bare keys, so `tvg-id = "Acme.us"` is valid TOML and reads
exactly like the M3U8 attribute. The older underscore spellings (`tvg_id`,
`group_title`, …) are still accepted for back-compatibility, and a few friendly
aliases (`group`, `icon`, `chno`, `category`) continue to work too.

## Attributes

| M3U8 attribute                             | TOML key         | Meaning                                                                                                                       |
| ------------------------------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `tvg-id`                                   | `tvg-id`         | EPG channel id used to match guide data.                                                                                      |
| `tvg-name`                                 | `tvg-name`       | Guide display name (falls back to the `#EXTINF` title).                                                                       |
| `tvg-logo`                                 | `tvg-logo`       | Channel logo. Local path (relative to the TOML file or `channels/`, or absolute) or an `http(s)` URL. Alias: `icon` / `logo`. |
| `tvg-country`                              | `tvg-country`    | Country code(s).                                                                                                              |
| `tvg-language`                             | `tvg-language`   | Language(s).                                                                                                                  |
| `tvg-chno` / `ch-number`                   | `tvg-chno`       | Channel number. Alias: `chno`.                                                                                                |
| `group-title` (first of `;`) / `tvg-group` | `group-title`    | Category/group. Alias: `group`, `category`.                                                                                   |
| `tvg-shift`                                | `tvg-shift`      | EPG time shift, in hours.                                                                                                     |
| `radio`                                    | `radio`          | `true` for audio-only stations.                                                                                               |
| `catchup` / `catchup-type`                 | `catchup`        | Catch-up/timeshift type.                                                                                                      |
| `catchup-source`                           | `catchup-source` | Catch-up URL template.                                                                                                        |
| `catchup-days` / `catchup-back`            | `catchup-days`   | How many days of catch-up are available.                                                                                      |

## Stream headers (`#EXTVLCOPT`)

`#EXTVLCOPT` lines carry HTTP options rather than playlist attributes, so their
TOML keys keep readable names:

| M3U8 (`#EXTVLCOPT:…`)     | TOML key                              | Meaning                                                                                     |
| ------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------- |
| `http-user-agent`         | `user_agent`                          | `User-Agent` header for the stream request.                                                 |
| `http-referrer`           | `referrer`                            | `Referer` header.                                                                           |
| `http-user` + `http-pwd`  | `[channel.headers]`                   | Combined into an HTTP `Authorization` header.                                               |
| Other `#EXTVLCOPT:` names | `[channel.vlc_options]` / `extvlcopt` | Stored as `vlcOptions` — see the [EXTVLCOPT specification](#extvlcopt-specification) below. |

You can also set arbitrary request headers directly:

```toml
[channel.headers]
Origin = "https://origin.example"
Referer = "https://referer.example/"
"User-Agent" = "Mozilla/5.0"
```

A top-level `origin = "…"` is promoted into the `Origin` header.

## Playlist-wide header attributes

Attributes on the `#EXTM3U` header are read as catalog-wide defaults:

- `url-tvg` / `x-tvg-url` — EPG URL.
- `tvg-shift` / `catchup` / `catchup-source` / `catchup-days` — per-channel defaults.

Unknown attributes are ignored, per IPTV convention.

## Example

```toml
[[channel]]
id = "acme"
name = "Acme TV"
group-title = "United States"
tvg-logo = "https://example.com/acme.png"
tvg-id = "Acme.us"
url = "https://example.com/live/playlist.m3u8"
```

---

# EXTVLCOPT specification

`#EXTVLCOPT:` is a **VLC-only M3U extension**. Each line attaches one **per-item input option** to the **next media URL** in the playlist. It is the M3U spelling of an MRL `:option` (the same namespace as `libvlc_media_add_option()`, XSPF `<vlc:option>`, and VLC CLI `:option=value`).

There is **no closed catalog**: VLC accepts any module option from `vlc -H`. GPIUX Streamer ships a **snapshot catalog** in [`src/catalog/extvlcopt.ts`](../src/catalog/extvlcopt.ts) and only **applies the subset relevant to HTTP IPTV playback**; everything else is parsed and stored on the channel for fidelity.

## Syntax

```
#EXTVLCOPT:<option>
```

| Form           | Example                                  | Meaning                   |
| -------------- | ---------------------------------------- | ------------------------- |
| Assignment     | `#EXTVLCOPT:http-user-agent=Mozilla/5.0` | Option with value         |
| Flag (enable)  | `#EXTVLCOPT:rtsp-tcp`                    | Boolean on                |
| Flag (disable) | `#EXTVLCOPT:no-video`                    | Boolean off (`no-<name>`) |

Grammar (after the tag):

```
option = flag | assignment
flag   = name | "no-" name
assignment = name , "=" , value
name   = 1*( ALPHA | DIGIT | "-" )
value  = *CHAR          ; split on first "=" only; trim CR/LF, not inner spaces
```

Rules (from [VLC `m3u.c`](https://github.com/videolan/vlc/blob/master/modules/demux/playlist/m3u.c)):

- Match `EXTVLCOPT` **case-insensitively**; the `:` after the tag is **required**.
- Empty `#EXTVLCOPT:` is invalid — skip or reject.
- One or more `#EXTVLCOPT` lines **accumulate** on the next URL only; they do **not** leak to later entries.
- Order relative to `#EXTINF` is **not fixed** — options may appear before or after `#EXTINF` as long as they precede the URL.
- `#EXTVLCOPT--foo=bar` (missing `:`) and `#EXTVLCOPT foo=bar` (space instead of `:`) are **invalid**.

Equivalent encodings:

| Format | Example                                                       |
| ------ | ------------------------------------------------------------- |
| M3U    | `#EXTVLCOPT:http-referrer=https://example.com/`               |
| MRL    | `http://host/stream.m3u8 :http-referrer=https://example.com/` |
| XSPF   | `<vlc:option>http-referrer=https://example.com/</vlc:option>` |
| TOML   | see [TOML mapping](#toml-mapping)                             |

## M3U / M3U8 compatibility

| Context                                                                         | EXTVLCOPT handling                                                                               |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **IPTV channel list** (`#EXTM3U` + `#EXTINF`, no `#EXT-X-*`)                    | Parsed; options attach to each channel URL.                                                      |
| **HLS media/master manifest** (`#EXT-X-TARGETDURATION`, `#EXT-X-STREAM-INF`, …) | **Ignored** — treated as a single stream, not a catalog import.                                  |
| **Bare `.m3u` / `.m3u8` file extension**                                        | Same as above: content decides playlist vs stream (`isM3uPlaylistText` in `src/catalog/m3u.ts`). |

HLS parsers that are not importing IPTV catalogs should treat unknown `#` lines as comments. GPIUX Streamer follows that split.

## Parser algorithm

```
pending_vlcopts = []

for each line:
  if line matches #EXTVLCOPT: (ci):
    append parse(option) to pending_vlcopts
    continue
  if line is media URL:
    channel = merge(pending_entry, apply(pending_vlcopts), parse_pipe_url(line))
    emit channel
    pending_vlcopts = []
```

Boolean values also accept `=0`, `=1`, `=true`, `=false`.

## Full option catalog

Source: VLC module config (`vlc -H`, `vlc --longhelp --advanced`). The table below mirrors [`EXTVLCOPT_CATALOG`](../src/catalog/extvlcopt.ts). **`supported`** marks options GPIUX Streamer maps onto fetch/playback today.

### HTTP / network

| Name                                 | Type   | Supported | Meaning                       |
| ------------------------------------ | ------ | --------- | ----------------------------- |
| `http-user-agent`                    | string | yes       | HTTP `User-Agent`             |
| `http-referrer`                      | url    | yes       | HTTP `Referer` (VLC spelling) |
| `http-reconnect`                     | bool   |           | Reconnect HTTP on drop        |
| `http-user`                          | string | yes       | HTTP basic auth user          |
| `http-pwd`                           | string | yes       | HTTP basic auth password      |
| `http-proxy`                         | url    |           | HTTP proxy URL                |
| `http-proxy-pwd`                     | string |           | Proxy password                |
| `http-forward-cookies`               | bool   |           | Forward cookies               |
| `http-caching`                       | ms     |           | Legacy HTTP cache             |
| `network-caching`                    | ms     |           | Network cache (VLC 2+)        |
| `file-caching`                       | ms     |           | Local file cache              |
| `live-caching`                       | ms     |           | Live capture cache            |
| `disc-caching`                       | ms     |           | Disc cache                    |
| `rtsp-tcp`                           | bool   |           | RTSP over TCP                 |
| `rtsp-frame-buffer-size`             | int    |           | RTSP frame buffer             |
| `rtsp-user` / `rtsp-pwd`             | string |           | RTSP credentials              |
| `rtmp-caching`                       | ms     |           | RTMP cache                    |
| `mms-caching` / `udp-caching`        | ms     |           | Legacy caches                 |
| `mtu`                                | int    |           | Network MTU                   |
| `ipv4` / `ipv6`                      | bool   |           | Force IP family               |
| `socks` / `socks-user` / `socks-pwd` | string |           | SOCKS proxy                   |
| `http-host`                          | string |           | HTTP bind/host                |

### Playback / input

| Name                                            | Type   | Meaning                       |
| ----------------------------------------------- | ------ | ----------------------------- |
| `start-time` / `stop-time` / `run-time`         | float  | Clip bounds (seconds)         |
| `rate`                                          | float  | Playback speed                |
| `input-repeat`                                  | int    | Repeat count (`-1` = forever) |
| `input-slave`                                   | url    | Extra audio/subs input        |
| `input-title-format`                            | string | Title format                  |
| `bookmarks`                                     | string | Bookmark list                 |
| `access` / `demux` / `codec` / `stream-filter`  | string | Force modules                 |
| `clock-synchro` / `clock-jitter` / `cr-average` | int/ms | Clock tuning                  |
| `network-synchronisation`                       | bool   | Net sync                      |
| `file-cat`                                      | bool   | Truncated files (legacy)      |

### Audio / video / subtitles

| Name                                        | Type       | Meaning                   |
| ------------------------------------------- | ---------- | ------------------------- |
| `audio` / `no-audio` / `video` / `no-video` | bool       | Enable/disable tracks     |
| `audio-track` / `audio-track-id`            | int        | Audio selection           |
| `audio-language`                            | csv        | Preferred languages       |
| `audio-desync`                              | ms         | Audio delay               |
| `volume`                                    | int        | Legacy volume scale       |
| `aout` / `audio-filter`                     | string     | Audio output/filter       |
| `video-track` / `video-track-id`            | int        | Video selection           |
| `aspect-ratio`                              | string     | Display aspect            |
| `deinterlace` / `deinterlace-mode`          | enum       | Deinterlace               |
| `video-filter` / `vout`                     | string     | Video filter/output       |
| `sub-track` / `sub-track-id`                | int        | Subtitle selection        |
| `sub-file` / `sub-language`                 | string/csv | External / preferred subs |
| `sub-autodetect-file`                       | bool       | Sidecar autodetect        |
| `sub-delay` / `sub-fps`                     | float      | Subtitle timing           |
| `subsdec-encoding` / `subsdec-align`        | string/int | Subtitle decode           |
| `freetype-rel-fontsize`                     | int        | Relative font size        |
| `spu` / `no-spu`                            | bool       | Subpictures               |

### MPEG-TS

| Name                                                                     | Type    | Meaning           |
| ------------------------------------------------------------------------ | ------- | ----------------- |
| `program` / `programs`                                                   | int/csv | Program number(s) |
| `ts-es-id-pid`                                                           | bool    | ES id = PID       |
| `ts-out` / `ts-csa-*` / `ts-split-es` / `ts-seek-percent` / `ts-out-mtu` | various | TS tooling        |
| `sout-ts-pid-*` / `sout-ts-es-id-pid` / `sout-ts-dts-delay`              | various | TS stream output  |

### DVB / capture

| Name                                                                                    | Type    | Meaning                |
| --------------------------------------------------------------------------------------- | ------- | ---------------------- |
| `dvb-adapter` / `dvb-device` / `dvb-frequency` / `dvb-bandwidth`                        | int     | Tuner params           |
| `dvb-srate` / `dvb-voltage` / `dvb-satno` / `dvb-tone` / `dvb-fec`                      | int     | Satellite/cable tuning |
| `dvb-modulation` / `dvb-transmission` / `dvb-guard` / `dvb-hierarchy` / `dvb-inversion` | various | Signal params          |
| `dvb-probe` / `dvb-caching` / `dvb-high-voltage` / `dvb-budget-mode`                    | bool/ms | Card behaviour         |
| `dvb-lnb-lof1` / `dvb-lnb-lof2` / `dvb-lnb-slof`                                        | int     | LNB frequencies        |
| `dvb-code-rate-hp` / `dvb-code-rate-lp`                                                 | int     | Code rates             |
| `screen-fps` / `screen-caching` / `screen-left                                          | top     | width                  | height` | various | Desktop capture |
| `fake-file-reload`                                                                      | int     | fake:// reload         |

### Stream output (unsafe on untrusted playlists)

| Name                                                                | Type    | Meaning              |
| ------------------------------------------------------------------- | ------- | -------------------- |
| `sout`                                                              | string  | Stream output chain  |
| `sout-keep` / `sout-all` / `sout-audio` / `sout-video` / `sout-spu` | bool    | Sout routing         |
| `sout-transcode-*`                                                  | various | Transcode params     |
| `sout-standard-mux` / `sout-standard-access` / `sout-standard-dst`  | string  | Sout destination     |
| `sout-mux-caching` / `sout-udp-caching` / `sout-rtp-caching`        | ms      | Sout caches          |
| `sout-livehttp-caching`                                             | bool    | Live HTTP sout cache |

VLC historically gated `sout*` behind `--m3u-extvlcopt`; modern VLC parses them by default. GPIUX Streamer **stores** but does **not execute** sout options.

## GPIUX Streamer support

### Applied at playback (HTTP fetch)

| EXTVLCOPT                | Channel field / effect                |
| ------------------------ | ------------------------------------- |
| `http-user-agent`        | `userAgent` → `User-Agent` header     |
| `http-user` + `http-pwd` | `Authorization: Basic …` in `headers` |
| `http-referrer`          | `referrer` → `Referer` header         |

Aliases accepted when parsing: `user-agent`, `http-referer`, `referrer`.

Cookie forwarding for a stream origin is always enabled in `src/lib/http.ts` (per-origin jar). `http-forward-cookies` is stored only.

### Stored, not applied (yet)

All other catalog names are kept on `channel.vlcOptions` so imports stay faithful. Common IPTV values like `network-caching`, `http-caching`, and `program` are preserved for future player hooks.

### IPTV interop subset (industry)

Players outside VLC most often honor only:

```
http-user-agent
http-referrer
network-caching
http-caching
http-reconnect
program
```

## TOML mapping

TOML channels accept the same semantics three ways (first-class fields win over duplicate vlc keys):

```toml
[[channel]]
name = "Example"
url = "https://cdn.example.com/live/index.m3u8"
user_agent = "Mozilla/5.0"          # ⇐ #EXTVLCOPT:http-user-agent
referrer = "https://example.com/"   # ⇐ #EXTVLCOPT:http-referrer

# Inline VLC options (kebab-case keys)
[channel.vlc_options]
"http-user" = "user"
"http-pwd" = "secret"
program = "1025"

# Or raw M3U strings (round-trip fidelity)
extvlcopt = [
  "http-user-agent=Mozilla/5.0",
  "http-referrer=https://example.com/",
  "no-video",
]
```

Top-level `http_user` / `http_pwd` aliases are also accepted.

Pipe syntax on the URL line (`url|User-Agent="…"|Referer="…"`) remains supported. Pipe values **override** `#EXTVLCOPT` when both set the same field.

## Test vectors

```m3u
#EXTM3U
#EXTINF:-1,UA test
#EXTVLCOPT:http-user-agent=Mozilla/5.0
#EXTVLCOPT:http-referrer=https://example.com/page
https://cdn.example.com/live/index.m3u8
```

```m3u
#EXTINF:-1,After EXTINF
#EXTVLCOPT:http-user-agent=Custom/1.0
https://example.com/stream.m3u8
```

```m3u
#EXTINF:0,M6
#EXTVLCOPT:dvb-adapter=0
#EXTVLCOPT:dvb-frequency=490000000
#EXTVLCOPT:program=1025
dvb-t://
```

Invalid (do not parse):

```
#EXTVLCOPT--http-reconnect=true
#EXTVLCOPT rogram=17713
#EXTVLCOPT:
```

## Implementation files

| File                                                                | Role                                |
| ------------------------------------------------------------------- | ----------------------------------- |
| [`src/catalog/extvlcopt.ts`](../src/catalog/extvlcopt.ts)           | Catalog, parse, apply               |
| [`src/catalog/m3u.ts`](../src/catalog/m3u.ts)                       | `#EXTVLCOPT` in M3U/M3U8 IPTV lists |
| [`src/catalog/index.ts`](../src/catalog/index.ts)                   | TOML `vlc_options` / `extvlcopt`    |
| [`src/lib/http.ts`](../src/lib/http.ts)                             | Headers on fetch                    |
| [`src/catalog/extvlcopt.test.ts`](../src/catalog/extvlcopt.test.ts) | Unit tests                          |

For the literal full namespace on a given VLC build, run `vlc -H` / `vlc --longhelp --advanced`.
