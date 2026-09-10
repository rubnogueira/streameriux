import { useCallback, useRef, useState, type RefObject } from "react";
import { useGpuixRequired } from "@gpuix/react";
import { useExternalSnapshot } from "../../lib/react-sync";
import type { PublicInstance } from "@gpuix/react";
import type { EventPayload } from "@gpuix/native";
import { dragRouter } from "../focus";
import { C, FONT, LIVE_EDGE_SNAP } from "../theme";

type PaintedBounds = [number, number, number, number];

export const SCRUB_TRACK_HEIGHT = 36;
export const SCRUB_BAR_HEIGHT = 4;
export const SCRUB_THUMB_SIZE = 14;

export function readElementBounds(
  el: PublicInstance | null,
  renderer: { getElementBounds?: (id: number) => number[] | null },
): PaintedBounds | null {
  if (!el || typeof renderer.getElementBounds !== "function") return null;
  try {
    const box = renderer.getElementBounds(el.id);
    if (box && box.length >= 4 && box[2]! > 0) return [box[0]!, box[1]!, box[2]!, box[3]!];
  } catch {
    // Native mouse callbacks can temporarily borrow the renderer.
  }
  return null;
}

export function ratioFromEvent(event: EventPayload, bounds: PaintedBounds | null): number | null {
  if (event.x == null || !bounds) return null;
  const [x, , width] = bounds;
  if (!width) return null;
  return Math.min(1, Math.max(0, (event.x - x) / width));
}

export function thumbLeftPx(trackWidth: number, ratio: number): number {
  if (trackWidth <= 0) return 0;
  const center = ratio * trackWidth;
  return Math.max(0, Math.min(trackWidth - SCRUB_THUMB_SIZE, center - SCRUB_THUMB_SIZE / 2));
}

export function finishSeekDrag({
  dragging,
  ratioAt,
  event,
  commit,
  start,
  end,
  span,
  scrubRef,
  setScrub,
  setPendingSeek,
  onSeek,
}: {
  dragging: { current: boolean };
  ratioAt: (event: EventPayload) => number | null;
  event: EventPayload;
  commit: boolean;
  start: number;
  end: number;
  span: number;
  scrubRef: { current: number | null };
  setScrub: (value: number | null) => void;
  setPendingSeek: (value: number | null) => void;
  onSeek: (time: number) => void;
}): void {
  if (!dragging.current) return;
  dragging.current = false;
  dragRouter.current = null;
  const value = ratioAt(event);
  const next = value == null ? scrubRef.current : start + value * span;
  if (next == null) {
    scrubRef.current = null;
    setScrub(null);
    return;
  }
  const clamped = Math.min(end, Math.max(start, next));
  if (commit) {
    setPendingSeek(clamped);
    scrubRef.current = null;
    setScrub(null);
    onSeek(clamped);
  } else {
    scrubRef.current = null;
    setScrub(null);
  }
}

export function primarySeekPointerDown(
  event: EventPayload,
  disabled: boolean,
  beginDrag: (event: EventPayload) => void,
): void {
  if (event.button != null && event.button !== 0) return;
  if (disabled) return;
  beginDrag(event);
}

export function startSeekDrag({
  dragging,
  disabled,
  ratioAt,
  event,
  start,
  span,
  setPendingSeek,
  setScrubValue,
  endDrag,
}: {
  dragging: { current: boolean };
  disabled: boolean;
  ratioAt: (event: EventPayload) => number | null;
  event: EventPayload;
  start: number;
  span: number;
  setPendingSeek: (value: number | null) => void;
  setScrubValue: (value: number) => void;
  endDrag: (event: EventPayload, commit: boolean) => void;
}): void {
  if (disabled) return;
  const value = ratioAt(event);
  if (value == null) return;
  setPendingSeek(null);
  setScrubValue(start + value * span);
  dragRouter.current = {
    move: (moveEvent) => {
      if (!dragging.current || disabled) return;
      const moveValue = ratioAt(moveEvent);
      if (moveValue == null) return;
      setScrubValue(start + moveValue * span);
    },
    end: (endEvent) => endDrag(endEvent, true),
  };
}

export function usePaintedBounds(ref: RefObject<PublicInstance | null>) {
  const renderer = useGpuixRequired() as { getElementBounds?: (id: number) => number[] | null };
  const boundsRef = useRef<PaintedBounds | null>(null);
  const listenerRef = useRef<(() => void) | null>(null);

  const notifyIfWidthChanged = useCallback(() => {
    const widthBefore = boundsRef.current?.[2] ?? -1;
    const next = readElementBounds(ref.current, renderer);
    if (next) boundsRef.current = next;
    const widthAfter = boundsRef.current?.[2] ?? -1;
    if (widthAfter !== widthBefore) listenerRef.current?.();
  }, [renderer, ref]);

  const sample = useCallback(() => {
    notifyIfWidthChanged();
    return boundsRef.current;
  }, [notifyIfWidthChanged]);

  const trackWidth = useExternalSnapshot(
    (onStoreChange) => {
      listenerRef.current = onStoreChange;
      notifyIfWidthChanged();
      return () => {
        listenerRef.current = null;
      };
    },
    () => {
      const next = readElementBounds(ref.current, renderer);
      if (next) boundsRef.current = next;
      return next?.[2] ?? boundsRef.current?.[2] ?? 0;
    },
    () => 0,
  );

  const attachRef = useCallback(
    (node: PublicInstance | null) => {
      ref.current = node;
      if (!node) return;
      queueMicrotask(() => notifyIfWidthChanged());
    },
    [ref, notifyIfWidthChanged],
  );

  return { boundsRef, sample, trackWidth, attachRef };
}

export function SeekBar({
  time,
  start,
  end,
  ready,
  seekable,
  pinLive,
  startLabel,
  endLabel,
  onSeek,
}: {
  time: number;
  start: number;
  end: number;
  ready: boolean;
  /** Show the draggable rewind circle and allow scrubbing. */
  seekable: boolean;
  /** Pin the thumb (full red fill) to the live edge when the playhead is near it. */
  pinLive: boolean;
  startLabel: string;
  endLabel: string;
  /** Called with a display-timeline value; the caller maps it to a media timestamp. */
  onSeek: (time: number) => void;
}) {
  const trackRef = useRef<PublicInstance | null>(null);
  const { boundsRef, sample, trackWidth, attachRef } = usePaintedBounds(trackRef);
  const [scrub, setScrub] = useState<number | null>(null);
  const scrubRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const [pendingSeek, setPendingSeek] = useState<number | null>(null);
  const disabled = !ready || !seekable;
  const span = Math.max(0.001, end - start);
  const scrubbing = scrub != null;
  const shown = scrub ?? pendingSeek ?? time;
  const rawRatio = Math.min(1, Math.max(0, (shown - start) / span));
  const nearLive = pinLive && end - shown <= LIVE_EDGE_SNAP;
  const ratio = nearLive && !scrubbing ? 1 : rawRatio;
  const layoutWidth = trackWidth || (boundsRef.current?.[2] ?? 0);
  const fillWidth = layoutWidth > 0 ? ratio * layoutWidth : 0;
  const thumbLeft = thumbLeftPx(layoutWidth, ratio);
  const showProgress = ready;
  const showThumb = ready && layoutWidth > 0 && seekable;

  if (pendingSeek != null && Math.abs(time - pendingSeek) < 0.35) {
    setPendingSeek(null);
  }

  const ratioAt = useCallback(
    (event: EventPayload): number | null => {
      const bounds = sample() ?? boundsRef.current;
      return ratioFromEvent(event, bounds);
    },
    [sample, boundsRef],
  );

  const setScrubValue = useCallback((next: number) => {
    scrubRef.current = next;
    setScrub(next);
  }, []);

  const endDrag = useCallback(
    (event: EventPayload, commit: boolean) => {
      finishSeekDrag({
        dragging: draggingRef,
        ratioAt,
        event,
        commit,
        start,
        end,
        span,
        scrubRef,
        setScrub,
        setPendingSeek,
        onSeek,
      });
    },
    [end, onSeek, ratioAt, span, start],
  );

  const beginDrag = useCallback(
    (event: EventPayload) => {
      if (disabled) return;
      draggingRef.current = true;
      startSeekDrag({
        dragging: draggingRef,
        disabled,
        ratioAt,
        event,
        start,
        span,
        setPendingSeek,
        setScrubValue,
        endDrag,
      });
    },
    [disabled, endDrag, ratioAt, setScrubValue, span, start],
  );

  const thumbTop = (SCRUB_TRACK_HEIGHT - SCRUB_THUMB_SIZE) / 2;
  const barTop = (SCRUB_TRACK_HEIGHT - SCRUB_BAR_HEIGHT) / 2;

  return (
    <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 10 }}>
        <text style={{ fontSize: 11, fontFamily: FONT, color: C.secondary, width: 72 }}>
          {startLabel}
        </text>
        <div
          ref={attachRef}
          testId="seek-bar"
          onMouseDown={(event) => {
            primarySeekPointerDown(event, disabled, beginDrag);
          }}
          style={{
            flexGrow: 1,
            height: SCRUB_TRACK_HEIGHT,
            position: "relative",
            cursor: disabled ? "default" : "pointer",
            // GPUI only hit-tests filled regions; keep the track clickable.
            backgroundColor: disabled ? undefined : "#FFFFFF01",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: barTop,
              height: SCRUB_BAR_HEIGHT,
              borderRadius: 2,
              backgroundColor: C.track,
              pointerEvents: "none",
            }}
          />
          {showProgress ? (
            <div
              style={{
                position: "absolute",
                left: fillWidth,
                right: 0,
                top: barTop,
                height: SCRUB_BAR_HEIGHT,
                borderRadius: 2,
                backgroundColor: C.trackFuture,
                pointerEvents: "none",
              }}
            />
          ) : null}
          {showProgress ? (
            <div
              style={{
                position: "absolute",
                left: 0,
                top: barTop,
                width: fillWidth,
                height: SCRUB_BAR_HEIGHT,
                borderRadius: 2,
                backgroundColor: nearLive && !scrubbing ? C.live : C.accent,
                pointerEvents: "none",
              }}
            />
          ) : null}
          {showThumb ? (
            <div
              testId="seek-thumb"
              style={{
                position: "absolute",
                left: thumbLeft,
                top: thumbTop,
                width: SCRUB_THUMB_SIZE,
                height: SCRUB_THUMB_SIZE,
                borderRadius: SCRUB_THUMB_SIZE / 2,
                backgroundColor: C.thumb,
                pointerEvents: "none",
              }}
            />
          ) : null}
        </div>
        <text
          style={{
            fontSize: 11,
            fontFamily: FONT,
            color: C.secondary,
            width: 72,
            textAlign: "right",
          }}
        >
          {endLabel}
        </text>
      </div>
    </div>
  );
}
