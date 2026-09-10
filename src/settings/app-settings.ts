import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse, stringify } from "smol-toml";
import { useCallback, useState } from "react";
import { useBootstrap } from "../lib/react-sync";
import { channelsDir } from "../catalog";

export type SettingsTab = "general" | "playlists" | "channels" | "groups" | "epg";

export const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "playlists", label: "Playlists" },
  { id: "channels", label: "Channels" },
  { id: "groups", label: "Groups" },
  { id: "epg", label: "EPG" },
];

export type SidebarView = "groups" | "countries" | "all" | "favorites";

export const SIDEBAR_VIEWS: { id: SidebarView; label: string }[] = [
  { id: "all", label: "All" },
  { id: "favorites", label: "Favorites" },
  { id: "groups", label: "Groups" },
  { id: "countries", label: "Country" },
];

const SETTINGS_NAME = "settings.toml";
const VALID_SIDEBAR_VIEWS = new Set<SidebarView>(SIDEBAR_VIEWS.map((entry) => entry.id));

/** Native hardware-composited video is macOS-only (README Option A). */
export const NATIVE_VIDEO_SUPPORTED =
  typeof process !== "undefined" && process.platform === "darwin";

export type AppSettings = {
  defaultSidebarView: SidebarView;
  /** Route video through the native AVSampleBufferDisplayLayer (macOS). */
  nativeVideo: boolean;
};

const DEFAULT_SETTINGS: AppSettings = {
  defaultSidebarView: "all",
  // On by default where supported: it keeps frame memory flat at full resolution.
  nativeVideo: NATIVE_VIDEO_SUPPORTED,
};

function settingsPath(): string {
  return join(channelsDir(), SETTINGS_NAME);
}

function parseSidebarView(value: unknown): SidebarView {
  return typeof value === "string" && VALID_SIDEBAR_VIEWS.has(value as SidebarView)
    ? (value as SidebarView)
    : DEFAULT_SETTINGS.defaultSidebarView;
}

export async function readAppSettings(): Promise<AppSettings> {
  if (!existsSync(settingsPath())) return { ...DEFAULT_SETTINGS };
  try {
    const data = parse(await readFile(settingsPath(), "utf8")) as Record<string, unknown>;
    return {
      defaultSidebarView: parseSidebarView(data.default_sidebar_view),
      nativeVideo:
        typeof data.native_video === "boolean"
          ? data.native_video && NATIVE_VIDEO_SUPPORTED
          : DEFAULT_SETTINGS.nativeVideo,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function writeAppSettings(settings: AppSettings): Promise<void> {
  await writeFile(
    settingsPath(),
    stringify({
      default_sidebar_view: settings.defaultSidebarView,
      native_video: settings.nativeVideo,
    }) + "\n",
    "utf8",
  );
}

export function useAppSettings(): {
  settings: AppSettings;
  setDefaultSidebarView: (view: SidebarView) => Promise<void>;
  setNativeVideo: (enabled: boolean) => Promise<void>;
} {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  useBootstrap(() => {
    void readAppSettings().then(setSettings);
  });

  const setDefaultSidebarView = useCallback(
    async (view: SidebarView) => {
      const next = { ...settings, defaultSidebarView: view };
      await writeAppSettings(next);
      setSettings(next);
    },
    [settings],
  );

  const setNativeVideo = useCallback(
    async (enabled: boolean) => {
      const next = { ...settings, nativeVideo: enabled && NATIVE_VIDEO_SUPPORTED };
      await writeAppSettings(next);
      setSettings(next);
    },
    [settings],
  );

  return { settings, setDefaultSidebarView, setNativeVideo };
}
