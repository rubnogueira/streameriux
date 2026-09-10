import {
  COUNTRIES,
  COUNTRY_OPTIONS,
  REGIONS,
  WORLDWIDE_CODES,
  type CountryInfo,
} from "./countries.data";

export { COUNTRY_OPTIONS, type CountryInfo };

export const NO_COUNTRY = "No country";
export const INTERNATIONAL_CODE = "INT";

/** Human label for a country or special code, e.g. "🇪🇸 Spain". */
export function countryLabel(code: string): string {
  const token = code.trim().toUpperCase();
  if (!token || token === NO_COUNTRY) return NO_COUNTRY;
  if (WORLDWIDE_CODES.has(token)) return "🌍 International";
  const info = COUNTRIES[token];
  if (info) return `${info.flag} ${info.name}`;
  const region = regionName(token);
  if (region) return `🌐 ${region}`;
  return token;
}

function regionName(code: string): string | undefined {
  const names: Record<string, string> = {
    AFR: "Africa",
    AMER: "Americas",
    APAC: "Asia-Pacific",
    ARAB: "Arab world",
    ASEAN: "ASEAN",
    ASIA: "Asia",
    BALKAN: "Balkans",
    BENELUX: "Benelux",
    CARIB: "Caribbean",
    CAS: "Central Asia",
    CEE: "Central and Eastern Europe",
    CENAMER: "Central America",
    CEU: "Central Europe",
    CIS: "CIS",
    EAF: "East Africa",
    EAS: "East Asia",
    EMEA: "Europe, Middle East and Africa",
    EU: "European Union",
    EUR: "Europe",
    GCC: "Gulf Cooperation Council",
    HISPAM: "Hispanic America",
    LAC: "Latin America and the Caribbean",
    LATAM: "Latin America",
    MAGHREB: "Maghreb",
    MENA: "Middle East and North Africa",
    MIDEAST: "Middle East",
    NORAM: "North America",
    NORD: "Nordics",
    OCE: "Oceania",
    SAS: "South Asia",
    SEA: "Southeast Asia",
    SER: "Southern Europe",
    SOUTHAM: "South America",
    SSA: "Sub-Saharan Africa",
    WAF: "West Africa",
    WAS: "West Asia",
    WER: "Western Europe",
  };
  return names[code];
}

/**
 * Expand a `tvg-country` value per iptv-org rules: semicolon-separated ISO
 * codes, region short codes, and worldwide markers (`INT`, `WW`, `UN`).
 */
export function expandTvgCountry(value?: string): string[] {
  if (!value?.trim()) return [];
  const out = new Set<string>();
  for (const part of value.split(";")) {
    const token = part.trim().toUpperCase();
    if (!token) continue;
    if (WORLDWIDE_CODES.has(token)) {
      out.add(INTERNATIONAL_CODE);
      continue;
    }
    const region = REGIONS[token];
    if (region) {
      for (const code of region) out.add(code);
      continue;
    }
    out.add(token);
  }
  return [...out];
}

/** First country code from a `tvg-country` string for compact display. */
export function primaryCountryCode(value?: string): string | undefined {
  const codes = expandTvgCountry(value);
  return codes[0];
}

export function countrySortKey(code: string): string {
  if (code === NO_COUNTRY) return "\uffff";
  if (code === INTERNATIONAL_CODE) return "\ufffe";
  const token = code.trim().toUpperCase();
  const info = COUNTRIES[token];
  if (info) return info.name;
  const region = regionName(token);
  if (region) return region;
  return token;
}

export function orderedCountryKeys(map: Map<string, unknown>, tail = NO_COUNTRY): string[] {
  const named = [...map.keys()]
    .filter((name) => name !== tail)
    .sort((a, b) => countrySortKey(a).localeCompare(countrySortKey(b)));
  if (map.has(tail)) named.push(tail);
  return named;
}

export function buildCountryMap<T extends { country?: string }>(channels: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const channel of channels) {
    const codes = expandTvgCountry(channel.country);
    if (codes.length === 0) {
      const list = map.get(NO_COUNTRY) ?? [];
      list.push(channel);
      map.set(NO_COUNTRY, list);
      continue;
    }
    for (const code of codes) {
      const list = map.get(code) ?? [];
      list.push(channel);
      map.set(code, list);
    }
  }
  return map;
}
