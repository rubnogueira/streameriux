import type { Channel } from "../catalog/channel";
import type { EpgChannelMeta, EpgProgramme } from "./xmltv";
import {
  buildDisplayNameIndex,
  buildEpgMatchIndex,
  resolveEpgChannelId,
  type EpgMatchIndex,
} from "./match";

export type EpgFeedIndex = {
  url: string;
  fetchedAt: string;
  channels: EpgChannelMeta[];
  programmes: Record<string, EpgProgramme[]>;
};

export type EpgStatus = {
  feedCount: number;
  programmeCount: number;
  channelCount: number;
  matchedChannelCount: number;
  lastSyncAt: string | null;
  error: string | null;
};

export class EpgStore {
  private channelIds = new Set<string>();
  private displayNamesById = new Map<string, string>();
  private programmesByChannelId = new Map<string, EpgProgramme[]>();
  private resolvedByUrl = new Map<string, string>();
  private matchIndex: EpgMatchIndex = buildEpgMatchIndex([], new Map());
  private lastSyncAt: string | null = null;
  private error: string | null = null;
  private feedCount = 0;
  private programmeCount = 0;

  load(feeds: EpgFeedIndex[]): void {
    this.reset();
    for (const feed of feeds) this.mergeFeed(feed, false);
    this.finalizeMerged();
  }

  private reset(): void {
    this.channelIds.clear();
    this.displayNamesById.clear();
    this.programmesByChannelId.clear();
    this.resolvedByUrl.clear();
    this.matchIndex = buildEpgMatchIndex([], new Map());
    this.error = null;
    this.feedCount = 0;
    this.programmeCount = 0;
    this.lastSyncAt = null;
    this.dirtySort = false;
  }

  private dirtySort = false;

  /** Merge one feed file into the in-memory index (used during background sync). */
  mergeFeed(feed: EpgFeedIndex, finalize = true): void {
    this.feedCount += 1;
    if (!this.lastSyncAt || feed.fetchedAt > this.lastSyncAt) this.lastSyncAt = feed.fetchedAt;

    const names = buildDisplayNameIndex(feed.channels);
    for (const [name, id] of names) {
      if (!this.displayNamesById.has(name)) this.displayNamesById.set(name, id);
    }
    for (const channel of feed.channels) this.channelIds.add(channel.id);
    for (const [channelId, programmes] of Object.entries(feed.programmes)) {
      this.programmeCount += programmes.length;
      const existing = this.programmesByChannelId.get(channelId) ?? [];
      existing.push(...programmes);
      this.programmesByChannelId.set(channelId, existing);
      this.dirtySort = true;
    }

    if (finalize) this.finalizeMerged();
  }

  /** Sort merged programme lists after batching feed merges. */
  finishMerge(): void {
    this.finalizeMerged();
  }

  private finalizeMerged(): void {
    if (this.dirtySort) {
      for (const list of this.programmesByChannelId.values()) {
        list.sort((a, b) => a.start - b.start);
      }
      this.dirtySort = false;
    }
    this.matchIndex = buildEpgMatchIndex(this.channelIds, this.displayNamesById);
    this.resolvedByUrl.clear();
  }

  /** Lightweight status while syncing — skips expensive per-channel match scan. */
  snapshot(): EpgStatus {
    return {
      feedCount: this.feedCount,
      programmeCount: this.programmeCount,
      channelCount: this.channelIds.size,
      matchedChannelCount: 0,
      lastSyncAt: this.lastSyncAt,
      error: this.error,
    };
  }

  setError(error: string | null): void {
    this.error = error;
  }

  status(catalogChannels: Channel[]): EpgStatus {
    let matched = 0;
    for (const channel of catalogChannels) {
      if (this.resolveChannel(channel)) matched++;
    }
    return {
      feedCount: this.feedCount,
      programmeCount: this.programmeCount,
      channelCount: this.channelIds.size,
      matchedChannelCount: matched,
      lastSyncAt: this.lastSyncAt,
      error: this.error,
    };
  }

  resolveChannel(channel: Channel): string | null {
    const cached = this.resolvedByUrl.get(channel.url);
    if (cached !== undefined) return cached || null;
    const resolved = resolveEpgChannelId(channel, this.matchIndex);
    this.resolvedByUrl.set(channel.url, resolved ?? "");
    return resolved;
  }

  getNow(channel: Channel, at = Date.now()): EpgProgramme | null {
    const epgId = this.resolveChannel(channel);
    if (!epgId) return null;
    const list = this.programmesByChannelId.get(epgId);
    if (!list?.length) return null;
    return findProgrammeAt(list, at);
  }

  getSchedule(channel: Channel, from: number, to: number): EpgProgramme[] {
    const epgId = this.resolveChannel(channel);
    if (!epgId) return [];
    const list = this.programmesByChannelId.get(epgId);
    if (!list?.length) return [];
    return list.filter((programme) => programme.stop > from && programme.start < to);
  }
}

export function findProgrammeAt(list: EpgProgramme[], at: number): EpgProgramme | null {
  let lo = 0;
  let hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const programme = list[mid]!;
    if (at >= programme.start && at < programme.stop) return programme;
    if (at < programme.start) hi = mid - 1;
    else lo = mid + 1;
  }
  return null;
}
