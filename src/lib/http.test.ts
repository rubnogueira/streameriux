import { afterEach, describe, expect, it, vi } from "vitest";
import { installMockFetch } from "./mock-fetch";
import { mediaFetch, mediaSource, readSetCookieHeaders } from "./http";

const realFetch = globalThis.fetch;

function empty204(): Response {
  return {
    ok: true,
    status: 204,
    headers: new Headers(),
    clone() {
      return this;
    },
    async arrayBuffer() {
      return new ArrayBuffer(0);
    },
  } as Response;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("mediaFetch", () => {
  it("fetches playlists like a browser GET (no Range, default gzip)", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(
      new Response("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\na.m3u8\n", {
        status: 200,
        headers: { "Content-Type": "application/vnd.apple.mpegurl", "Content-Length": "42" },
      }),
    );
    installMockFetch(fetch);

    const response = await mediaFetch("https://example.com/live/playlist.m3u8", {
      headers: { Range: "bytes=0-" },
    });
    const body = await response.text();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(body.startsWith("#EXTM3U")).toBe(true);

    const headers = new Headers(fetch.mock.calls[0]?.[1]?.headers);
    expect(headers.has("Accept-Encoding")).toBe(false);
    expect(headers.get("Range")).toBeNull();
  });

  it("retries playlists with identity encoding after an empty response", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(empty204())
      .mockResolvedValueOnce(
        new Response("#EXTM3U\n", {
          status: 200,
          headers: { "Content-Type": "application/vnd.apple.mpegurl" },
        }),
      );
    installMockFetch(fetch);

    const response = await mediaFetch("https://example.com/live/playlist.m3u8");

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(200);
    const retryHeaders = new Headers(fetch.mock.calls[1]?.[1]?.headers);
    expect(retryHeaders.get("Accept-Encoding")).toBe("identity");
    expect(retryHeaders.get("Range")).toBeNull();
  });

  it("returns a 502 when every playlist attempt is empty", async () => {
    const fetch = vi.fn().mockResolvedValue(empty204());
    installMockFetch(fetch);

    const response = await mediaFetch("https://example.com/live/alt/playlist.m3u8");

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(502);
    expect(response.statusText).toBe("Playlist Empty");
  });

  it("retries segment fetches without Range on 416", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 416 }))
      .mockResolvedValueOnce(new Response("segment", { status: 200 }));
    installMockFetch(fetch);
    const response = await mediaFetch("https://example.com/seg.ts");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(200);
  });

  it("retries segment fetches after a network error", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(new Response("segment", { status: 200 }));
    installMockFetch(fetch);
    const response = await mediaFetch("https://example.com/seg.ts");
    expect(response.status).toBe(200);
  });

  it("retries segment fetches without Range on 204", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(empty204())
      .mockResolvedValueOnce(new Response("segment", { status: 200 }));
    installMockFetch(fetch);

    const response = await mediaFetch("https://example.com/seg.ts", {
      headers: { Range: "bytes=0-" },
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(200);
    const retryHeaders = new Headers(fetch.mock.calls[1]?.[1]?.headers);
    expect(retryHeaders.has("Range")).toBe(false);
  });

  it("merges Request headers and stores set-cookie headers", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("ok", {
          status: 200,
          headers: { "set-cookie": "session=abc; Path=/" },
        }),
      )
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    installMockFetch(fetch);
    const request = new Request("https://example.com/seg.ts", {
      headers: { "X-Test": "1" },
    });
    await mediaFetch(request);
    await mediaFetch("https://example.com/seg.ts");
    const cookieHeaders = new Headers(fetch.mock.calls[1]?.[1]?.headers);
    expect(cookieHeaders.get("Cookie")).toMatch(/session=abc/);
  });

  it("readSetCookieHeaders prefers getSetCookie", () => {
    const headers = new Headers();
    Object.defineProperty(headers, "getSetCookie", {
      configurable: true,
      value: () => ["token=xyz; Path=/"],
    });
    expect(readSetCookieHeaders(headers)).toEqual(["token=xyz; Path=/"]);
    expect(readSetCookieHeaders(new Headers({ "set-cookie": "a=1" }))).toEqual(["a=1"]);
  });

  it("treats smil playlists like m3u8", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("#EXTM3U\n", { status: 200, headers: { "Content-Type": "text/plain" } }),
      );
    installMockFetch(fetch);
    const response = await mediaFetch("https://example.com/live.smil/index");
    expect(response.status).toBe(200);
  });
});

describe("mediaSource", () => {
  it("uses referer from headers when referrer is omitted", () => {
    const source = mediaSource("https://example.com/live.m3u8", {
      headers: { Referer: "https://example.com/page" },
    });
    expect(source).toBeTruthy();
  });

  it("passes an explicit referer from channel config", () => {
    const source = mediaSource("https://example.com/live.m3u8", {
      referrer: "https://example.com/watch",
    });
    expect(source).toBeTruthy();
  });
});
