import type { Channel } from "../catalog/channel";
import { expandTvgCountry } from "../geo/countries";

/** Split comma-separated `x-tvg-url` header values into individual feed URLs. */
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

const ALL_SOURCES_RE = /ALL_SOURCES/i;

/** True when a feed URL is the huge aggregated "all sources" dump. */
export function isAllSourcesFeed(url: string): boolean {
  return ALL_SOURCES_RE.test(url);
}

function countryTokens(code: string): string[] {
  const upper = code.trim().toUpperCase();
  if (!upper) return [];
  return [upper, upper.replace(/[^A-Z0-9]/g, "")];
}

/** Match regional EPG feeds for the given ISO country codes. Never includes ALL_SOURCES. */
export function feedsForCountries(urls: string[], countryCodes: Set<string>): string[] {
  if (countryCodes.size === 0) return [];
  const tokens = new Set<string>();
  for (const code of countryCodes) {
    for (const token of countryTokens(code)) tokens.add(token);
  }
  const matched: string[] = [];
  for (const url of urls) {
    if (isAllSourcesFeed(url)) continue;
    const upper = url.toUpperCase();
    for (const token of tokens) {
      if (
        upper.includes(`_${token}1`) ||
        upper.includes(`_${token}_`) ||
        upper.includes(`RIPPER_${token}`) ||
        upper.includes(`/${token}1.`)
      ) {
        matched.push(url);
        break;
      }
    }
  }
  return [...new Set(matched)];
}

export function countriesInCatalog(channels: Channel[]): Set<string> {
  const codes = new Set<string>();
  for (const channel of channels) {
    for (const code of expandTvgCountry(channel.country)) {
      if (code) codes.add(code.toUpperCase());
    }
  }
  return codes;
}

export function feedsForChannel(channel: Channel, allUrls: string[]): string[] {
  const codes = new Set(expandTvgCountry(channel.country).map((c) => c.toUpperCase()));
  return feedsForCountries(allUrls, codes);
}

export function selectFeedUrls(
  headerUrls: string[],
  customUrls: string[],
  channels: Channel[],
): string[] {
  const fromHeaders = headerUrls.flatMap((header) => splitEpgUrls(header));
  const combined = [...new Set([...fromHeaders, ...customUrls].filter(Boolean))];
  const regional = combined.filter((url) => !isAllSourcesFeed(url));
  const countries = countriesInCatalog(channels);
  const scoped = feedsForCountries(regional, countries);
  // Fall back to every playlist/header feed when catalog channels have no country
  // tags or the feed URL is not an epgshare regional ripper (e.g. bundled all.xml.gz).
  return scoped.length ? scoped : regional;
}
