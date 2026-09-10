import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { EpgFeedIndex } from "./store";
import { gunzipXmltv, parseXmltv, type EpgProgramme } from "./xmltv";

function decodeFeed(data: Uint8Array, url: string): string {
  const lower = url.toLowerCase();
  if (lower.endsWith(".gz") || lower.includes(".xml.gz")) {
    return gunzipXmltv(data);
  }
  return new TextDecoder("utf-8").decode(data);
}

export function buildFeedIndex(url: string, xml: string): EpgFeedIndex {
  const parsed = parseXmltv(xml);
  const programmes: Record<string, EpgProgramme[]> = {};
  for (const [channelId, list] of parsed.programmes) {
    programmes[channelId] = list;
  }
  return {
    url,
    fetchedAt: new Date().toISOString(),
    channels: parsed.channels,
    programmes,
  };
}

export function processFeedBytes(url: string, data: Uint8Array): EpgFeedIndex {
  const xml = decodeFeed(data, url);
  return buildFeedIndex(url, xml);
}

export async function writeFeedIndex(cachePath: string, index: EpgFeedIndex): Promise<void> {
  mkdirSync(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(index), "utf8");
}
