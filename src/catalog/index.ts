import { existsSync, mkdirSync, readFileSync, watch } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { useCallback, useState } from "react";
import { useAsyncValue, useBootstrap } from "../lib/react-sync";
import { parse, stringify } from "smol-toml";
import type { CatalogSource, Channel } from "./channel";
import { usableIconSrc } from "../lib/icon";
import { applyExtVlcOpts, parseExtVlcOptList, parseExtVlcOptTable } from "./extvlcopt";
import { isM3uPlaylistText, parseM3u, parseM3uHeader } from "./m3u";

export type { CatalogSource, Channel };

export type Catalog = {
  channels: Channel[];
  sources: CatalogSource[];
  groups: string[];
  /** Names stored in groups.toml, including groups with no channels yet. */
  customGroupNames: string[];
  /** When false, playlist `group-title` values are ignored unless a channel has a custom assignment. */
  usePlaylistGroups: boolean;
  /** User-assigned groups for any channel URL (including playlist entries). */
  groupAssignments: Record<string, string>;
  hidden: string[];
  error: string | null;
  loading: boolean;
};

const SOURCES_NAME = "sources.toml";
const USER_NAME = "user.toml";
const HIDDEN_NAME = "hidden.toml";
const FAVORITES_NAME = "favorites.toml";
const GROUPS_NAME = "groups.toml";
/**
 * Per-user writable data directory, used when the app is packaged (a compiled
 * binary or `.app`) and there is no project `channels/` next to it. Launching a
 * bundle from Finder starts it with `cwd = /`, so we must never resolve data
 * paths relative to the working directory — that yields `/channels`, which
 * `mkdirSync` cannot create on the read-only root and crashes the app on mount.
 */
function userDataDir(): string {
  if (process.platform === "darwin")
    return join(homedir(), "Library", "Application Support", "streameriux");
  if (process.platform === "win32")
    return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "streameriux");
  return join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "streameriux");
}

export function appRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [process.cwd(), join(here, ".."), here];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, "channels"))) return candidate;
  }
  // No project checkout in reach (packaged app): fall back to a writable
  // location rather than the (possibly read-only) working directory.
  return userDataDir();
}

const CONFIG_NAME = "config.toml";

/**
 * App-level config that lives OUTSIDE the base folder (which it points at), at a
 * fixed per-user location — otherwise the setting that relocates the catalog
 * would live inside the folder being relocated.
 */
function configPath(): string {
  return join(userDataDir(), CONFIG_NAME);
}

// `undefined` = not read from disk yet; `null` = read, no custom folder set.
let baseFolderOverride: string | null | undefined;

/** Clears cached base-folder state (for isolated Vitest cases). */
export function resetCatalogConfigCache(): void {
  baseFolderOverride = undefined;
}

function loadBaseFolder(): string | null {
  if (baseFolderOverride !== undefined) return baseFolderOverride;
  baseFolderOverride = null;
  try {
    if (existsSync(configPath())) {
      const data = parse(readFileSync(configPath(), "utf8")) as Record<string, unknown>;
      const dir = typeof data.channels_dir === "string" ? data.channels_dir.trim() : "";
      if (dir) baseFolderOverride = dir;
    }
  } catch {
    baseFolderOverride = null;
  }
  return baseFolderOverride;
}

/** The user-chosen base folder, or `null` when the default location is in use. */
export function baseFolder(): string | null {
  return loadBaseFolder();
}

/**
 * Persist (or clear, with `null`) the base folder that channels/playlists are
 * read from. The `STREAMER_CHANNELS_DIR` env override still wins over it.
 */
export async function setBaseFolder(dir: string | null): Promise<void> {
  const trimmed = dir && dir.trim() ? dir.trim() : null;
  mkdirSync(userDataDir(), { recursive: true });
  let data: Record<string, unknown> = {};
  try {
    if (existsSync(configPath()))
      data = parse(readFileSync(configPath(), "utf8")) as Record<string, unknown>;
  } catch {
    data = {};
  }
  if (trimmed) {
    data.channels_dir = trimmed;
    mkdirSync(trimmed, { recursive: true });
  } else {
    delete data.channels_dir;
  }
  await writeFile(configPath(), stringify(data) + "\n", "utf8");
  baseFolderOverride = trimmed;
}

export function channelsDir(): string {
  const override = process.env.STREAMER_CHANNELS_DIR;
  if (override && override.trim()) return override;
  const configured = loadBaseFolder();
  if (configured) return configured;
  return join(appRoot(), "channels");
}

function sourcesPath(): string {
  return join(channelsDir(), SOURCES_NAME);
}

function userPath(): string {
  return join(channelsDir(), USER_NAME);
}

function hiddenPath(): string {
  return join(channelsDir(), HIDDEN_NAME);
}

function favoritesPath(): string {
  return join(channelsDir(), FAVORITES_NAME);
}

function cacheDir(): string {
  return join(channelsDir(), "cache");
}

function slug(value: string): string {
  const s = value
    .toLowerCase()
    .replace(/https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.slice(0, 64) || "channel";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function looksLikeUrl(value: string): boolean {
  return (
    /^(https?|rtmp|rtsp):\/\//i.test(value) ||
    value.endsWith(".m3u8") ||
    value.endsWith(".m3u") ||
    value.endsWith(".mpd")
  );
}

function looksLikeRemote(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.startsWith("data:");
}

function hostLabel(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return basename(value);
  }
}

/** Path component (query stripped) so `…/playlist.m3u8?token=x` still detects. */
function refPath(value: string): string {
  try {
    return new URL(value).pathname.toLowerCase();
  } catch {
    return value.toLowerCase().split("?")[0] ?? value.toLowerCase();
  }
}

/**
 * A human name for a bare stream URL: the file stem (`…/tvi.m3u8` → "TVI"),
 * falling back to the host when the stem is a generic HLS filename. A meaningful
 * name is also what EPG matches on when the stream carries no `tvg-id`.
 */
function streamNameFromUrl(value: string): string {
  const url = value.startsWith("http") ? value : `https://${value}`;
  let host = "Channel";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    // keep default
  }
  try {
    const stem = basename(new URL(url).pathname).replace(/\.[a-z0-9]+$/i, "");
    const clean = decodeURIComponent(stem).replace(/[_-]+/g, " ").trim();
    const generic = /^(playlist|index|master|chunks|stream|live|manifest|hls|mono|out|prog)$/i;
    if (clean && !generic.test(clean)) return clean.length <= 4 ? clean.toUpperCase() : clean;
  } catch {
    // fall through to host
  }
  return host;
}

export function looksLikePlaylistRef(value: string): boolean {
  const path = refPath(value);
  if (path.endsWith(".m3u") || path.endsWith(".m3u8") || path.endsWith(".toml")) return true;
  const lower = value.toLowerCase();
  // Xtream/OTT panels serve playlists from query strings, not file extensions.
  return lower.includes("playlist.m3u") || /[?&](type|output)=m3u/.test(lower);
}

/** GitHub "blob" pages are HTML; raw.githubusercontent.com serves the file bytes. */
export function normalizeRemotePlaylistRef(value: string): string {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");
    if (host !== "github.com") return value;
    const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.*)$/);
    if (!match) return value;
    const [, owner, repo, branch, filePath] = match;
    if (!filePath) return value;
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
  } catch {
    return value;
  }
}

export type AddCatalogSourceOptions = {
  /** When `playlist`, never store the URL as a single channel in user.toml. */
  intent?: "auto" | "playlist";
};

export function resolveIconPath(raw: string, sourceFile: string): string | undefined {
  const value = raw.trim();
  if (!value) return undefined;
  if (looksLikeRemote(value)) return value;
  const candidates = [
    isAbsolute(value) ? value : resolve(dirname(sourceFile), value),
    resolve(channelsDir(), value),
    resolve(appRoot(), value),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function optional(
  channel: Channel,
  key: keyof Channel,
  rec: Record<string, unknown>,
  ...aliases: string[]
): void {
  for (const alias of aliases) {
    const value = asString(rec[alias]);
    if (value) {
      (channel as Record<string, unknown>)[key] = value;
      return;
    }
  }
}

function tomlHeaderKey(key: string): string {
  return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(key) ? key : JSON.stringify(key);
}

function normalizeTomlHeaderKey(key: string): string {
  const lower = key.toLowerCase().replace(/_/g, "-");
  if (lower === "user-agent") return "User-Agent";
  if (lower === "referer" || lower === "referrer") return "Referer";
  if (lower === "origin") return "Origin";
  return key;
}

/** Read `[channel.headers]` / inline `headers = { … }` and top-level `origin`. */
function applyTomlHeaders(channel: Channel, rec: Record<string, unknown>): void {
  const extra: Record<string, string> = { ...channel.headers };
  const table = asRecord(rec.headers);

  if (table) {
    for (const [key, value] of Object.entries(table)) {
      const str = asString(value);
      if (!str) continue;
      const normalized = normalizeTomlHeaderKey(key);
      if (normalized === "User-Agent") {
        if (!channel.userAgent) channel.userAgent = str;
        continue;
      }
      if (normalized === "Referer") {
        if (!channel.referrer) channel.referrer = str;
        continue;
      }
      extra[normalized] = str;
    }
  }

  const origin = asString(rec.origin);
  if (origin) extra.Origin = origin;

  channel.headers = Object.keys(extra).length > 0 ? extra : undefined;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
  );
}

/** Read `extvlcopt`, `[channel.vlc_options]`, and `vlc_options = { … }`. */
function applyTomlExtVlcOpts(channel: Channel, rec: Record<string, unknown>): void {
  const parsed = [
    ...parseExtVlcOptList(asStringList(rec.extvlcopt)),
    ...parseExtVlcOptList(asStringList(rec.ext_vlcopt)),
    ...parseExtVlcOptTable(asRecord(rec.vlc_options) ?? {}),
    ...parseExtVlcOptTable(asRecord(rec.vlcopts) ?? {}),
  ];
  if (parsed.length === 0) return;
  applyExtVlcOpts(channel, parsed);
}

export function channelFromUnknown(
  value: unknown,
  fallbackId: string,
  sourceFile: string,
  editable: boolean,
): Channel | null {
  if (typeof value === "string" && looksLikeUrl(value)) {
    return {
      id: slug(fallbackId),
      name: fallbackId,
      url: value.trim(),
      sourceFile,
      sourceKind: "toml",
      editable,
    };
  }

  const rec = asRecord(value);
  if (!rec) return null;
  if (rec.enabled === false) return null;

  const url = asString(rec.url) ?? asString(rec.uri) ?? asString(rec.stream);
  if (!url) return null;

  const name =
    asString(rec.name) ??
    asString(rec.title) ??
    asString(rec["tvg-name"]) ??
    asString(rec.tvg_name) ??
    fallbackId;
  const id =
    asString(rec.id) ?? asString(rec["tvg-id"]) ?? asString(rec.tvg_id) ?? slug(fallbackId);
  const channel: Channel = {
    id,
    name,
    url,
    sourceFile,
    sourceKind: "toml",
    editable,
  };
  optional(
    channel,
    "group",
    rec,
    "group-title",
    "group_title",
    "group",
    "tvg-group",
    "tvg_group",
    "category",
  );
  optional(channel, "tvgId", rec, "tvg-id", "tvg_id");
  optional(channel, "tvgName", rec, "tvg-name", "tvg_name");
  optional(channel, "country", rec, "tvg-country", "tvg_country", "country");
  optional(channel, "language", rec, "tvg-language", "tvg_language", "language");
  optional(channel, "chno", rec, "tvg-chno", "tvg_chno", "chno", "ch-number", "ch_number");
  optional(
    channel,
    "userAgent",
    rec,
    "user_agent",
    "user-agent",
    "http_user_agent",
    "http-user-agent",
  );
  optional(
    channel,
    "referrer",
    rec,
    "referrer",
    "referer",
    "http_referrer",
    "http_referer",
    "http-referrer",
  );
  applyTomlHeaders(channel, rec);
  applyTomlExtVlcOpts(channel, rec);
  optional(channel, "tvgShift", rec, "tvg-shift", "tvg_shift");
  optional(channel, "catchup", rec, "catchup", "catchup-type", "catchup_type");
  optional(channel, "catchupSource", rec, "catchup-source", "catchup_source");
  optional(
    channel,
    "catchupDays",
    rec,
    "catchup-days",
    "catchup_days",
    "catchup-back",
    "catchup_back",
  );
  optional(channel, "timeshift", rec, "timeshift");
  if (rec.radio === true || asString(rec.radio) === "true" || asString(rec.radio) === "1")
    channel.radio = true;
  const iconRaw =
    asString(rec.icon) ?? asString(rec.logo) ?? asString(rec.tvg_logo) ?? asString(rec["tvg-logo"]);
  if (iconRaw) {
    const icon = usableIconSrc(
      resolveIconPath(iconRaw, sourceFile) ?? (looksLikeRemote(iconRaw) ? iconRaw : undefined),
    );
    if (icon) channel.icon = icon;
  }
  return channel;
}

export function parseChannelToml(text: string, sourceFile: string, editable = false): Channel[] {
  const data = parse(text) as Record<string, unknown>;
  const found: Channel[] = [];

  const lists = [data.channel, data.channels, data.streams];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const [index, entry] of list.entries()) {
      const rec = asRecord(entry);
      const fallback =
        asString(rec?.id) ?? asString(rec?.name) ?? asString(rec?.title) ?? `channel-${index + 1}`;
      const channel = channelFromUnknown(entry, fallback, sourceFile, editable);
      if (channel) found.push(channel);
    }
  }

  for (const key of ["channels", "streams", "channel"] as const) {
    const rec = asRecord(data[key]);
    if (!rec) continue;
    for (const [id, value] of Object.entries(rec)) {
      const channel = channelFromUnknown(value, id, sourceFile, editable);
      if (channel) found.push(channel);
    }
  }

  return dedupeChannels(found);
}

function dedupeChannels(found: Channel[]): Channel[] {
  const seen = new Set<string>();
  const unique: Channel[] = [];
  for (const channel of found) {
    if (seen.has(channel.url)) continue;
    seen.add(channel.url);
    unique.push(channel);
  }
  return unique;
}

type SourceList = { files: string[]; playlists: string[] };

async function readSourceList(): Promise<SourceList> {
  const dir = channelsDir();
  mkdirSync(dir, { recursive: true });
  const files: string[] = [];
  const playlists: string[] = [];

  if (existsSync(sourcesPath())) {
    const text = await readFile(sourcesPath(), "utf8");
    const data = parse(text) as Record<string, unknown>;
    if (Array.isArray(data.files)) {
      for (const entry of data.files) {
        if (typeof entry === "string" && entry.trim()) files.push(entry.trim());
      }
    }
    if (Array.isArray(data.playlists)) {
      for (const entry of data.playlists) {
        if (typeof entry === "string" && entry.trim()) playlists.push(entry.trim());
      }
    }
  }

  // The app ships with no channels. Only user.toml is guaranteed so additions
  // from the app have somewhere to land; everything else is opt-in via Settings.
  if (!files.includes(USER_NAME)) files.push(USER_NAME);

  return { files, playlists };
}

async function writeSourceList(list: SourceList): Promise<void> {
  await writeFile(
    sourcesPath(),
    stringify({
      files: list.files,
      playlists: list.playlists,
    }) + "\n",
    "utf8",
  );
}

function resolveListed(listed: string): string {
  return isAbsolute(listed) || looksLikeRemote(listed) ? listed : resolve(channelsDir(), listed);
}

function toStoredPath(filePath: string): string {
  if (looksLikeRemote(filePath)) return filePath;
  const dir = channelsDir();
  const abs = resolve(filePath);
  const rel = relative(dir, abs);
  if (!rel.startsWith("..") && !isAbsolute(rel)) return rel;
  return abs;
}

async function readHidden(): Promise<string[]> {
  if (!existsSync(hiddenPath())) return [];
  const data = parse(await readFile(hiddenPath(), "utf8")) as Record<string, unknown>;
  return Array.isArray(data.urls)
    ? data.urls.filter((value): value is string => typeof value === "string")
    : [];
}

async function writeHidden(urls: string[]): Promise<void> {
  await writeFile(hiddenPath(), stringify({ urls }) + "\n", "utf8");
}

async function readFavorites(): Promise<string[]> {
  if (!existsSync(favoritesPath())) return [];
  try {
    const data = parse(await readFile(favoritesPath(), "utf8")) as Record<string, unknown>;
    return Array.isArray(data.urls)
      ? data.urls.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

async function writeFavorites(urls: string[]): Promise<void> {
  await writeFile(favoritesPath(), stringify({ urls: [...new Set(urls)] }) + "\n", "utf8");
}

export async function toggleFavorite(channel: Channel): Promise<void> {
  const current = await readFavorites();
  const next = current.includes(channel.url)
    ? current.filter((url) => url !== channel.url)
    : [...current, channel.url];
  await writeFavorites(next);
}

function groupsFilePath(): string {
  return join(channelsDir(), GROUPS_NAME);
}

type GroupsConfig = {
  names: string[];
  usePlaylistGroups: boolean;
  assignments: Record<string, string>;
};

async function readGroupsConfig(): Promise<GroupsConfig> {
  if (!existsSync(groupsFilePath())) {
    return { names: [], usePlaylistGroups: true, assignments: {} };
  }
  try {
    const data = parse(await readFile(groupsFilePath(), "utf8")) as Record<string, unknown>;
    const names = Array.isArray(data.names)
      ? data.names.filter((value): value is string => typeof value === "string")
      : [];
    const usePlaylistGroups = data.use_playlist_groups !== false;
    const assignments: Record<string, string> = {};
    const raw = asRecord(data.assignments);
    if (raw) {
      for (const [url, group] of Object.entries(raw)) {
        const value = asString(group);
        if (value) assignments[url] = value;
      }
    }
    return { names, usePlaylistGroups, assignments };
  } catch {
    return { names: [], usePlaylistGroups: true, assignments: {} };
  }
}

async function writeGroupsConfig(config: GroupsConfig): Promise<void> {
  mkdirSync(channelsDir(), { recursive: true });
  const names = [...new Set(config.names.map((name) => name.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
  const body: Record<string, unknown> = {
    names,
    use_playlist_groups: config.usePlaylistGroups,
  };
  if (Object.keys(config.assignments).length) body.assignments = config.assignments;
  await writeFile(groupsFilePath(), stringify(body) + "\n", "utf8");
}

export async function setUsePlaylistGroups(enabled: boolean): Promise<void> {
  const config = await readGroupsConfig();
  await writeGroupsConfig({ ...config, usePlaylistGroups: enabled });
}

export async function assignChannelGroup(url: string, group: string | null): Promise<void> {
  const trimmed = url.trim();
  if (!trimmed) throw new Error("Channel URL is required");
  const config = await readGroupsConfig();
  const assignments = { ...config.assignments };
  const next = group?.trim();
  if (next) assignments[trimmed] = next;
  else delete assignments[trimmed];
  await writeGroupsConfig({ ...config, assignments });
}

function cachePathFor(url: string): string {
  const name = slug(url).slice(0, 80) || "playlist";
  return join(cacheDir(), `${name}.m3u8`);
}

async function fetchRemote(ref: string, cache: string): Promise<string> {
  const response = await fetch(ref, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: "*/*",
      "Accept-Encoding": "identity",
    },
  });
  if (!response.ok) throw new Error(`${response.status} fetching ${ref}`);
  const text = await response.text();
  mkdirSync(cacheDir(), { recursive: true });
  await writeFile(cache, text, "utf8");
  return text;
}

async function loadTextSource(ref: string, fresh = false): Promise<string> {
  if (!looksLikeRemote(ref)) return await readFile(ref, "utf8");
  const cache = cachePathFor(ref);
  if (!fresh && existsSync(cache)) return await readFile(cache, "utf8");
  try {
    return await fetchRemote(ref, cache);
  } catch (error) {
    if (existsSync(cache)) return await readFile(cache, "utf8");
    throw error;
  }
}

export const NO_GROUP = "No group";

export function groupKey(channel: Channel): string {
  return channel.group?.trim() || NO_GROUP;
}

/** Resolved group for sidebar/settings, honoring assignments and the playlist-groups toggle. */
export function resolveGroup(
  channel: Channel,
  usePlaylistGroups: boolean,
  assignments: Record<string, string>,
): string | undefined {
  const assigned = assignments[channel.url];
  if (assigned !== undefined) return assigned || undefined;
  if (!channel.editable && !usePlaylistGroups) return undefined;
  return channel.group;
}

export function resolveGroupKey(
  channel: Channel,
  usePlaylistGroups: boolean,
  assignments: Record<string, string>,
): string {
  return resolveGroup(channel, usePlaylistGroups, assignments)?.trim() || NO_GROUP;
}

export function orderedGroupNames(
  channels: Channel[],
  usePlaylistGroups: boolean,
  assignments: Record<string, string>,
  customNames: string[] = [],
): string[] {
  const set = new Set(
    channels.map((channel) => resolveGroupKey(channel, usePlaylistGroups, assignments)),
  );
  for (const name of customNames) {
    const trimmed = name.trim();
    if (trimmed) set.add(trimmed);
  }
  const named = [...set].filter((name) => name !== NO_GROUP).sort((a, b) => a.localeCompare(b));
  if (set.has(NO_GROUP)) named.push(NO_GROUP);
  return named;
}

export async function addCustomGroup(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Group name is required");
  const config = await readGroupsConfig();
  if (config.names.includes(trimmed)) return;
  await writeGroupsConfig({ ...config, names: [...config.names, trimmed] });
}

export async function removeCustomGroup(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  const config = await readGroupsConfig();
  await writeGroupsConfig({ ...config, names: config.names.filter((entry) => entry !== trimmed) });
}

function parseAny(text: string, sourceFile: string, editable: boolean): Channel[] {
  if (
    isM3uPlaylistText(text) ||
    sourceFile.toLowerCase().endsWith(".m3u") ||
    sourceFile.toLowerCase().endsWith(".m3u8")
  ) {
    return parseM3u(text, sourceFile).map((channel) => ({ ...channel, editable }));
  }
  return parseChannelToml(text, sourceFile, editable);
}

export async function loadCatalog(options: { fresh?: boolean } = {}): Promise<Catalog> {
  const listed = await readSourceList();
  const hidden = new Set(await readHidden());
  const favorites = new Set(await readFavorites());
  const groupsConfig = await readGroupsConfig();
  const usePlaylistGroups = groupsConfig.usePlaylistGroups;
  const groupAssignments = groupsConfig.assignments;
  const sources: CatalogSource[] = [];
  const collected: Channel[] = [];
  const errors: string[] = [];

  for (const entry of listed.playlists) {
    const path = resolveListed(entry);
    const source: CatalogSource = {
      id: `playlist:${entry}`,
      kind: "playlist",
      path,
      label: looksLikeRemote(entry) ? hostLabel(entry) : basename(entry),
      remote: looksLikeRemote(entry),
    };
    sources.push(source);
    if (looksLikeRemote(entry) && process.env.VITEST) continue;
    try {
      const text = await loadTextSource(path, options.fresh === true);
      source.epgUrl = parseM3uHeader(text).epgUrl;
      collected.push(...parseAny(text, path, false));
    } catch (error) {
      errors.push(`${basename(entry)}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const entry of listed.files) {
    const path = resolveListed(entry);
    const editable = basename(path) === USER_NAME;
    sources.push({
      id: `file:${entry}`,
      kind: "file",
      path,
      label: basename(path),
      remote: false,
    });
    if (!existsSync(path)) {
      if (!editable) errors.push(`Missing ${basename(path)}`);
      continue;
    }
    try {
      const text = await readFile(path, "utf8");
      collected.push(...parseAny(text, path, editable));
    } catch (error) {
      errors.push(`${basename(path)}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const byUrl = new Map<string, Channel>();
  for (const channel of collected) {
    if (hidden.has(channel.url)) continue;
    const previous = byUrl.get(channel.url);
    if (!previous || channel.editable) byUrl.set(channel.url, channel);
  }
  const channels = [...byUrl.values()].map((channel) =>
    favorites.has(channel.url) ? { ...channel, favorite: true } : channel,
  );
  const groups = orderedGroupNames(
    channels,
    usePlaylistGroups,
    groupAssignments,
    groupsConfig.names,
  );

  return {
    channels,
    sources,
    groups,
    customGroupNames: groupsConfig.names,
    usePlaylistGroups,
    groupAssignments,
    hidden: [...hidden],
    error: errors.length ? errors.join("\n") : null,
    loading: false,
  };
}

function channelToToml(channel: Channel): string {
  const lines = [
    "[[channel]]",
    `id = ${tomlString(channel.id)}`,
    `name = ${tomlString(channel.name)}`,
    `url = ${tomlString(channel.url)}`,
  ];
  if (channel.group) lines.push(`group-title = ${tomlString(channel.group)}`);
  if (channel.icon) lines.push(`tvg-logo = ${tomlString(channel.icon)}`);
  if (channel.tvgId) lines.push(`tvg-id = ${tomlString(channel.tvgId)}`);
  if (channel.tvgName) lines.push(`tvg-name = ${tomlString(channel.tvgName)}`);
  if (channel.country) lines.push(`tvg-country = ${tomlString(channel.country)}`);
  if (channel.language) lines.push(`tvg-language = ${tomlString(channel.language)}`);
  if (channel.chno) lines.push(`tvg-chno = ${tomlString(channel.chno)}`);
  if (channel.userAgent) lines.push(`user_agent = ${tomlString(channel.userAgent)}`);
  if (channel.referrer) lines.push(`referrer = ${tomlString(channel.referrer)}`);
  if (channel.headers && Object.keys(channel.headers).length > 0) {
    lines.push("");
    lines.push("[channel.headers]");
    for (const [key, value] of Object.entries(channel.headers)) {
      if (key === "Authorization") continue;
      lines.push(`${tomlHeaderKey(key)} = ${tomlString(value)}`);
    }
  }
  if (channel.vlcOptions && Object.keys(channel.vlcOptions).length > 0) {
    lines.push("");
    lines.push("[channel.vlc_options]");
    for (const [key, value] of Object.entries(channel.vlcOptions)) {
      if (typeof value === "boolean") lines.push(`${tomlHeaderKey(key)} = ${value}`);
      else lines.push(`${tomlHeaderKey(key)} = ${tomlString(value)}`);
    }
  }
  if (channel.tvgShift) lines.push(`tvg-shift = ${tomlString(channel.tvgShift)}`);
  if (channel.radio) lines.push(`radio = true`);
  if (channel.catchup) lines.push(`catchup = ${tomlString(channel.catchup)}`);
  if (channel.catchupSource) lines.push(`catchup-source = ${tomlString(channel.catchupSource)}`);
  if (channel.catchupDays) lines.push(`catchup-days = ${tomlString(channel.catchupDays)}`);
  return lines.join("\n");
}

async function readUserChannels(): Promise<Channel[]> {
  if (!existsSync(userPath())) return [];
  return parseChannelToml(await readFile(userPath(), "utf8"), userPath(), true);
}

async function writeUserChannels(channels: Channel[]): Promise<void> {
  const body =
    "# Channels you add or edit in Settings.\n\n" +
    channels
      .map((channel) =>
        channelToToml({ ...channel, sourceFile: userPath(), sourceKind: "toml", editable: true }),
      )
      .join("\n\n") +
    "\n";
  await writeFile(userPath(), body, "utf8");
}

async function appendSource(kind: "files" | "playlists", stored: string): Promise<void> {
  const list = await readSourceList();
  const bucket = list[kind];
  if (!bucket.includes(stored)) {
    bucket.push(stored);
    await writeSourceList(list);
  }
}

export async function addCatalogSource(
  ref: string,
  options: AddCatalogSourceOptions = {},
): Promise<{ kind: "playlist" | "channel"; count: number }> {
  const intent = options.intent ?? "auto";
  let trimmed = ref.trim();
  if (!trimmed) throw new Error("A URL or file path is required");
  if (looksLikeRemote(trimmed)) trimmed = normalizeRemotePlaylistRef(trimmed);

  // A local file on disk: add it to the source list by kind.
  if (!looksLikeRemote(trimmed) && existsSync(resolveListed(trimmed))) {
    const path = resolveListed(trimmed);
    const stored = toStoredPath(path);
    const text = await readFile(path, "utf8");
    const lower = path.toLowerCase();
    if (isM3uPlaylistText(text) || lower.endsWith(".m3u") || lower.endsWith(".m3u8")) {
      await appendSource("playlists", stored);
      return { kind: "playlist", count: parseM3u(text, path).length };
    }
    if (lower.endsWith(".toml")) {
      await appendSource("files", stored);
      return { kind: "playlist", count: parseChannelToml(text, path).length };
    }
  }

  // A remote list: fetch once, decide by content. `looksLikePlaylistRef` covers
  // `.m3u/.m3u8/.toml` paths (query string ignored) and Xtream/panel URLs; the
  // content check then tells an IPTV channel list apart from a single HLS stream
  // (which carries #EXT-X- markers) so only the latter falls through to a channel.
  if (looksLikeRemote(trimmed) && looksLikePlaylistRef(trimmed)) {
    const text = await loadTextSource(trimmed, true);
    if (refPath(trimmed).endsWith(".toml")) {
      await appendSource("files", trimmed);
      return { kind: "playlist", count: parseChannelToml(text, trimmed).length };
    }
    if (isM3uPlaylistText(text)) {
      await appendSource("playlists", trimmed);
      return { kind: "playlist", count: parseM3u(text, trimmed).length };
    }
    if (intent === "playlist") {
      throw new Error(
        "Could not load a channel playlist from that URL. Use a direct link to the .m3u file (not a GitHub page).",
      );
    }
    // Not an IPTV playlist (a bare HLS stream, say) — treat as a single stream below.
  }

  if (intent === "playlist") {
    throw new Error("Enter a playlist URL (.m3u / .m3u8 / .toml) or IPTV panel URL");
  }

  if (!looksLikeUrl(trimmed)) throw new Error("Enter a stream URL, or an .m3u8 / .toml playlist");
  await upsertUserChannel({
    id: slug(trimmed),
    name: streamNameFromUrl(trimmed),
    url: trimmed,
    sourceFile: userPath(),
    sourceKind: "toml",
    editable: true,
  });
  return { kind: "channel", count: 1 };
}

export async function removeCatalogSource(ref: string): Promise<void> {
  const list = await readSourceList();
  list.files = list.files.filter(
    (entry) => resolveListed(entry) !== resolveListed(ref) && entry !== ref,
  );
  list.playlists = list.playlists.filter(
    (entry) => entry !== ref && resolveListed(entry) !== resolveListed(ref),
  );
  await writeSourceList(list);
}

export async function upsertUserChannel(
  input: Partial<Channel> & { name: string; url: string },
): Promise<Channel> {
  const trimmedName = input.name.trim();
  const trimmedUrl = input.url.trim();
  if (!trimmedName) throw new Error("Channel name is required");
  if (!looksLikeUrl(trimmedUrl)) throw new Error("URL must be http(s) or an .m3u8 playlist");

  const channels = await readUserChannels();
  const next: Channel = {
    id: input.id?.trim() || slug(trimmedName),
    name: trimmedName,
    url: trimmedUrl,
    group: input.group?.trim() || undefined,
    icon: input.icon?.trim() || undefined,
    tvgId: input.tvgId?.trim() || undefined,
    tvgName: input.tvgName?.trim() || undefined,
    country: input.country?.trim() || undefined,
    language: input.language?.trim() || undefined,
    chno: input.chno?.trim() || undefined,
    userAgent: input.userAgent?.trim() || undefined,
    referrer: input.referrer?.trim() || undefined,
    headers:
      input.headers && Object.keys(input.headers).length > 0
        ? Object.fromEntries(
            Object.entries(input.headers)
              .map(([key, value]) => [key, value.trim()] as const)
              .filter(([, value]) => value),
          )
        : undefined,
    sourceFile: userPath(),
    sourceKind: "toml",
    editable: true,
  };
  const index = channels.findIndex(
    (channel) => channel.url === trimmedUrl || channel.id === next.id,
  );
  if (index >= 0) channels[index] = next;
  else channels.push(next);
  await writeUserChannels(channels);

  const hidden = (await readHidden()).filter((url) => url !== trimmedUrl);
  await writeHidden(hidden);
  return next;
}

export async function removeChannel(channel: Channel): Promise<void> {
  if (channel.editable) {
    const channels = (await readUserChannels()).filter(
      (entry) => entry.url !== channel.url && entry.id !== channel.id,
    );
    await writeUserChannels(channels);
    return;
  }
  const hidden = await readHidden();
  if (!hidden.includes(channel.url)) hidden.push(channel.url);
  await writeHidden(hidden);
}

const EMPTY_LOADING_CATALOG: Catalog = {
  channels: [],
  sources: [],
  groups: [],
  customGroupNames: [],
  usePlaylistGroups: true,
  groupAssignments: {},
  hidden: [],
  error: null,
  loading: true,
};

export function useCatalog(): Catalog & {
  customGroupNames: string[];
  reload: () => Promise<void>;
  refresh: () => Promise<void>;
  addLink: (
    ref: string,
    options?: AddCatalogSourceOptions,
  ) => Promise<{ kind: "playlist" | "channel"; count: number }>;
  saveChannel: (channel: Partial<Channel> & { name: string; url: string }) => Promise<void>;
  deleteChannel: (channel: Channel) => Promise<void>;
  deleteSource: (ref: string) => Promise<void>;
  toggleFavorite: (channel: Channel) => Promise<void>;
  setUsePlaylistGroups: (enabled: boolean) => Promise<void>;
  assignChannelGroup: (channel: Channel, group: string | null) => Promise<void>;
  addCustomGroup: (name: string) => Promise<void>;
  removeCustomGroup: (name: string) => Promise<void>;
  /** User-chosen base folder, or `null` when the default location is used. */
  baseFolder: string | null;
  /** The folder channels/playlists are actually read from right now. */
  resolvedBaseFolder: string;
  setBaseFolder: (dir: string | null) => Promise<void>;
} {
  const currentDir = channelsDir();
  const diskCatalog = useAsyncValue(
    currentDir,
    async () => {
      mkdirSync(currentDir, { recursive: true });
      return await loadCatalog();
    },
    undefined,
  );

  const [localCatalog, setLocalCatalog] = useState<Catalog | null>(null);
  const [localDir, setLocalDir] = useState(currentDir);
  if (localDir !== currentDir) {
    setLocalDir(currentDir);
    setLocalCatalog(null);
  }

  const catalog = localCatalog ?? diskCatalog ?? EMPTY_LOADING_CATALOG;

  const reload = useCallback(async () => {
    setLocalCatalog(await loadCatalog());
  }, []);

  const refresh = useCallback(async () => {
    setLocalCatalog((current) => ({
      ...(current ?? diskCatalog ?? EMPTY_LOADING_CATALOG),
      loading: true,
    }));
    setLocalCatalog(await loadCatalog({ fresh: true }));
  }, [diskCatalog]);

  useBootstrap(() => {
    const dir = channelsDir();
    mkdirSync(dir, { recursive: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const watcher = watch(dir, { persistent: false }, (_event, filename) => {
      const name = filename?.toString() ?? "";
      // App-managed state files reload the catalog themselves; ignore their
      // writes so a favorite/hide toggle does not trigger a second reload.
      if (
        name.includes("cache") ||
        name === HIDDEN_NAME ||
        name === FAVORITES_NAME ||
        name === GROUPS_NAME ||
        name === "epg.toml" ||
        name === "settings.toml"
      )
        return;
      clearTimeout(timer);
      timer = setTimeout(() => void reload(), 400);
    });
    return () => {
      clearTimeout(timer);
      watcher.close();
    };
  }, currentDir);

  // Re-home the catalog when the user picks a different base folder. The bootstrap
  // above re-subscribes its watcher because `currentDir` (its snapshot) changes.
  const changeBaseFolder = useCallback(
    async (dir: string | null) => {
      await setBaseFolder(dir);
      await reload();
    },
    [reload],
  );

  const addLink = useCallback(
    async (ref: string, options?: AddCatalogSourceOptions) => {
      const result = await addCatalogSource(ref, options);
      await reload();
      return result;
    },
    [reload],
  );

  const saveChannel = useCallback(
    async (channel: Partial<Channel> & { name: string; url: string }) => {
      await upsertUserChannel(channel);
      await reload();
    },
    [reload],
  );

  const deleteChannel = useCallback(
    async (channel: Channel) => {
      await removeChannel(channel);
      await reload();
    },
    [reload],
  );

  const deleteSource = useCallback(
    async (ref: string) => {
      await removeCatalogSource(ref);
      await reload();
    },
    [reload],
  );

  const favorite = useCallback(
    async (channel: Channel) => {
      await toggleFavorite(channel);
      await reload();
    },
    [reload],
  );

  const setPlaylistGroups = useCallback(
    async (enabled: boolean) => {
      await setUsePlaylistGroups(enabled);
      await reload();
    },
    [reload],
  );

  const assignGroup = useCallback(
    async (channel: Channel, group: string | null) => {
      await assignChannelGroup(channel.url, group);
      await reload();
    },
    [reload],
  );

  const addGroup = useCallback(
    async (name: string) => {
      await addCustomGroup(name);
      await reload();
    },
    [reload],
  );

  const removeGroup = useCallback(
    async (name: string) => {
      await removeCustomGroup(name);
      await reload();
    },
    [reload],
  );

  return {
    ...catalog,
    reload,
    refresh,
    addLink,
    saveChannel,
    deleteChannel,
    deleteSource,
    toggleFavorite: favorite,
    setUsePlaylistGroups: setPlaylistGroups,
    assignChannelGroup: assignGroup,
    addCustomGroup: addGroup,
    removeCustomGroup: removeGroup,
    baseFolder: baseFolder(),
    resolvedBaseFolder: currentDir,
    setBaseFolder: changeBaseFolder,
  };
}
