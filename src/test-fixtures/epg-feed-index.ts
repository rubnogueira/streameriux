import type { EpgFeedIndex } from "../epg/store";

export function epgFeedIndex(url: string, overrides: Partial<EpgFeedIndex> = {}): EpgFeedIndex {
  return {
    url,
    fetchedAt: new Date(0).toISOString(),
    channels: [],
    programmes: {},
    ...overrides,
  };
}
