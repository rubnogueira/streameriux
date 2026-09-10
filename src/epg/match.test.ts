import { describe, expect, it } from "vitest";
import type { Channel } from "../catalog/channel";
import { buildDisplayNameIndex, buildEpgMatchIndex, resolveEpgChannelId } from "./match";
import type { EpgChannelMeta } from "./xmltv";

const EPG_CHANNELS: EpgChannelMeta[] = [
  { id: "ONE.us", displayNames: ["One"] },
  { id: "ACME.1.HD.us", displayNames: ["Acme 1 HD"] },
  { id: "TWO.HD.us", displayNames: ["Two HD"] },
];

const IDS = new Set(EPG_CHANNELS.map((c) => c.id));
const DISPLAY = buildDisplayNameIndex(EPG_CHANNELS);
const INDEX = buildEpgMatchIndex(IDS, DISPLAY);

function channel(partial: Partial<Channel> & { name: string }): Channel {
  return {
    id: "x",
    url: "https://example.com/stream.m3u8",
    sourceFile: "test.m3u8",
    sourceKind: "m3u",
    editable: false,
    ...partial,
    name: partial.name,
  };
}

describe("resolveEpgChannelId", () => {
  it("matches exact tvg-id", () => {
    expect(resolveEpgChannelId(channel({ name: "One", tvgId: "ONE.us" }), INDEX)).toBe("ONE.us");
  });

  it("matches normalized numbered ids", () => {
    expect(resolveEpgChannelId(channel({ name: "Acme1", tvgId: "Acme1.us" }), INDEX)).toBe(
      "ACME.1.HD.us",
    );
  });

  it("matches a name against an HD-suffixed id", () => {
    expect(resolveEpgChannelId(channel({ name: "Two", tvgId: "Two.us" }), INDEX)).toBe("TWO.HD.us");
  });

  it("falls back to display name", () => {
    expect(resolveEpgChannelId(channel({ name: "One", tvgName: "One" }), INDEX)).toBe("ONE.us");
  });
});
