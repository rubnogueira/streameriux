import { describe, expect, it, vi } from "vitest";
import type { PublicInstance } from "@gpuix/react";
import { scheduleScrollToItem, visibleRangeStart } from "./list-scroll";

describe("list-scroll helpers", () => {
  it("visibleRangeStart ignores null and applies overscan", () => {
    expect(visibleRangeStart(null, 16)).toBeNull();
    expect(visibleRangeStart(20, 16)).toBe(4);
    expect(visibleRangeStart(2, 16)).toBe(0);
  });

  it("scheduleScrollToItem no-ops without a target or API", () => {
    vi.useFakeTimers();
    scheduleScrollToItem(null, 3, () => {}, 48);
    scheduleScrollToItem({ id: 1 } as PublicInstance, null, () => {}, 48);
    scheduleScrollToItem({ id: 1 } as PublicInstance, 3, undefined, 48);
    vi.runAllTimers();
    vi.useRealTimers();
  });

  it("scheduleScrollToItem scrolls and swallows layout errors", () => {
    vi.useFakeTimers();
    const scrollToItem = vi
      .fn()
      .mockImplementationOnce(() => {})
      .mockImplementationOnce(() => {
        throw new Error("layout");
      });
    scheduleScrollToItem({ id: 9 } as PublicInstance, 5, scrollToItem, 60);
    vi.runAllTimers();
    scheduleScrollToItem({ id: 9 } as PublicInstance, 5, scrollToItem, 60);
    vi.runAllTimers();
    expect(scrollToItem).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
