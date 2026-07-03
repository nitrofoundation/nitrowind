import { useCallback, useEffect, useRef, useState } from "react";
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";

/**
 * Shared main-axis windowing math for every NitroList variant — a TS mirror of
 * the C++ `Virtualizer` + `ViewportCuller` (kept in JS for the milestone-1
 * cut; the native engine takes over in the native milestone). Owns measured
 * item sizes, prefix offsets, live scroll offset and viewport extent, and emits
 * the inclusive `[first, last]` window. Variants decide what to DO with the
 * window (render-only, keep-alive, or template fill); they never re-implement
 * this.
 */

export interface VirtualWindowConfig {
  count: number;
  estimatedItemSize: number;
  gap: number;
  horizontal: boolean;
  /** px kept mounted on EACH edge beyond the viewport. */
  drawDistance: number;
}

export interface VirtualWindowState {
  /** Inclusive index window to keep mounted/shown. */
  first: number;
  last: number;
  /** Exact main-axis content extent (for the scroll spacer). */
  contentSize: number;
  viewportExtent: number;
  scrollOffset: number;
  offsetOf: (index: number) => number;
  sizeOf: (index: number) => number;
  handleScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  handleScrollerLayout: (e: LayoutChangeEvent) => void;
  measureItem: (index: number, size: number) => void;
}

interface Snapshot {
  first: number;
  last: number;
  contentSize: number;
  viewportExtent: number;
  scrollOffset: number;
}

export function useVirtualWindow(cfg: VirtualWindowConfig): VirtualWindowState {
  const { count, estimatedItemSize, gap, horizontal, drawDistance } = cfg;

  const sizes = useRef<number[]>([]);
  const offsets = useRef<number[]>([0]); // offsets[i] = start of item i; length count+1
  const scrollOffset = useRef(0);
  const viewport = useRef(0);

  // Keep the sizes array length in sync with `count`, preserving measures for
  // indices that still exist (bidirectional data growth safe).
  if (sizes.current.length !== count) {
    const next = new Array<number>(count);
    for (let i = 0; i < count; i++) {
      next[i] = i < sizes.current.length ? sizes.current[i]! : estimatedItemSize;
    }
    sizes.current = next;
    offsets.current = buildOffsets(next, gap);
  }

  const [snap, setSnap] = useState<Snapshot>(() => ({
    first: 0,
    last: 0,
    contentSize: 0,
    viewportExtent: 0,
    scrollOffset: 0,
  }));

  const recompute = useCallback(() => {
    const off = offsets.current;
    const content = off.length > 1 ? off[count]! - gap : 0;
    const start = scrollOffset.current - drawDistance;
    const end = scrollOffset.current + viewport.current + drawDistance;
    const first = indexAt(off, count, Math.max(0, start));
    const last = Math.max(first, indexAt(off, count, Math.max(0, end)));
    setSnap((prev) => {
      if (
        prev.first === first &&
        prev.last === last &&
        prev.contentSize === content &&
        prev.viewportExtent === viewport.current &&
        prev.scrollOffset === scrollOffset.current
      ) {
        return prev;
      }
      return {
        first,
        last,
        contentSize: content,
        viewportExtent: viewport.current,
        scrollOffset: scrollOffset.current,
      };
    });
  }, [count, gap, drawDistance]);

  // Recompute once inputs (count/gap/estimate) settle.
  useEffect(recompute, [recompute]);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const o = e.nativeEvent.contentOffset;
      scrollOffset.current = horizontal ? o.x : o.y;
      recompute();
    },
    [horizontal, recompute],
  );

  const handleScrollerLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const l = e.nativeEvent.layout;
      viewport.current = horizontal ? l.width : l.height;
      recompute();
    },
    [horizontal, recompute],
  );

  const measureItem = useCallback(
    (index: number, size: number) => {
      if (index < 0 || index >= count) return;
      if (Math.abs((sizes.current[index] ?? 0) - size) < 0.5) return;
      sizes.current[index] = size;
      offsets.current = buildOffsets(sizes.current, gap);
      recompute();
    },
    [count, gap, recompute],
  );

  const offsetOf = useCallback(
    (index: number) => offsets.current[Math.min(Math.max(index, 0), count)] ?? 0,
    [count],
  );
  const sizeOf = useCallback(
    (index: number) => sizes.current[index] ?? estimatedItemSize,
    [estimatedItemSize],
  );

  return {
    first: snap.first,
    last: snap.last,
    contentSize: snap.contentSize,
    viewportExtent: snap.viewportExtent,
    scrollOffset: snap.scrollOffset,
    offsetOf,
    sizeOf,
    handleScroll,
    handleScrollerLayout,
    measureItem,
  };
}

/** Prefix offsets: offsets[i] = sum of (size+gap) for items before i. */
function buildOffsets(sizes: number[], gap: number): number[] {
  const off = new Array<number>(sizes.length + 1);
  off[0] = 0;
  for (let i = 0; i < sizes.length; i++) off[i + 1] = off[i]! + sizes[i]! + gap;
  return off;
}

/** Largest index whose start offset ≤ pos, clamped to [0, count-1]. */
function indexAt(offsets: number[], count: number, pos: number): number {
  if (count === 0) return 0;
  let lo = 0;
  let hi = count - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid]! <= pos) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}
