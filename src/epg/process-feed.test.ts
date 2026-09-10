import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildFeedIndex, processFeedBytes, writeFeedIndex } from "./process-feed";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <channel id="ONE.us"><display-name>One</display-name></channel>
  <programme start="20260908010000 +0000" stop="20260908023000 +0000" channel="ONE.us">
    <title>News</title>
  </programme>
</tv>`;

describe("buildFeedIndex", () => {
  it("maps parsed XML into a feed index", () => {
    const index = buildFeedIndex("https://example.com/epg.xml", XML);
    expect(index.url).toBe("https://example.com/epg.xml");
    expect(index.channels).toHaveLength(1);
    expect(index.programmes["ONE.us"]).toHaveLength(1);
    expect(index.programmes["ONE.us"]![0].title).toBe("News");
    expect(index.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("processFeedBytes", () => {
  it("decodes plain UTF-8 XML", () => {
    const data = new TextEncoder().encode(XML);
    const index = processFeedBytes("https://example.com/epg.xml", data);
    expect(index.programmes["ONE.us"]).toHaveLength(1);
  });

  it("gunzips .xml.gz feeds", () => {
    if (typeof Bun === "undefined") return;
    const raw = new TextEncoder().encode(XML);
    const gz = Bun.gzipSync(raw);
    const index = processFeedBytes("https://example.com/epg.xml.gz", gz);
    expect(index.programmes["ONE.us"]![0].title).toBe("News");
  });
});

describe("writeFeedIndex", () => {
  it("writes JSON to the cache path", async () => {
    const dir = mkdtempSync(join(tmpdir(), "epg-feed-"));
    const path = join(dir, "nested", "feed.json");
    const index = buildFeedIndex("https://example.com/epg.xml", XML);
    await writeFeedIndex(path, index);
    const saved = JSON.parse(readFileSync(path, "utf8")) as { url: string };
    expect(saved.url).toBe("https://example.com/epg.xml");
  });
});
