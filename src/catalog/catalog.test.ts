import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addCatalogSource,
  addCustomGroup,
  assignChannelGroup,
  baseFolder,
  channelFromUnknown,
  setBaseFolder,
  loadCatalog,
  looksLikePlaylistRef,
  normalizeRemotePlaylistRef,
  NO_GROUP,
  orderedGroupNames,
  parseChannelToml,
  removeCatalogSource,
  removeChannel,
  removeCustomGroup,
  resetCatalogConfigCache,
  resolveGroupKey,
  resolveIconPath,
  setUsePlaylistGroups,
  toggleFavorite,
  upsertUserChannel,
} from "./index";
import { gpuixIconSrc, materializeSvg, usableIconSrc } from "../lib/icon";
import { installMockFetch } from "../lib/mock-fetch";

describe("parseChannelToml", () => {
  it("reads [[channel]] tables", () => {
    const channels = parseChannelToml(
      `
[[channel]]
id = "castr"
name = "Castr"
group = "Live"
url = "https://example.com/a.m3u8"

[[channel]]
name = "Acme"
url = "https://example.com/b.m3u8"
`,
      "/tmp/default.toml",
    );

    expect(channels).toEqual([
      {
        id: "castr",
        name: "Castr",
        group: "Live",
        url: "https://example.com/a.m3u8",
        sourceFile: "/tmp/default.toml",
        sourceKind: "toml",
        editable: false,
      },
      {
        id: "acme",
        name: "Acme",
        url: "https://example.com/b.m3u8",
        sourceFile: "/tmp/default.toml",
        sourceKind: "toml",
        editable: false,
      },
    ]);
  });

  it("accepts [[channels]] arrays", () => {
    const channels = parseChannelToml(
      `
[[channels]]
name = "One"
url = "https://example.com/one.m3u8"
`,
      "/tmp/more.toml",
    );
    expect(channels).toMatchObject([
      { id: "one", name: "One", url: "https://example.com/one.m3u8" },
    ]);
  });

  it("accepts keyed channel tables", () => {
    const channels = parseChannelToml(
      `
[channels.two]
name = "Two"
url = "https://example.com/two.m3u8"
`,
      "/tmp/more.toml",
    );
    expect(channels).toMatchObject([
      { id: "two", name: "Two", url: "https://example.com/two.m3u8" },
    ]);
  });

  it("deduplicates by url and skips disabled rows", () => {
    const channels = parseChannelToml(
      `
[[channel]]
name = "A"
url = "https://example.com/same.m3u8"

[[channel]]
name = "B"
url = "https://example.com/same.m3u8"

[[channel]]
name = "Off"
url = "https://example.com/off.m3u8"
enabled = false
`,
      "/tmp/x.toml",
    );

    expect(channels.map((channel) => channel.name)).toEqual(["A"]);
  });

  it("resolves local and remote icons", () => {
    const dir = join(tmpdir(), `gpiux-icon-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const mark = join(dir, "mark.png");
    writeFileSync(mark, "x");
    const toml = join(dir, "list.toml");
    writeFileSync(toml, "");

    expect(resolveIconPath("https://example.com/logo.png", toml)).toBe(
      "https://example.com/logo.png",
    );
    expect(resolveIconPath("mark.png", toml)).toBe(mark);
    expect(resolveIconPath("./mark.png", toml)).toBe(mark);

    const channels = parseChannelToml(
      `
[[channel]]
name = "Logo"
url = "https://example.com/live.m3u8"
icon = "https://cdn.example.com/a.png"
`,
      toml,
    );
    expect(channels[0]?.icon).toBe("https://cdn.example.com/a.png");
  });

  it("maps IPTV-style TOML keys", () => {
    const channels = parseChannelToml(
      `
[[channel]]
name = "News"
url = "https://example.com/news.m3u8"
group = "United States"
tvg_id = "News.us"
country = "US"
language = "en"
chno = "1"
user_agent = "VLC"
referrer = "https://example.com"
`,
      "/tmp/iptv.toml",
    );
    expect(channels[0]).toMatchObject({
      name: "News",
      group: "United States",
      tvgId: "News.us",
      country: "US",
      language: "en",
      chno: "1",
      userAgent: "VLC",
      referrer: "https://example.com",
    });
  });

  it("maps M3U8-style hyphenated TOML keys", () => {
    const channels = parseChannelToml(
      `
[[channel]]
name = "News"
url = "https://example.com/news.m3u8"
group-title = "United States"
tvg-logo = "https://cdn.example.com/news.png"
tvg-id = "News.us"
tvg-name = "News HD"
tvg-country = "US"
tvg-language = "en"
tvg-chno = "1"
tvg-shift = "1"
catchup-source = "?utc={utc}"
catchup-days = "7"
`,
      "/tmp/iptv.toml",
    );
    expect(channels[0]).toMatchObject({
      group: "United States",
      icon: "https://cdn.example.com/news.png",
      tvgId: "News.us",
      tvgName: "News HD",
      country: "US",
      language: "en",
      chno: "1",
      tvgShift: "1",
      catchupSource: "?utc={utc}",
      catchupDays: "7",
    });
  });

  it("reads custom HTTP headers from a nested headers table", () => {
    const channels = parseChannelToml(
      `
[[channel]]
name = "ATV"
url = "https://example.com/atv.m3u8"
user_agent = "Mozilla/5.0"
referrer = "https://referer.xyz/"

[channel.headers]
Origin = "https://origin.xyz"
Cookie = "session=abc"
`,
      "/tmp/iptv.toml",
    );
    expect(channels[0]).toMatchObject({
      userAgent: "Mozilla/5.0",
      referrer: "https://referer.xyz/",
      headers: {
        Origin: "https://origin.xyz",
        Cookie: "session=abc",
      },
    });
  });

  it("promotes User-Agent and Referer from headers when top-level fields are absent", () => {
    const channels = parseChannelToml(
      `
[[channel]]
name = "ATV"
url = "https://example.com/atv.m3u8"
headers = { Origin = "https://origin.xyz", Referer = "https://referer.xyz/", "User-Agent" = "Mozilla/5.0" }
`,
      "/tmp/iptv.toml",
    );
    expect(channels[0]).toMatchObject({
      userAgent: "Mozilla/5.0",
      referrer: "https://referer.xyz/",
      headers: {
        Origin: "https://origin.xyz",
      },
    });
  });

  it("maps top-level origin into headers", () => {
    const channels = parseChannelToml(
      `
[[channel]]
name = "ATV"
url = "https://example.com/atv.m3u8"
origin = "https://origin.xyz"
`,
      "/tmp/iptv.toml",
    );
    expect(channels[0]?.headers).toEqual({ Origin: "https://origin.xyz" });
  });

  it("reads vlc_options and extvlcopt arrays from TOML", () => {
    const channels = parseChannelToml(
      `
[[channel]]
name = "ATV"
url = "https://example.com/atv.m3u8"

[channel.vlc_options]
"http-user-agent" = "Mozilla/5.0"
program = 1025

[[channel]]
name = "Raw"
url = "https://example.com/raw.m3u8"
extvlcopt = [ "http-referrer=https://example.com/", "no-video" ]
`,
      "/tmp/iptv.toml",
    );
    expect(channels[0]).toMatchObject({
      userAgent: "Mozilla/5.0",
      vlcOptions: { program: "1025" },
    });
    expect(channels[1]).toMatchObject({
      referrer: "https://example.com/",
      vlcOptions: { video: false },
    });
  });

  it("puts ungrouped channels in No group at the end", () => {
    const names = orderedGroupNames(
      [
        {
          id: "a",
          name: "A",
          url: "https://a",
          sourceFile: "x",
          sourceKind: "toml",
          editable: false,
          group: "United States",
        },
        {
          id: "b",
          name: "B",
          url: "https://b",
          sourceFile: "x",
          sourceKind: "toml",
          editable: false,
        },
        {
          id: "c",
          name: "C",
          url: "https://c",
          sourceFile: "x",
          sourceKind: "toml",
          editable: false,
          group: "Live",
        },
      ],
      true,
      {},
    );
    expect(names).toEqual(["Live", "United States", NO_GROUP]);
  });

  it("ignores playlist groups when disabled and honors assignments", async () => {
    const channel = {
      id: "x",
      name: "X",
      url: "https://x",
      sourceFile: "p.m3u8",
      sourceKind: "m3u" as const,
      editable: false,
      group: "News",
    };
    expect(resolveGroupKey(channel, false, {})).toBe(NO_GROUP);
    expect(resolveGroupKey(channel, false, { "https://x": "Sports" })).toBe("Sports");
    await setUsePlaylistGroups(false);
    await assignChannelGroup("https://x", "Sports");
    const catalog = await loadCatalog();
    expect(catalog.usePlaylistGroups).toBe(false);
    expect(catalog.groupAssignments["https://x"]).toBe("Sports");
    expect(
      orderedGroupNames([channel], catalog.usePlaylistGroups, catalog.groupAssignments),
    ).toEqual(["Sports"]);
  });
});

describe("normalizeRemotePlaylistRef", () => {
  it("rewrites GitHub blob links to raw.githubusercontent.com", () => {
    expect(
      normalizeRemotePlaylistRef("https://github.com/thomraider12/canaistvpt/blob/main/pt.m3u"),
    ).toBe("https://raw.githubusercontent.com/thomraider12/canaistvpt/main/pt.m3u");
  });

  it("leaves non-GitHub URLs unchanged", () => {
    const url = "https://example.com/list.m3u8?token=1";
    expect(normalizeRemotePlaylistRef(url)).toBe(url);
  });
});

describe("looksLikePlaylistRef", () => {
  it("detects playlists by extension, ignoring the query string", () => {
    expect(looksLikePlaylistRef("https://host/path/playlist.m3u8")).toBe(true);
    expect(looksLikePlaylistRef("https://host/path/list.m3u8?token=abc")).toBe(true);
    expect(looksLikePlaylistRef("https://host/list.m3u?x=1")).toBe(true);
    expect(looksLikePlaylistRef("https://host/catalog.toml")).toBe(true);
  });

  it("detects Xtream/OTT panel URLs that have no file extension", () => {
    expect(
      looksLikePlaylistRef("http://host:8080/get.php?username=u&password=p&type=m3u_plus"),
    ).toBe(true);
  });

  it("does not flag a plain stream URL", () => {
    expect(looksLikePlaylistRef("https://host/live/stream.ts")).toBe(false);
    expect(looksLikePlaylistRef("https://host/video.mp4")).toBe(false);
  });
});

describe("addCatalogSource", () => {
  const dir = join(tmpdir(), `gpiux-add-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    process.env.STREAMER_CHANNELS_DIR = dir;
    resetCatalogConfigCache();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("adds a local M3U playlist to sources and reports its channel count", async () => {
    const playlist = join(dir, "mylist.m3u8");
    writeFileSync(
      playlist,
      '#EXTM3U\n#EXTINF:-1 group-title="News",A\nhttps://example.com/a.m3u8\n#EXTINF:-1,B\nhttps://example.com/b.m3u8\n',
    );
    const result = await addCatalogSource(playlist);
    expect(result).toEqual({ kind: "playlist", count: 2 });
    expect(readFileSync(join(dir, "sources.toml"), "utf8")).toContain("mylist.m3u8");
  });

  it("adds a bare stream URL as a single channel in user.toml", async () => {
    const result = await addCatalogSource("https://example.com/live/onlystream.ts");
    expect(result).toEqual({ kind: "channel", count: 1 });
    expect(readFileSync(join(dir, "user.toml"), "utf8")).toContain("onlystream.ts");
  });

  it("adds a GitHub blob M3U URL as a playlist using the raw file URL", async () => {
    const m3u = "#EXTM3U\n#EXTINF:-1,One\nhttps://example.com/one.m3u8\n";
    installMockFetch(
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe("https://raw.githubusercontent.com/o/r/main/list.m3u");
        return new Response(m3u, { status: 200 });
      }),
    );

    const result = await addCatalogSource("https://github.com/o/r/blob/main/list.m3u", {
      intent: "playlist",
    });
    expect(result).toEqual({ kind: "playlist", count: 1 });
    const sources = readFileSync(join(dir, "sources.toml"), "utf8");
    expect(sources).toContain("raw.githubusercontent.com/o/r/main/list.m3u");
    expect(readFileSync(join(dir, "user.toml"), "utf8")).not.toContain("raw.githubusercontent.com");
  });

  it("does not fall back to user.toml when playlist intent gets non-playlist content", async () => {
    installMockFetch(vi.fn(async () => new Response("<!doctype html>", { status: 200 })));

    await expect(
      addCatalogSource("https://example.com/list.m3u", { intent: "playlist" }),
    ).rejects.toThrow(/Could not load a channel playlist/);
    const user = existsSync(join(dir, "user.toml"))
      ? readFileSync(join(dir, "user.toml"), "utf8")
      : "";
    expect(user).not.toContain("example.com/list.m3u");
  });

  it("adds and removes custom group names in groups.toml", async () => {
    await addCustomGroup("CustomLeague");
    expect(readFileSync(join(dir, "groups.toml"), "utf8")).toContain('"CustomLeague"');
    await addCustomGroup("CustomLeague");
    await removeCustomGroup("CustomLeague");
    expect(readFileSync(join(dir, "groups.toml"), "utf8")).not.toContain('"CustomLeague"');
  });

  it("rejects empty group names", async () => {
    await expect(addCustomGroup("   ")).rejects.toThrow("Group name is required");
  });
});

describe("orderedGroupNames", () => {
  it("includes custom group names even without channels", () => {
    const channels = [
      {
        id: "a",
        name: "A",
        url: "https://example.com/a",
        sourceFile: "x",
        sourceKind: "toml" as const,
        editable: false,
      },
    ];
    expect(orderedGroupNames(channels, true, {}, ["My List", "Favorites"])).toEqual([
      "Favorites",
      "My List",
      "No group",
    ]);
  });
});

describe("usableIconSrc", () => {
  it("keeps remote URLs and drops missing files", () => {
    expect(usableIconSrc("https://i.imgur.com/a.png")).toBe("https://i.imgur.com/a.png");
    expect(usableIconSrc("/no/such/icon.png")).toBeUndefined();
    expect(usableIconSrc("")).toBeUndefined();
  });
});

describe("resetCatalogConfigCache", () => {
  it("clears the in-memory base folder override", async () => {
    resetCatalogConfigCache();
    await setBaseFolder(null);
    resetCatalogConfigCache();
    expect(baseFolder()).toBeNull();
  });
});

describe("channelFromUnknown", () => {
  it("accepts bare URL strings and rich channel records", () => {
    expect(
      channelFromUnknown("https://example.com/live.m3u8", "stem", "/tmp/x.toml", false),
    ).toMatchObject({ url: "https://example.com/live.m3u8", id: "stem" });
    expect(channelFromUnknown({ enabled: false }, "off", "/tmp/x.toml", false)).toBeNull();
    expect(
      channelFromUnknown(
        {
          name: "Radio",
          url: "https://example.com/radio.m3u8",
          radio: true,
          headers: { Origin: "https://origin.test", Authorization: "secret" },
          vlc_options: { "http-user-agent": "Agent" },
        },
        "radio",
        "/tmp/x.toml",
        true,
      ),
    ).toMatchObject({
      radio: true,
      userAgent: "Agent",
      headers: { Origin: "https://origin.test" },
    });
  });
});

describe("catalog persistence helpers", () => {
  const dir = join(tmpdir(), `gpiux-persist-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  beforeEach(() => {
    process.env.STREAMER_CHANNELS_DIR = dir;
    resetCatalogConfigCache();
  });

  it("validates upsertUserChannel input", async () => {
    await expect(upsertUserChannel({ name: " ", url: "https://x" })).rejects.toThrow(
      "Channel name is required",
    );
    await expect(upsertUserChannel({ name: "X", url: "ftp://x" })).rejects.toThrow(
      "URL must be http",
    );
  });

  it("hides non-editable channels and toggles favorites", async () => {
    writeFileSync(join(dir, "sources.toml"), 'files = ["user.toml"]\nplaylists = []\n', "utf8");
    writeFileSync(
      join(dir, "user.toml"),
      `[[channel]]
name = "Keep"
url = "https://example.com/keep.m3u8"
`,
      "utf8",
    );
    const catalog = await loadCatalog();
    const channel = catalog.channels[0]!;
    await toggleFavorite(channel);
    await removeChannel({ ...channel, editable: false });
    const hidden = await loadCatalog();
    expect(hidden.channels).toHaveLength(0);
    expect(hidden.hidden).toContain(channel.url);
  });

  it("loads remote playlists outside Vitest and reports file errors", async () => {
    const vitest = process.env.VITEST;
    delete process.env.VITEST;
    writeFileSync(
      join(dir, "sources.toml"),
      'files = ["missing.toml"]\nplaylists = ["https://example.com/list.m3u"]\n',
      "utf8",
    );
    installMockFetch(
      vi.fn(async () => new Response("#EXTM3U\n#EXTINF:-1,A\nhttps://a\n", { status: 200 })),
    );
    const loaded = await loadCatalog();
    expect(loaded.error).toContain("Missing missing.toml");
    if (vitest !== undefined) process.env.VITEST = vitest;
    else delete process.env.VITEST;
  });

  it("adds local toml playlists and rejects playlist intent without a list", async () => {
    const toml = join(dir, "channels.toml");
    writeFileSync(
      toml,
      `[[channel]]
name = "Local"
url = "https://example.com/local.m3u8"
`,
      "utf8",
    );
    const added = await addCatalogSource(toml);
    expect(added.kind).toBe("playlist");
    await removeCatalogSource(toml);

    installMockFetch(vi.fn(async () => new Response("#EXTM3U\n", { status: 200 })));
    await expect(
      addCatalogSource("https://example.com/not-a-list.m3u", { intent: "playlist" }),
    ).rejects.toThrow(/Could not load a channel playlist/);

    await expect(addCatalogSource("not-a-url", { intent: "playlist" })).rejects.toThrow(
      /Enter a playlist URL/,
    );
  });
});

describe("gpuixIconSrc", () => {
  it("does not hand HTTP URLs to GPUI", () => {
    expect(gpuixIconSrc("https://i.imgur.com/a.png")).toBeUndefined();
    expect(gpuixIconSrc("data:image/png;base64,xx")).toBe("data:image/png;base64,xx");
    expect(gpuixIconSrc("/no/such/icon.png")).toBeUndefined();
  });

  it("returns a real file for materialized UI icons", () => {
    const path = materializeSvg(
      "test-radio",
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" fill="#000"/></svg>',
    );
    expect(existsSync(path)).toBe(true);
    expect(gpuixIconSrc(path)).toBe(path);
  });
});
