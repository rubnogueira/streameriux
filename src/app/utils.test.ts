import { describe, expect, it } from "vitest";
import {
  channelMatchesSearch,
  channelSearchHaystack,
  dedupeProgrammes,
  orderedKeys,
  programmeSubtitle,
  seekBarModel,
} from "./utils";
import type { Channel } from "../catalog";
import type { EpgProgramme } from "../epg/xmltv";

const programme: EpgProgramme = {
  // 2026-09-09 20:00:00 – 21:30:00 local, in milliseconds.
  start: new Date(2026, 8, 9, 20, 0, 0).getTime(),
  stop: new Date(2026, 8, 9, 21, 30, 0).getTime(),
  title: "News at Eight",
};

const base = {
  ready: true,
  live: false,
  seekable: true,
  start: 0,
  end: 300,
  time: 120,
  unixOffset: null as number | null,
  programme: null as EpgProgramme | null,
  nowMs: Date.now(),
};

describe("seekBarModel — VOD", () => {
  it("is an ordinary 0:00 → duration progress bar", () => {
    const m = seekBarModel({ ...base, start: 30, end: 300, time: 90 });
    expect(m.startLabel).toBe("0:30");
    expect(m.endLabel).toBe("5:00");
    expect(m.timeLabel).toBe("1:30");
    expect(m.seekable).toBe(true);
    expect(m.pinLive).toBe(false);
    expect(m.toMedia(75)).toBe(75); // identity mapping
  });

  it("shows placeholders for live non-seekable streams before ready", () => {
    const m = seekBarModel({
      ...base,
      live: true,
      seekable: false,
      ready: false,
      unixOffset: 0,
    });
    expect(m.endLabel).toBe("--:--:--");
  });

  it("shows placeholders before ready", () => {
    const m = seekBarModel({ ...base, ready: false });
    expect(m.startLabel).toBe("--:--:--");
    expect(m.endLabel).toBe("--:--:--");
  });
});

describe("seekBarModel — live without EPG", () => {
  it("non-seekable live: full bar, LIVE on the end, blank start, no circle", () => {
    const m = seekBarModel({ ...base, live: true, seekable: false, unixOffset: 0 });
    expect(m.startLabel).toBe("");
    expect(m.endLabel).toBe("LIVE");
    expect(m.seekable).toBe(false);
    expect(m.pinLive).toBe(true);
  });

  it("seekable DVR with a wall clock: oldest timestamp on the left, LIVE on the right", () => {
    // Unix stream: media time IS wall clock, offset 0. Window 20:00:00–20:40:00.
    const at = (h: number, mi: number) => new Date(2026, 8, 9, h, mi, 0).getTime() / 1000;
    const m = seekBarModel({
      ...base,
      live: true,
      seekable: true,
      unixOffset: 0,
      start: at(20, 0),
      end: at(20, 40),
      time: at(20, 40), // at the live edge
    });
    expect(m.startLabel).toBe("20:00:00");
    expect(m.endLabel).toBe("LIVE");
    expect(m.timeLabel).toBe("LIVE"); // pinned at the edge
    expect(m.seekable).toBe(true);
    expect(m.pinLive).toBe(true);
  });

  it("labels the live edge when the playhead is near it", () => {
    const end = 600;
    const m = seekBarModel({
      ...base,
      live: true,
      seekable: true,
      unixOffset: 0,
      start: 0,
      end,
      time: end - 3,
    });
    expect(m.timeLabel).toBe("LIVE");
  });

  it("derives a wall clock for non-Unix DVR so the oldest time is a real timestamp", () => {
    // Non-unix media time; offset maps the live edge to "now".
    const now = new Date(2026, 8, 9, 21, 0, 0).getTime() / 1000;
    const end = 5400; // media seconds at the live edge
    const offset = now - end; // wall = media + offset
    const m = seekBarModel({
      ...base,
      live: true,
      seekable: true,
      unixOffset: offset,
      start: end - 1800, // 30-min window
      end,
      time: end - 600, // rewound 10 min
    });
    expect(m.startLabel).toBe("20:30:00"); // 30 min before 21:00
    expect(m.timeLabel).toBe("20:50:00"); // 10 min behind live
    // Dragging to 20:40 wall-clock maps back to the right media time.
    const wall2040 = new Date(2026, 8, 9, 20, 40, 0).getTime() / 1000;
    expect(m.toMedia(wall2040)).toBeCloseTo(wall2040 - offset, 3);
  });
});

describe("seekBarModel — live with EPG programme", () => {
  const pStart = programme.start / 1000;
  const pEnd = programme.stop / 1000;

  it("spans the programme window and places the cursor at the playhead time", () => {
    // Unix stream, playhead at 20:45 wall-clock (offset 0 → media == wall).
    const playheadWall = new Date(2026, 8, 9, 20, 45, 0).getTime() / 1000;
    const m = seekBarModel({
      ...base,
      live: true,
      seekable: true,
      unixOffset: 0,
      time: playheadWall,
      programme,
    });
    expect(m.start).toBe(pStart);
    expect(m.end).toBe(pEnd);
    expect(m.startLabel).toBe("20:00:00");
    expect(m.endLabel).toBe("21:30:00");
    expect(m.timeLabel).toBe("20:45:00");
    expect(m.seekable).toBe(true); // circle shown — can rewind
  });

  it("clamps the cursor into the programme window", () => {
    const beforeStart = programme.start / 1000 - 600; // 10 min before the programme
    const m = seekBarModel({
      ...base,
      live: true,
      seekable: true,
      unixOffset: 0,
      time: beforeStart,
      programme,
    });
    expect(m.time).toBe(pStart);
  });

  it("shows the programme times but no circle when the stream is not seekable", () => {
    const m = seekBarModel({
      ...base,
      live: true,
      seekable: false,
      unixOffset: 0,
      time: pStart + 100,
      programme,
    });
    expect(m.startLabel).toBe("20:00:00");
    expect(m.endLabel).toBe("21:30:00");
    expect(m.seekable).toBe(false); // no rewind circle
  });

  it("shows placeholders for live DVR before the stream is ready", () => {
    const m = seekBarModel({
      ...base,
      live: true,
      seekable: true,
      unixOffset: null,
      ready: false,
      start: 0,
      end: 600,
      time: 540,
    });
    expect(m.startLabel).toBe("--:--:--");
    expect(m.timeLabel).toBe("--:--:--");
  });

  it("uses relative labels when live seekable without wall clock", () => {
    const m = seekBarModel({
      ...base,
      live: true,
      seekable: true,
      unixOffset: null,
      start: 0,
      end: 600,
      time: 540,
    });
    expect(m.startLabel).toMatch(/^-/);
    expect(m.timeLabel).toMatch(/^-/);
  });

  it("maps a dragged wall-clock position back to a media timestamp", () => {
    const offset = 1_000_000; // arbitrary non-unix offset
    const m = seekBarModel({
      ...base,
      live: true,
      seekable: true,
      unixOffset: offset,
      time: 0,
      programme,
    });
    const target = pStart + 1200; // 20 min into the programme (wall-clock seconds)
    expect(m.toMedia(target)).toBeCloseTo(target - offset, 3);
  });

  it("keeps media time when EPG live has no wall offset", () => {
    const m = seekBarModel({
      ...base,
      live: true,
      seekable: false,
      unixOffset: null,
      time: 42,
      programme,
    });
    expect(m.toMedia(100)).toBe(42);
  });
});

describe("dedupeProgrammes", () => {
  it("removes duplicate schedule rows", () => {
    const row = { ...programme };
    expect(dedupeProgrammes([row, row])).toHaveLength(1);
  });
});

describe("programmeSubtitle", () => {
  const channel: Channel = {
    id: "a",
    name: "Acme",
    url: "https://example.com/a.m3u8",
    sourceFile: "a.toml",
    sourceKind: "toml",
    editable: false,
  };

  it("returns the current programme title", () => {
    expect(programmeSubtitle(channel, () => programme)).toBe("News at Eight");
    expect(programmeSubtitle(channel, () => null)).toBeUndefined();
  });
});

describe("channel search helpers", () => {
  const channel: Channel = {
    id: "a",
    name: "Acme News",
    url: "https://example.com/a.m3u8",
    group: "United States",
    country: "US",
    chno: "7",
    sourceFile: "a.toml",
    sourceKind: "toml",
    editable: false,
  };

  it("builds a searchable haystack", () => {
    expect(channelSearchHaystack(channel)).toContain("acme");
    expect(channelSearchHaystack(channel)).toContain("united states");
  });

  it("matches non-empty queries and rejects blanks", () => {
    expect(channelMatchesSearch(channel, "acme")).toBe(true);
    expect(channelMatchesSearch(channel, "   ")).toBe(false);
  });

  it("builds haystacks without optional metadata", () => {
    const sparse: Channel = {
      id: "s",
      name: "Sparse",
      url: "https://example.com/s.m3u8",
      sourceFile: "s.toml",
      sourceKind: "toml",
      editable: false,
    };
    expect(channelSearchHaystack(sparse)).toContain("sparse");
  });
});

describe("orderedKeys", () => {
  it("sorts keys and keeps the tail bucket last", () => {
    const map = new Map<string, Channel[]>([
      ["Zulu", []],
      ["Alpha", []],
      ["Other", []],
    ]);
    expect(orderedKeys(map, "Other")).toEqual(["Alpha", "Zulu", "Other"]);
  });
});
