import type { Channel } from "../catalog/channel";
import type { EpgConfig } from "./config";
import { isSyncDue } from "./config";
import type { EpgStore } from "./store";
import { readCachedFeed } from "./sync";
import { yieldToMain } from "./yield";

export function epgBackgroundSyncEnabled(): boolean {
  return process.env.VITEST !== "true";
}

export type HydrateCachedFeedsParams = {
  urls: string[];
  generation: number;
  hydrateGenerationRef: { current: number };
  store: EpgStore;
  channels: Channel[];
  config: EpgConfig;
  syncActive: boolean;
  setStatus: (status: ReturnType<EpgStore["snapshot"]>) => void;
  runSync: (force: boolean) => Promise<void>;
};

export async function hydrateCachedFeeds(params: HydrateCachedFeedsParams): Promise<void> {
  const {
    urls,
    generation,
    hydrateGenerationRef,
    store,
    channels,
    config,
    syncActive,
    setStatus,
    runSync,
  } = params;

  await yieldToMain();
  if (generation !== hydrateGenerationRef.current) return;

  store.load([]);
  setStatus(store.snapshot());

  for (const url of urls) {
    if (generation !== hydrateGenerationRef.current) return;
    const feed = await readCachedFeed(url);
    if (!feed) continue;
    store.mergeFeed(feed, false);
    setStatus(store.snapshot());
    await yieldToMain();
  }

  if (generation !== hydrateGenerationRef.current) return;
  store.finishMerge();
  setStatus(store.status(channels));

  if (isSyncDue(config) && !syncActive) void runSync(false);
}
