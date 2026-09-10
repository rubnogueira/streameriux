import { describe, expect, it } from "vitest";
import { feedNameFromUrl } from "./feed-name";

describe("feedNameFromUrl", () => {
  it("uses the last path segment", () => {
    expect(feedNameFromUrl("https://cdn.example.com/feeds/us-guide.xml.gz")).toBe("us-guide.xml.gz");
  });

  it("decodes percent-encoded names", () => {
    expect(feedNameFromUrl("https://cdn.example.com/feeds/my%20feed.xml")).toBe("my feed.xml");
  });

  it("falls back to the URL when the path is empty", () => {
    expect(feedNameFromUrl("https://example.com/")).toBe("https://example.com/");
  });

  it("handles invalid URLs with a slash fallback", () => {
    expect(feedNameFromUrl("not-a-url/segment.xml")).toBe("segment.xml");
    expect(feedNameFromUrl("nosegment")).toBe("nosegment");
  });
});
