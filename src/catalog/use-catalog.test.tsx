/** @vitest-environment jsdom */
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHookProbe } from "../test-fixtures/render-hook";

const watchState = vi.hoisted(() => ({
  listener: null as null | ((event: string, filename: string | null) => void),
  close: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs")>();
  return {
    ...fs,
    watch: vi.fn((_path, _opts, listener) => {
      watchState.listener = listener as (event: string, filename: string | null) => void;
      return { close: watchState.close } as ReturnType<typeof fs.watch>;
    }),
  };
});

import { useCatalog } from "./index";

describe("useCatalog", () => {
  const dir = join(tmpdir(), `use-catalog-${Date.now()}`);
  const previousDir = process.env.STREAMER_CHANNELS_DIR;

  beforeEach(() => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "sources.toml"),
      'files = ["user.toml"]\nplaylists = []\n',
      "utf8",
    );
    writeFileSync(
      join(dir, "user.toml"),
      `[[channel]]
name = "One"
url = "https://example.com/one.m3u8"
`,
      "utf8",
    );
    process.env.STREAMER_CHANNELS_DIR = dir;
    watchState.listener = null;
    watchState.close.mockClear();
  });

  afterEach(() => {
    process.env.STREAMER_CHANNELS_DIR = previousDir;
    vi.clearAllMocks();
  });

  async function renderCatalogHook() {
    return renderHookProbe(() => useCatalog());
  }

  it("loads the catalog from disk and exposes mutations", async () => {
    const hook = await renderCatalogHook();
    await vi.waitFor(async () => {
      await hook.rerender();
      expect(hook.latest.loading).toBe(false);
      expect(hook.latest.channels).toHaveLength(1);
    });

    await act(async () => {
      await hook.latest.toggleFavorite(hook.latest.channels[0]!);
    });
    await hook.rerender();
    expect(hook.latest.channels[0]?.favorite).toBe(true);

    await act(async () => {
      await hook.latest.toggleFavorite(hook.latest.channels[0]!);
    });
    await hook.rerender();
    expect(hook.latest.channels[0]?.favorite).toBeFalsy();

    await act(async () => {
      await hook.latest.setUsePlaylistGroups(false);
    });
    await hook.rerender();
    expect(hook.latest.usePlaylistGroups).toBe(false);

    await act(async () => {
      await hook.latest.assignChannelGroup(hook.latest.channels[0]!, "Sports");
    });
    await hook.rerender();
    expect(hook.latest.groupAssignments["https://example.com/one.m3u8"]).toBe("Sports");

    await act(async () => {
      await hook.latest.assignChannelGroup(hook.latest.channels[0]!, null);
    });
    await hook.rerender();
    expect(hook.latest.groupAssignments["https://example.com/one.m3u8"]).toBeUndefined();

    await act(async () => {
      await hook.latest.addCustomGroup("League");
    });
    await hook.rerender();
    expect(hook.latest.customGroupNames).toContain("League");

    await act(async () => {
      await hook.latest.removeCustomGroup("League");
    });
    await hook.rerender();
    expect(hook.latest.customGroupNames).not.toContain("League");

    await act(async () => {
      await hook.latest.saveChannel({
        name: "Two",
        url: "https://example.com/two.m3u8",
      });
    });
    await hook.rerender();
    expect(hook.latest.channels.some((c) => c.name === "Two")).toBe(true);

    await act(async () => {
      const channel = hook.latest.channels.find((c) => c.name === "Two")!;
      await hook.latest.deleteChannel(channel);
    });
    await hook.rerender();
    expect(hook.latest.channels.some((c) => c.name === "Two")).toBe(false);

    await act(async () => {
      await hook.latest.refresh();
    });
    await hook.rerender();
    expect(hook.latest.loading).toBe(false);

    await act(async () => {
      await hook.latest.reload();
    });
    await hook.rerender();

    const playlist = join(dir, "extra.m3u");
    writeFileSync(playlist, "#EXTM3U\n#EXTINF:-1,A\nhttps://example.com/a.m3u8\n", "utf8");
    await act(async () => {
      await hook.latest.addLink(playlist);
    });
    await hook.rerender();
    expect(hook.latest.sources.some((s) => s.path.endsWith("extra.m3u"))).toBe(true);

    await act(async () => {
      await hook.latest.deleteSource("extra.m3u");
    });
    await hook.rerender();
    expect(hook.latest.sources.some((s) => s.path.endsWith("extra.m3u"))).toBe(false);

    const relocated = join(dir, "relocated");
    const envOverride = process.env.STREAMER_CHANNELS_DIR;
    delete process.env.STREAMER_CHANNELS_DIR;
    await act(async () => {
      await hook.latest.setBaseFolder(relocated);
    });
    process.env.STREAMER_CHANNELS_DIR = envOverride;
    await hook.rerender();

    hook.unmount();
  });

  it("reloads when the filesystem watcher fires", async () => {
    const hook = await renderCatalogHook();
    await vi.waitFor(async () => {
      await hook.rerender();
      expect(hook.latest.channels).toHaveLength(1);
    });

    writeFileSync(
      join(dir, "user.toml"),
      `[[channel]]
name = "Watcher"
url = "https://example.com/watcher.m3u8"
`,
      "utf8",
    );

    await act(async () => {
      watchState.listener?.("change", "new-playlist.m3u");
      await new Promise((resolve) => setTimeout(resolve, 450));
    });
    await hook.rerender();
    expect(hook.latest.channels.some((c) => c.name === "Watcher")).toBe(true);

    await act(async () => {
      watchState.listener?.("change", "hidden.toml");
    });

    hook.unmount();
  });
});
