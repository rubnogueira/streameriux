import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse, stringify } from "smol-toml";
import { channelsDir } from "../catalog";

const EPG_NAME = "epg.toml";

export const EPG_CONFIG_NAME = EPG_NAME;

export type EpgConfig = {
  enabled: boolean;
  syncIntervalHours: number;
  guideHoursBefore: number;
  guideHoursAfter: number;
  customUrls: string[];
  lastSyncAt: string;
};

const DEFAULT_CONFIG: EpgConfig = {
  enabled: true,
  syncIntervalHours: 12,
  guideHoursBefore: 6,
  guideHoursAfter: 24,
  customUrls: [],
  lastSyncAt: "",
};

function epgPath(): string {
  return join(channelsDir(), EPG_NAME);
}

function parseHours(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) return fallback;
  return Math.round(value);
}

export async function readEpgConfig(): Promise<EpgConfig> {
  if (!existsSync(epgPath())) return { ...DEFAULT_CONFIG };
  try {
    const data = parse(await readFile(epgPath(), "utf8")) as Record<string, unknown>;
    const customUrls = Array.isArray(data.custom_urls)
      ? data.custom_urls.filter(
          (value): value is string => typeof value === "string" && Boolean(value.trim()),
        )
      : [];
    return {
      enabled: data.enabled !== false,
      syncIntervalHours: parseHours(data.sync_interval_hours, 12),
      guideHoursBefore: parseHours(data.guide_hours_before, 6),
      guideHoursAfter: parseHours(data.guide_hours_after, 24),
      customUrls,
      lastSyncAt: typeof data.last_sync_at === "string" ? data.last_sync_at : "",
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function writeEpgConfig(config: EpgConfig): Promise<void> {
  const body: Record<string, unknown> = {
    enabled: config.enabled,
    sync_interval_hours: config.syncIntervalHours,
    guide_hours_before: config.guideHoursBefore,
    guide_hours_after: config.guideHoursAfter,
    custom_urls: config.customUrls,
    last_sync_at: config.lastSyncAt,
  };
  await writeFile(epgPath(), stringify(body) + "\n", "utf8");
}

/** True when the configured sync interval has elapsed since the last successful sync. */
export function isSyncDue(config: EpgConfig, now = Date.now()): boolean {
  if (!config.lastSyncAt.trim()) return true;
  const synced = Date.parse(config.lastSyncAt);
  if (!Number.isFinite(synced)) return true;
  return now - synced >= config.syncIntervalHours * 60 * 60 * 1000;
}
