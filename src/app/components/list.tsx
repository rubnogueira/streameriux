import { useCallback, useRef, useState, type ReactNode } from "react";
import { useGpuixRequired } from "@gpuix/react";
import type { PublicInstance } from "@gpuix/react";

import { scheduleScrollToItem, visibleRangeStart } from "./list-scroll";

const OVERSCAN = 16;
const MIN_WINDOW = 96;

export function applyVisibleRange(
  startIndex: number | null | undefined,
  setStart: (update: (current: number) => number) => void,
): void {
  const next = visibleRangeStart(startIndex, OVERSCAN);
  if (next == null) return;
  setStart((current) => (current === next ? current : next));
}

export function WindowedList({
  count,
  estimatedItemHeight,
  renderRow,
  listKey,
  scrollToIndex,
}: {
  count: number;
  estimatedItemHeight: number;
  renderRow: (index: number) => ReactNode;
  listKey: string;
  scrollToIndex?: number | null;
}) {
  const listRef = useRef<PublicInstance | null>(null);
  const renderer = useGpuixRequired() as {
    scrollToItem?: (id: number, index: number, offset?: number) => void;
  };
  const [start, setStart] = useState(0);
  const [prevListKey, setPrevListKey] = useState(listKey);
  const [prevScrollToIndex, setPrevScrollToIndex] = useState(scrollToIndex);

  // A new list (group switch, new search) starts from the top unless scrollToIndex is set.
  if (listKey !== prevListKey || scrollToIndex !== prevScrollToIndex) {
    setPrevListKey(listKey);
    setPrevScrollToIndex(scrollToIndex);
    setStart(
      scrollToIndex != null && scrollToIndex >= 0
        ? Math.max(0, scrollToIndex - Math.floor(MIN_WINDOW / 2))
        : 0,
    );
  }

  const attachListRef = useCallback(
    (el: PublicInstance | null) => {
      listRef.current = el;
      scheduleScrollToItem(el, scrollToIndex, renderer.scrollToItem, estimatedItemHeight);
    },
    [listKey, scrollToIndex, renderer, estimatedItemHeight],
  );

  const windowSize = Math.max(MIN_WINDOW, OVERSCAN * 3);
  const clampedStart = Math.max(0, Math.min(start, Math.max(0, count - 1)));
  const end = Math.min(count, clampedStart + windowSize);
  const indices: number[] = [];
  for (let i = clampedStart; i < end; i++) indices.push(i);

  return (
    <virtual-list
      ref={attachListRef}
      key={listKey}
      itemCount={count}
      estimatedItemHeight={estimatedItemHeight}
      windowStart={clampedStart}
      onVisibleRange={(event) => {
        applyVisibleRange(event.startIndex, setStart);
      }}
      style={{ flexGrow: 1, minHeight: 0, paddingLeft: 8, paddingRight: 8 }}
    >
      {indices.map((index) => (
        <div key={index}>{renderRow(index)}</div>
      ))}
    </virtual-list>
  );
}
