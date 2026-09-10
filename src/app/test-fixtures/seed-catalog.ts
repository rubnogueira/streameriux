import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function writeCatalog(dir: string, channelsToml: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "sources.toml"),
    'files = ["default.toml", "user.toml"]\nplaylists = []\n',
  );
  writeFileSync(join(dir, "settings.toml"), 'default_sidebar_view = "all"\nnative_video = false\n');
  writeFileSync(
    join(dir, "epg.toml"),
    "enabled = true\nsync_interval_hours = 12\nguide_hours_before = 6\nguide_hours_after = 24\n",
  );
  writeFileSync(join(dir, "default.toml"), channelsToml);
  writeFileSync(
    join(dir, "user.toml"),
    `
[[channel]]
id = "mine"
name = "My Stream"
group = "Custom"
url = "https://example.com/mine.m3u8"
`,
  );
}

const DEFAULT_CHANNELS = `
[[channel]]
id = "castr"
name = "Castr"
group = "Live"
country = "US"
chno = "1"
url = "https://example.com/castr.m3u8"

[[channel]]
id = "acme"
name = "Acme TV"
group = "United States"
country = "US"
icon = "https://example.com/acme.png"
url = "https://example.com/acme.m3u8"

[[channel]]
id = "global"
name = "Global News"
group = "News"
country = "GB"
url = "https://example.com/global.m3u8"
`;

/** Creates a temporary catalog directory and returns its path (does not set env). */
export function createTestCatalogDir(options?: { empty?: boolean }): string {
  const dir = join(tmpdir(), `streameriux-catalog-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  writeCatalog(dir, options?.empty ? "\n" : DEFAULT_CHANNELS);
  return dir;
}

/** @deprecated Prefer createTestCatalogDir + vi.stubEnv in tests. */
export function installTestCatalog(): string {
  const dir = createTestCatalogDir();
  process.env.STREAMER_CHANNELS_DIR = dir;
  return dir;
}

/** @deprecated Prefer createTestCatalogDir({ empty: true }) + vi.stubEnv. */
export function installEmptyTestCatalog(): string {
  const dir = createTestCatalogDir({ empty: true });
  process.env.STREAMER_CHANNELS_DIR = dir;
  return dir;
}
