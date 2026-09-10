import type { Channel } from "./channel";
import { applyExtVlcOpts, parseExtVlcOptLine, type ParsedExtVlcOpt } from "./extvlcopt";
import { usableIconSrc } from "../lib/icon";

function slug(value: string): string {
  const s = value
    .toLowerCase()
    .replace(/https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.slice(0, 48) || "channel";
}

function shortHash(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0;
  return Math.abs(hash).toString(36);
}

function parseAttributes(chunk: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([A-Za-z0-9-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s,]+))/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(chunk))) {
    attrs[match[1]!.toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attrs;
}

function looksLikeStreamUrl(value: string): boolean {
  return /^(https?|rtmp|rtsp):\/\//i.test(value);
}

function parsePipeHeaderValue(raw: string): string {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** Split `url|Referer="…"|User-Agent="…"` into the stream URL and HTTP headers. */
export function parseM3uStreamUrl(
  raw: string,
): Pick<Channel, "url" | "userAgent" | "referrer" | "headers"> {
  const trimmed = raw.trim();
  const pipe = trimmed.indexOf("|");
  if (pipe < 0) return { url: trimmed };

  const url = trimmed.slice(0, pipe).trim();
  const extras = trimmed.slice(pipe + 1).split("|");

  let userAgent: string | undefined;
  let referrer: string | undefined;
  const headers: Record<string, string> = {};

  for (const segment of extras) {
    const eq = segment.indexOf("=");
    if (eq <= 0) continue;
    const key = segment.slice(0, eq).trim();
    const value = parsePipeHeaderValue(segment.slice(eq + 1));
    const keyLower = key.toLowerCase();
    if (keyLower === "user-agent") userAgent = value;
    else if (keyLower === "referer" || keyLower === "referrer") referrer = value;
    else headers[key] = value;
  }

  return {
    url,
    userAgent,
    referrer,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  };
}

// HLS media/master manifests also carry #EXTINF (segment durations), so these
// markers are how a single stream is told apart from an IPTV channel list.
function isHlsManifest(head: string): boolean {
  return /#EXT-X-(TARGETDURATION|MEDIA-SEQUENCE|STREAM-INF|PLAYLIST-TYPE|ENDLIST|KEY|MAP|BYTERANGE)/i.test(
    head,
  );
}

/**
 * True for an IPTV-style channel list: an M3U carrying `#EXTINF` entries that is
 * not an HLS stream manifest. Deliberately lenient — `#EXTM3U` need not be the
 * very first bytes (leading comments/BOM are common) — so a real playlist is
 * never mistaken for a single stream and filed as a channel.
 */
function looksLikePlaylistText(text: string): boolean {
  const head = text.slice(0, 8000);
  return /#EXTM3U/i.test(head) && /#EXTINF/i.test(head) && !isHlsManifest(head);
}

export function isM3uPlaylistText(text: string): boolean {
  return looksLikePlaylistText(text);
}

/** First non-empty group when a player packs several into `group-title` with `;`. */
function primaryGroup(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const first = value.split(";")[0]?.trim();
  return first || undefined;
}

function truthy(value: string | undefined): boolean {
  if (value == null) return false;
  const v = value.trim().toLowerCase();
  return v === "" ? true : v === "1" || v === "true" || v === "yes";
}

export type M3uHeader = {
  epgUrl?: string;
  epgUrls?: string[];
  tvgShift?: string;
  catchup?: string;
  catchupSource?: string;
  catchupDays?: string;
};

/** Split comma-separated `x-tvg-url` / `url-tvg` header values into individual feed URLs. */
export function splitEpgUrls(header: string | undefined): string[] {
  if (!header?.trim()) return [];
  const urls: string[] = [];
  let current = "";
  let inQuote = false;
  for (let i = 0; i < header.length; i++) {
    const ch = header[i]!;
    if (ch === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (!inQuote && ch === ",") {
      const trimmed = current.trim();
      if (trimmed) urls.push(trimmed);
      current = "";
      continue;
    }
    current += ch;
  }
  const trimmed = current.trim();
  if (trimmed) urls.push(trimmed);
  return urls;
}

/** Parse the playlist-wide `#EXTM3U` header attributes (Kodi/TiviMate convention). */
export function parseM3uHeader(text: string): M3uHeader {
  const first = text.split(/\r?\n/).find((line) => /^\s*#EXTM3U/i.test(line));
  if (!first) return {};
  const attrs = parseAttributes(first.replace(/^\s*#EXTM3U/i, ""));
  const epgUrl = attrs["url-tvg"] || attrs["x-tvg-url"] || undefined;
  const epgUrls = splitEpgUrls(epgUrl);
  return {
    epgUrl,
    epgUrls: epgUrls.length ? epgUrls : undefined,
    tvgShift: attrs["tvg-shift"] || undefined,
    catchup: attrs["catchup"] || attrs["catchup-type"] || undefined,
    catchupSource: attrs["catchup-source"] || undefined,
    catchupDays: attrs["catchup-days"] || undefined,
  };
}

export function parseM3u(text: string, sourceFile: string): Channel[] {
  const lines = text.split(/\r?\n/);
  const header = parseM3uHeader(text);
  const channels: Channel[] = [];
  let pending: Omit<Channel, "url" | "id"> | null = null;
  let pendingId: string | undefined;
  let groupOverride: string | undefined;
  let pendingVlcOpts: ParsedExtVlcOpt[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith("#EXTM3U")) continue;

    if (/^#EXTGRP:/i.test(line)) {
      groupOverride = line.slice(line.indexOf(":") + 1).trim() || undefined;
      continue;
    }

    const vlcOpt = parseExtVlcOptLine(line);
    if (vlcOpt) {
      pendingVlcOpts.push(vlcOpt);
      continue;
    }

    if (/^#EXTINF:/i.test(line)) {
      const comma = line.lastIndexOf(",");
      const title = comma >= 0 ? line.slice(comma + 1).trim() : "";
      const meta = comma >= 0 ? line.slice(8, comma) : line.slice(8);
      const attrs = parseAttributes(meta);
      const name = title || attrs["tvg-name"] || "Channel";
      pendingId = attrs["tvg-id"] || undefined;
      pending = {
        name,
        group:
          primaryGroup(attrs["group-title"]) ?? groupOverride ?? primaryGroup(attrs["tvg-group"]),
        icon: usableIconSrc(attrs["tvg-logo"]),
        tvgId: attrs["tvg-id"] || undefined,
        tvgName: attrs["tvg-name"] || undefined,
        country: attrs["tvg-country"] || undefined,
        language: attrs["tvg-language"] || undefined,
        chno: attrs["tvg-chno"] || attrs["ch-number"] || undefined,
        tvgShift: attrs["tvg-shift"] || header.tvgShift,
        radio: truthy(attrs["radio"]) || undefined,
        catchup: attrs["catchup"] || attrs["catchup-type"] || header.catchup,
        catchupSource: attrs["catchup-source"] || header.catchupSource,
        catchupDays: attrs["catchup-days"] || attrs["catchup-back"] || header.catchupDays,
        timeshift: attrs["timeshift"] || undefined,
        epgUrl: header.epgUrl,
        sourceFile,
        sourceKind: "m3u",
        editable: false,
      };
      continue;
    }

    if (line.startsWith("#")) continue;
    if (!pending || !looksLikeStreamUrl(line)) continue;

    const stream = parseM3uStreamUrl(line);
    const id = pendingId || `${slug(pending.name)}-${shortHash(stream.url)}`;
    const channel: Channel = {
      ...pending,
      id,
      url: stream.url,
      userAgent: stream.userAgent,
      referrer: stream.referrer,
      headers: stream.headers,
    };
    applyExtVlcOpts(channel, pendingVlcOpts);
    if (stream.userAgent) channel.userAgent = stream.userAgent;
    if (stream.referrer) channel.referrer = stream.referrer;
    if (stream.headers) {
      channel.headers = { ...channel.headers, ...stream.headers };
    }
    channels.push(channel);
    pending = null;
    pendingId = undefined;
    pendingVlcOpts = [];
  }

  return channels;
}
