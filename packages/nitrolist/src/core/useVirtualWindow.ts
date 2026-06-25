import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  I18nManager,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { getNativeRegistry } from "./native";
import type {
  NativeRangeResult,
  NormalizedChild,
  Range,
  ScrollMetrics,
} from "./types";

export interface UseVirtualWindowOptions {
  children: React.ReactNode;
  horizontal: boolean;
  initialScrollIndex: number;
  onVisibleRangeChange?: (range: Range) => void;
}

let nextListId = 1;

function normalizeChildren(children: React.ReactNode): NormalizedChild[] {
  return React.Children.toArray(children).map((child, index) => {
    const key = React.isValidElement(child) ? child.key : null;
    return {
      index,
      key: key == null ? String(index) : String(key),
      element: child,
    };
  });
}

export function useVirtualWindow({
  children,
  horizontal,
  initialScrollIndex,
  onVisibleRangeChange,
}: UseVirtualWindowOptions) {
  const listId = useRef(`nitrolist-${nextListId++}`).current;
  const warnedMissingNative = useRef(false);
  const normalized = useMemo(() => normalizeChildren(children), [children]);
  const keys = useMemo(
    () => normalized.map((child) => child.key),
    [normalized],
  );
  const lastOffset = useRef(0);
  const viewportLength = useRef(0);
  const [window, setWindow] = useState<NativeRangeResult>({
    first: Math.max(0, Math.floor(initialScrollIndex)),
    last: Math.max(0, Math.floor(initialScrollIndex)),
    leadingSpacer: 0,
    trailingSpacer: 0,
  });

  React.useEffect(() => {
    const native = getNativeRegistry();
    if (!native && !warnedMissingNative.current) {
      warnedMissingNative.current = true;
      console.error(
        "nitrolist native registry is unavailable; LazyStack needs the C++ engine to calculate its render window.",
      );
    }
    native?.registerList(listId, {
      itemCount: keys.length,
      horizontal,
      initialScrollIndex,
    });
    native?.updateItemCount(listId, keys.length);
    return () => native?.unregisterList(listId);
  }, [horizontal, initialScrollIndex, keys.length, listId]);

  const applyRange = useCallback(
    (next: NativeRangeResult | undefined) => {
      if (!next) return;
      setWindow((current) => {
        if (
          current.first === next.first &&
          current.last === next.last &&
          current.leadingSpacer === next.leadingSpacer &&
          current.trailingSpacer === next.trailingSpacer
        ) {
          return current;
        }
        onVisibleRangeChange?.(next);
        return next;
      });
    },
    [onVisibleRangeChange],
  );

  const computeRange = useCallback(
    (scrollMetrics: ScrollMetrics) => {
      const native = getNativeRegistry();
      applyRange(native?.updateScrollMetrics(listId, scrollMetrics));
    },
    [applyRange, listId],
  );

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const nativeEvent = event.nativeEvent;
      const timestamp = Date.now();
      const offset = horizontal
        ? nativeEvent.contentOffset.x
        : nativeEvent.contentOffset.y;
      const flowOffset =
        horizontal && I18nManager.isRTL
          ? nativeEvent.contentSize.width -
            (offset + nativeEvent.layoutMeasurement.width)
          : offset;
      lastOffset.current = flowOffset;
      computeRange({
        offset: flowOffset,
        visibleLength: horizontal
          ? nativeEvent.layoutMeasurement.width
          : nativeEvent.layoutMeasurement.height,
        contentLength: horizontal
          ? nativeEvent.contentSize.width
          : nativeEvent.contentSize.height,
        timestamp,
        zoomScale: 1,
      });
    },
    [computeRange, horizontal],
  );

  const onViewportLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const nextLength = horizontal
        ? event.nativeEvent.layout.width
        : event.nativeEvent.layout.height;
      viewportLength.current = nextLength;
      computeRange({
        offset: lastOffset.current,
        visibleLength: nextLength,
        contentLength: 0,
        timestamp: Date.now(),
      });
    },
    [computeRange, horizontal],
  );

  const onCellLayout = useCallback(
    (index: number, event: LayoutChangeEvent) => {
      const layout = event.nativeEvent.layout;
      const key = keys[index] ?? String(index);
      applyRange(
        getNativeRegistry()?.updateCellMetrics(
          listId,
          index,
          key,
          horizontal ? layout.x : layout.y,
          horizontal ? layout.width : layout.height,
        ),
      );
    },
    [applyRange, horizontal, keys, listId],
  );

  return {
    normalized,
    range: window,
    spacers: window,
    onScroll,
    onViewportLayout,
    onCellLayout,
  };
}
