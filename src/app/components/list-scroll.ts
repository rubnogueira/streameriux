import type { PublicInstance } from "@gpuix/react";

/** Scroll a virtual list row into view once the list node is attached. */
export function scheduleScrollToItem(
  el: PublicInstance | null,
  scrollToIndex: number | null | undefined,
  scrollToItem: ((id: number, index: number, offset?: number) => void) | undefined,
  estimatedItemHeight: number,
): void {
  if (!el || scrollToIndex == null || scrollToIndex < 0) return;
  if (!scrollToItem) return;
  setTimeout(() => {
    try {
      scrollToItem(el.id, scrollToIndex, Math.floor(estimatedItemHeight / 3));
    } catch {
      // Scroll is best-effort while the list is still laying out.
    }
  }, 0);
}

export function visibleRangeStart(
  startIndex: number | null | undefined,
  overscan: number,
): number | null {
  if (startIndex == null) return null;
  return Math.max(0, startIndex - overscan);
}
