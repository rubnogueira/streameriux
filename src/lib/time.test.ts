import { describe, expect, it } from "vitest";
import { formatClock, formatEpgDay, formatPlayhead, formatTime24, formatEpgRange } from "./time";

describe("time labels", () => {
  it("formats a media clock", () => {
    expect(formatClock(75)).toBe("1:15");
    expect(formatClock(3723)).toBe("1:02:03");
  });

  it("uses a 24-hour clock for live unix timestamps", () => {
    const noon = Date.UTC(2026, 0, 1, 12, 5, 9) / 1000;
    const label = formatTime24(noon);
    expect(label).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(formatPlayhead(noon, { live: true, unix: true })).toBe(label);
    expect(formatPlayhead(90, { live: false, unix: false })).toBe("1:30");
  });

  it("formats EPG ranges with day labels", () => {
    const now = new Date(2026, 8, 9, 12, 0, 0).getTime();
    const start = new Date(2026, 8, 9, 20, 0, 0).getTime();
    const stop = new Date(2026, 8, 9, 21, 0, 0).getTime();
    expect(formatEpgRange(start, stop, now)).toBe("Today · 20:00:00 – 21:00:00");

    const nextStart = new Date(2026, 8, 10, 1, 0, 0).getTime();
    const nextStop = new Date(2026, 8, 10, 2, 0, 0).getTime();
    expect(formatEpgRange(nextStart, nextStop, now)).toBe("Tomorrow · 01:00:00 – 02:00:00");

    const later = new Date(2026, 8, 12, 15, 0, 0).getTime();
    expect(formatEpgDay(later, now)).toMatch(/Sep/);

    const spanStart = new Date(2026, 8, 9, 22, 0, 0).getTime();
    const spanStop = new Date(2026, 8, 10, 1, 0, 0).getTime();
    expect(formatEpgRange(spanStart, spanStop, now)).toMatch(/Today .* – Tomorrow/);
  });
});
