import { describe, expect, it, vi } from "vitest";
import { applyVisibleRange } from "./list";

describe("applyVisibleRange", () => {
  it("ignores invalid ranges and updates when the window moves", () => {
    const setStart = vi.fn();
    applyVisibleRange(undefined, setStart);
    expect(setStart).not.toHaveBeenCalled();

    applyVisibleRange(40, setStart);
    expect(setStart).toHaveBeenCalled();
    const updater = setStart.mock.calls[0]![0] as (current: number) => number;
    expect(updater(40)).toBe(24);
    expect(updater(24)).toBe(24);
  });
});
