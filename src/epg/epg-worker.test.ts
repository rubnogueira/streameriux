import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <channel id="ONE.us"><display-name>One</display-name></channel>
  <programme start="20260908010000 +0000" stop="20260908023000 +0000" channel="ONE.us">
    <title>News</title>
  </programme>
</tv>`;

describe("epg-worker", () => {
  const posts: unknown[] = [];

  afterEach(() => {
    posts.length = 0;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("writes the feed index and replies with the parsed data", async () => {
    vi.stubGlobal("postMessage", (message: unknown) => {
      posts.push(message);
    });
    await import("./epg-worker");

    const dir = mkdtempSync(join(tmpdir(), "epg-worker-"));
    const cachePath = join(dir, "cache.json");
    const data = new TextEncoder().encode(XML).buffer;

    const handler = globalThis.onmessage;
    expect(handler).toBeTypeOf("function");
    (handler as (event: MessageEvent) => void)({
      data: { id: 7, url: "https://example.com/epg.xml", cachePath, data },
    } as MessageEvent);

    expect(posts).toHaveLength(1);
    const reply = posts[0] as { id: number; index?: { url: string }; error?: string };
    expect(reply.id).toBe(7);
    expect(reply.index?.url).toBe("https://example.com/epg.xml");
    expect(readFileSync(cachePath, "utf8")).toContain("ONE.us");
  });

  it("returns an error message when parsing fails", async () => {
    vi.stubGlobal("postMessage", (message: unknown) => {
      posts.push(message);
    });
    vi.resetModules();
    await import("./epg-worker");

    (globalThis.onmessage as (event: MessageEvent) => void)({
      data: {
        id: 2,
        url: "https://example.com/bad.xml.gz",
        cachePath: join(tmpdir(), "epg-worker-bad.json"),
        data: new TextEncoder().encode("not gzip").buffer,
      },
    } as MessageEvent);

    const reply = posts.at(-1) as { id: number; error?: string };
    expect(reply.id).toBe(2);
    expect(reply.error).toBeTruthy();
  });
});
