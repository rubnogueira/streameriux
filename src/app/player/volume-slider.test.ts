import { describe, expect, it, vi } from "vitest";
import { dragRouter } from "../focus";
import { ratioFromEvent } from "./seek-bar";
import { applyVolumePointer, finishVolumePointerDrag } from "./volume-slider";

describe("volume slider helpers", () => {
  it("applyVolumePointer ignores missing ratios", () => {
    const onChange = vi.fn();
    applyVolumePointer({}, () => null, { current: null }, onChange);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("applyVolumePointer maps pointer position to volume", () => {
    const onChange = vi.fn();
    const bounds: [number, number, number, number] = [0, 0, 100, 8];
    applyVolumePointer({ x: 25 }, () => bounds, { current: bounds }, onChange);
    expect(onChange).toHaveBeenCalledWith(0.25);
  });

  it("finishVolumePointerDrag ends active drags", () => {
    const dragging = { current: false };
    const apply = vi.fn();
    finishVolumePointerDrag(dragging, apply, { x: 1 });
    expect(apply).not.toHaveBeenCalled();

    dragging.current = true;
    dragRouter.current = { move: vi.fn(), end: vi.fn() };
    finishVolumePointerDrag(dragging, apply, { x: 10 });
    expect(dragging.current).toBe(false);
    expect(dragRouter.current).toBeNull();
    expect(apply).toHaveBeenCalled();
  });
});
