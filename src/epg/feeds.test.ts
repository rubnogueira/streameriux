import { describe, expect, it } from "vitest";
import type { Channel } from "../catalog/channel";
import { feedsForCountries, isAllSourcesFeed, selectFeedUrls, splitEpgUrls } from "./feeds";

const URLS = [
  "https://epgshare01.online/epgshare01/epg_ripper_US1.xml.gz",
  "https://epgshare01.online/epgshare01/epg_ripper_UK1.xml.gz",
  "https://epgshare01.online/epgshare01/epg_ripper_ALL_SOURCES1.xml.gz",
];

describe("splitEpgUrls", () => {
  it("splits comma-separated header URLs", () => {
    const header = `${URLS[0]}, ${URLS[1]}`;
    expect(splitEpgUrls(header)).toEqual(URLS.slice(0, 2));
  });
});

describe("feedsForCountries", () => {
  it("selects regional feeds and skips ALL_SOURCES", () => {
    const feeds = feedsForCountries(URLS, new Set(["US"]));
    expect(feeds).toEqual([URLS[0]]);
    expect(isAllSourcesFeed(URLS[2]!)).toBe(true);
  });
});

describe("selectFeedUrls", () => {
  const channels: Channel[] = [
    {
      id: "acme1",
      name: "Acme 1",
      url: "https://x/a.m3u8",
      country: "US",
      sourceFile: "p.m3u8",
      sourceKind: "m3u",
      editable: false,
    },
  ];

  it("scopes to catalog countries", () => {
    const selected = selectFeedUrls([URLS.join(", ")], [], channels);
    expect(selected).toEqual([URLS[0]]);
  });

  it("includes playlist header EPG URLs when catalog channels have no country tags", () => {
    const bundled = "https://example.com/epg/all.xml.gz";
    const selected = selectFeedUrls([bundled], [], channels);
    expect(selected).toEqual([bundled]);
  });
});
