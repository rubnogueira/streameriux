export type Channel = {
  id: string;
  name: string;
  url: string;
  group?: string;
  icon?: string;
  tvgId?: string;
  tvgName?: string;
  country?: string;
  language?: string;
  chno?: string;
  userAgent?: string;
  referrer?: string;
  /** Extra HTTP headers from M3U pipe syntax (`url|Header="value"`) or EXTVLCOPT auth. */
  headers?: Record<string, string>;
  /** Parsed `#EXTVLCOPT` values not mapped to first-class fetch fields (preserved for fidelity). */
  vlcOptions?: Record<string, string | boolean>;
  // IPTV convention extras (see README). Captured for fidelity; players ignore
  // what they do not use. None are required and none are emitted when absent.
  tvgShift?: string;
  radio?: boolean;
  catchup?: string;
  catchupSource?: string;
  catchupDays?: string;
  timeshift?: string;
  epgUrl?: string;
  sourceFile: string;
  sourceKind: "toml" | "m3u";
  editable: boolean;
  /** Runtime flag layered on by the catalog from favorites.toml; never persisted here. */
  favorite?: boolean;
};

export type CatalogSource = {
  id: string;
  kind: "file" | "playlist";
  path: string;
  label: string;
  remote: boolean;
  /** Playlist-wide XMLTV EPG URL from an `#EXTM3U url-tvg=…` header, if any. */
  epgUrl?: string;
};
