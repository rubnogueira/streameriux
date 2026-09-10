import type { Channel } from "../catalog/channel";
import type { EpgChannelMeta } from "./xmltv";

function normalizeId(value: string): string {
  return value
    .toLowerCase()
    .replace(/\.hd\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function buildDisplayNameIndex(channels: EpgChannelMeta[]): Map<string, string> {
  const byName = new Map<string, string>();
  for (const channel of channels) {
    for (const name of channel.displayNames) {
      const key = normalizeName(name);
      if (key && !byName.has(key)) byName.set(key, channel.id);
    }
  }
  return byName;
}

export type EpgMatchIndex = {
  channelIds: Set<string>;
  displayNamesById: Map<string, string>;
  normalizedIdToId: Map<string, string>;
};

export function buildEpgMatchIndex(
  channelIds: Iterable<string>,
  displayNamesById: Map<string, string>,
): EpgMatchIndex {
  const ids = new Set(channelIds);
  const normalizedIdToId = new Map<string, string>();
  for (const id of ids) {
    const normalized = normalizeId(id);
    if (!normalizedIdToId.has(normalized)) normalizedIdToId.set(normalized, id);
  }
  return { channelIds: ids, displayNamesById, normalizedIdToId };
}

export function resolveEpgChannelId(channel: Channel, index: EpgMatchIndex): string | null {
  const tvgId = channel.tvgId?.trim();
  if (tvgId) {
    if (index.channelIds.has(tvgId)) return tvgId;
    const byNormalized = index.normalizedIdToId.get(normalizeId(tvgId));
    if (byNormalized) return byNormalized;
  }

  const tvgName = channel.tvgName?.trim() || channel.name.trim();
  if (tvgName) {
    const key = normalizeName(tvgName);
    const byDisplay = index.displayNamesById.get(key);
    if (byDisplay) return byDisplay;
  }

  return null;
}
