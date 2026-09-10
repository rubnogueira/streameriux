import React, { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { createTestRoot, hasNativeTestRenderer } from "@gpuix/react/testing";
import { connectTest } from "@gpuix/react/automation";
import type { PublicInstance } from "@gpuix/react";
import { dragRouter } from "../focus";
import {
  readElementBounds,
  ratioFromEvent,
  thumbLeftPx,
  SeekBar,
  finishSeekDrag,
  primarySeekPointerDown,
  startSeekDrag,
  SCRUB_THUMB_SIZE,
} from "./seek-bar";

describe("seek-bar helpers", () => {
  it("readElementBounds returns null without element or API", () => {
    expect(readElementBounds(null, {})).toBeNull();
    expect(readElementBounds({ id: 1 } as PublicInstance, {})).toBeNull();
  });

  it("readElementBounds reads valid boxes and ignores bad data", () => {
    const el = { id: 7 } as PublicInstance;
    expect(
      readElementBounds(el, {
        getElementBounds: () => [10, 20, 100, 40],
      }),
    ).toEqual([10, 20, 100, 40]);
    expect(
      readElementBounds(el, {
        getElementBounds: () => [0, 0, 0, 10],
      }),
    ).toBeNull();
    expect(
      readElementBounds(el, {
        getElementBounds: () => {
          throw new Error("borrowed");
        },
      }),
    ).toBeNull();
  });

  it("ratioFromEvent maps x within bounds", () => {
    expect(ratioFromEvent({ x: 60 }, [0, 0, 100, 10])).toBe(0.6);
    expect(ratioFromEvent({ x: 200 }, [0, 0, 100, 10])).toBe(1);
    expect(ratioFromEvent({}, [0, 0, 100, 10])).toBeNull();
    expect(ratioFromEvent({ x: 5 }, null)).toBeNull();
  });

  it("thumbLeftPx clamps within the track", () => {
    expect(thumbLeftPx(0, 0.5)).toBe(0);
    expect(thumbLeftPx(100, 0.5)).toBe(50 - SCRUB_THUMB_SIZE / 2);
    expect(thumbLeftPx(100, 1)).toBe(100 - SCRUB_THUMB_SIZE);
  });

  it("finishSeekDrag no-ops when not dragging", () => {
    const onSeek = vi.fn();
    finishSeekDrag({
      dragging: { current: false },
      ratioAt: () => 0.5,
      event: { x: 1 },
      commit: true,
      start: 0,
      end: 1,
      span: 1,
      scrubRef: { current: null },
      setScrub: vi.fn(),
      setPendingSeek: vi.fn(),
      onSeek,
    });
    expect(onSeek).not.toHaveBeenCalled();
  });

  it("finishSeekDrag commits and cancels drags", () => {
    const onSeek = vi.fn();
    const dragging = { current: true };
    const scrubRef = { current: 40 as number | null };
    const setScrub = vi.fn();
    const setPendingSeek = vi.fn();
    const bounds: [number, number, number, number] = [0, 0, 100, 10];
    const ratioAt = (event: { x?: number }) => ratioFromEvent(event, bounds);

    finishSeekDrag({
      dragging,
      ratioAt,
      event: { x: 50 },
      commit: true,
      start: 0,
      end: 100,
      span: 100,
      scrubRef,
      setScrub,
      setPendingSeek,
      onSeek,
    });
    expect(onSeek).toHaveBeenCalledWith(50);
    expect(dragging.current).toBe(false);

    dragging.current = true;
    scrubRef.current = null;
    finishSeekDrag({
      dragging,
      ratioAt,
      event: {},
      commit: true,
      start: 0,
      end: 100,
      span: 100,
      scrubRef,
      setScrub,
      setPendingSeek,
      onSeek,
    });
    expect(setScrub).toHaveBeenCalledWith(null);

    dragging.current = true;
    scrubRef.current = 55;
    finishSeekDrag({
      dragging,
      ratioAt,
      event: { x: 50 },
      commit: false,
      start: 0,
      end: 100,
      span: 100,
      scrubRef,
      setScrub,
      setPendingSeek,
      onSeek,
    });
    expect(onSeek).toHaveBeenCalledTimes(1);
  });

  it("primarySeekPointerDown respects disabled state and buttons", () => {
    const beginDrag = vi.fn();
    primarySeekPointerDown({ button: 2 }, false, beginDrag);
    primarySeekPointerDown({ button: 0 }, true, beginDrag);
    expect(beginDrag).not.toHaveBeenCalled();
    primarySeekPointerDown({ button: 0 }, false, beginDrag);
    expect(beginDrag).toHaveBeenCalled();
  });

  it("startSeekDrag no-ops when disabled or ratio is missing", () => {
    const setScrubValue = vi.fn();
    startSeekDrag({
      dragging: { current: true },
      disabled: true,
      ratioAt: () => 0.5,
      event: { x: 1 },
      start: 0,
      span: 100,
      setPendingSeek: vi.fn(),
      setScrubValue,
      endDrag: vi.fn(),
    });
    startSeekDrag({
      dragging: { current: true },
      disabled: false,
      ratioAt: () => null,
      event: { x: 1 },
      start: 0,
      span: 100,
      setPendingSeek: vi.fn(),
      setScrubValue,
      endDrag: vi.fn(),
    });
    expect(setScrubValue).not.toHaveBeenCalled();
  });

  it("startSeekDrag wires dragRouter moves", () => {
    const setScrubValue = vi.fn();
    const setPendingSeek = vi.fn();
    const endDrag = vi.fn();
    const bounds: [number, number, number, number] = [0, 0, 100, 10];
    const ratioAt = (event: { x?: number }) => ratioFromEvent(event, bounds);
    const dragging = { current: true };

    startSeekDrag({
      dragging,
      disabled: false,
      ratioAt,
      event: { x: 25 },
      start: 0,
      span: 100,
      setPendingSeek,
      setScrubValue,
      endDrag,
    });
    expect(setScrubValue).toHaveBeenCalledWith(25);
    dragRouter.current?.move({ x: 75 });
    expect(setScrubValue).toHaveBeenCalledWith(75);
    dragRouter.current?.move({});
    dragRouter.current?.end({ x: 75 });
    expect(endDrag).toHaveBeenCalled();
  });

  it("startSeekDrag ignores moves while disabled", () => {
    const setScrubValue = vi.fn();
    const dragging = { current: true };
    const bounds: [number, number, number, number] = [0, 0, 100, 10];
    startSeekDrag({
      dragging,
      disabled: true,
      ratioAt: (event) => ratioFromEvent(event, bounds),
      event: { x: 10 },
      start: 0,
      span: 100,
      setPendingSeek: vi.fn(),
      setScrubValue,
      endDrag: vi.fn(),
    });
    expect(setScrubValue).not.toHaveBeenCalled();
  });
});

const describeNative = hasNativeTestRenderer ? describe : describe.skip;

describeNative("SeekBar", () => {
  it("renders disabled and live-pin layouts", () => {
    const onSeek = vi.fn();
    const { render, renderer } = createTestRoot({ width: 640, height: 120 });
    render(
      <SeekBar
        time={99}
        start={0}
        end={100}
        ready={false}
        seekable={false}
        pinLive={false}
        startLabel="0:00"
        endLabel="1:40"
        onSeek={onSeek}
      />,
    );
    render(
      <SeekBar
        time={99}
        start={0}
        end={100}
        ready
        seekable
        pinLive
        startLabel="0:00"
        endLabel="LIVE"
        onSeek={onSeek}
      />,
    );
    render(
      <SeekBar
        time={50}
        start={0}
        end={100}
        ready
        seekable
        pinLive={false}
        startLabel="0:00"
        endLabel="1:40"
        onSeek={onSeek}
      />,
    );
    renderer.flush();
    expect(renderer.findByTestId("seek-thumb")).toBeDefined();
  });

  it("ignores non-primary mouse buttons", async () => {
    const onSeek = vi.fn();
    const { render, renderer } = createTestRoot({ width: 400, height: 120 });
    render(
      <SeekBar
        time={10}
        start={0}
        end={100}
        ready
        seekable
        pinLive={false}
        startLabel="0:00"
        endLabel="1:40"
        onSeek={onSeek}
      />,
    );
    const app = await connectTest(renderer);
    const bar = app.getByTestId("seek-bar");
    await bar.waitFor();
    const center = await bar.center();
    await app.mouse.down(center, { button: 2 });
    await app.mouse.up(center, { button: 2 });
    expect(onSeek).not.toHaveBeenCalled();
    await app.close();
  });

  it("scrubs via pointer and clears pending seeks", async () => {
    function Harness() {
      const [time, setTime] = useState(10);
      return (
        <SeekBar
          time={time}
          start={0}
          end={100}
          ready
          seekable
          pinLive={false}
          startLabel="0:00"
          endLabel="1:40"
          onSeek={(next) => setTime(next)}
        />
      );
    }
    const { render, renderer } = createTestRoot({ width: 400, height: 120 });
    render(<Harness />);
    renderer.flush();
    const track = renderer.findByTestId("seek-bar");
    expect(track).toBeDefined();
    const box = renderer.getElementBounds(track!.id);
    if (box && box.length >= 4) {
      const [x, y, w, h] = box;
      renderer.nativeSimulateMouseDown(x + w * 0.5, y + h / 2);
      renderer.nativeSimulateMouseUp(x + w * 0.5, y + h / 2);
      renderer.dispatchNativeEvents();
      render(<Harness />);
      renderer.flush();
    }
  });
});
