import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Dimensions, findNodeHandle, ScrollView, View } from "react-native";
import type { LayoutChangeEvent } from "react-native";
import type { NitroListProps, NitroListRef } from "../core/types";

/**
 * NitroList - native, UI-thread virtualized list (see
 * `docs/nitrolist/ui-thread-engine.md`).
 *
 * JS renders a real `ScrollView` and progressively commits each cell's React
 * subtree once, each in a `collapsable={false}` host so it has a stable Fabric
 * node. JS reports only cold-path facts through the JSI channel: the list
 * config, each cell's Fabric tag, and the scroll view's tag to attach to. From
 * there the per-frame loop is entirely native/UI-thread: a
 * `UIScrollViewDelegate` observer -> C++ `ListEngine` -> `view.hidden` toggle,
 * with no internal JS `onScroll` and no React re-render per scroll frame.
 */

declare global {
  // eslint-disable-next-line no-var
  var __nitrolistConfigure:
    | ((
        listId: number,
        count: number,
        estimatedSize: number,
        gap: number,
        prerenderRatio: number,
      ) => void)
    | undefined;
  // eslint-disable-next-line no-var
  var __nitrolistSetCell:
    | ((listId: number, index: number, tag: number) => void)
    | undefined;
  // eslint-disable-next-line no-var
  var __nitrolistSetCellSize:
    | ((listId: number, index: number, size: number) => void)
    | undefined;
  // eslint-disable-next-line no-var
  var __nitrolistAttach:
    | ((listId: number, scrollViewTag: number, horizontal: boolean) => void)
    | undefined;
  // eslint-disable-next-line no-var
  var __nitrolistRemove: ((listId: number) => void) | undefined;
}

let nextListId = 1;

const DEFAULT_PRERENDER_RATIO = 0.5;
const MIN_INITIAL_CELLS = 12;
const COMMIT_BATCH_SIZE = 24;
const COMMIT_BATCH_DELAY_MS = 32;

function positiveSlotSize(estimatedItemSize: number, mainAxisGap: number) {
  return Math.max(1, estimatedItemSize + mainAxisGap);
}

function Impl<T>(props: NitroListProps<T>, ref: React.Ref<NitroListRef>) {
  const {
    data,
    keyExtractor,
    renderItem,
    horizontal = false,
    estimatedItemSize = 50,
    mainAxisGap = 0,
    drawDistance,
    onScroll,
    scrollEventThrottle,
    style,
    contentContainerStyle,
    testID,
    ListHeaderComponent,
    ListFooterComponent,
    ListEmptyComponent,
  } = props;

  const scrollRef = useRef<ScrollView>(null);
  const listId = useRef<number>(0);
  if (listId.current === 0) listId.current = nextListId++;

  const cellTags = useRef<Map<number, number>>(new Map());
  const initialViewportExtent = horizontal
    ? Dimensions.get("window").width
    : Dimensions.get("window").height;
  const [viewportExtent, setViewportExtent] = useState(initialViewportExtent);
  const slotSize = positiveSlotSize(estimatedItemSize, mainAxisGap);
  const overscanPx =
    drawDistance ?? viewportExtent * DEFAULT_PRERENDER_RATIO;
  const initialCommitCount = Math.min(
    data.length,
    Math.max(
      MIN_INITIAL_CELLS,
      Math.ceil((viewportExtent + overscanPx * 2) / slotSize),
    ),
  );
  const [committedCount, setCommittedCount] = useState(initialCommitCount);
  const committedCountRef = useRef(committedCount);
  committedCountRef.current = committedCount;
  const prerenderRatio =
    drawDistance == null || viewportExtent <= 0
      ? DEFAULT_PRERENDER_RATIO
      : drawDistance / viewportExtent;

  const ensureCommittedThrough = useCallback(
    (index: number) => {
      if (data.length === 0) return;
      const clampedIndex = Math.max(0, Math.min(data.length - 1, index));
      const nextCount = Math.min(
        data.length,
        clampedIndex + initialCommitCount,
      );
      if (committedCountRef.current >= nextCount) return;
      setCommittedCount((current) => Math.max(current, nextCount));
    },
    [data.length, initialCommitCount],
  );

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const nextExtent = horizontal
        ? event.nativeEvent.layout.width
        : event.nativeEvent.layout.height;
      if (nextExtent <= 0) return;
      setViewportExtent((current) =>
        Math.abs(current - nextExtent) > 1 ? nextExtent : current,
      );
    },
    [horizontal],
  );

  useEffect(() => {
    cellTags.current.forEach((_, index) => {
      if (index >= data.length) cellTags.current.delete(index);
    });
    cellSizes.current.forEach((_, index) => {
      if (index >= data.length) cellSizes.current.delete(index);
    });
    setCommittedCount((current) =>
      Math.min(data.length, Math.max(current, initialCommitCount)),
    );
  }, [data.length, initialCommitCount]);

  useEffect(() => {
    if (committedCount >= data.length) return;
    const timer = setTimeout(() => {
      setCommittedCount((current) =>
        Math.min(data.length, current + COMMIT_BATCH_SIZE),
      );
    }, COMMIT_BATCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [committedCount, data.length]);

  const reportCell = useCallback(
    (index: number) => (node: View | null) => {
      if (node == null) return;
      const tag = findNodeHandle(node);
      if (typeof tag === "number") {
        cellTags.current.set(index, tag);
        globalThis.__nitrolistSetCell?.(listId.current, index, tag);
      }
    },
    [],
  );

  // Report each cell's MEASURED main-axis size — the engine's window math is
  // only correct once real sizes replace the estimate (O(log n) per update).
  // Buffered like tags so they can be re-pushed after configure() resets the
  // engine (onLayout won't re-fire for unchanged layouts).
  const cellSizes = useRef<Map<number, number>>(new Map());
  const reportCellSize = useCallback(
    (index: number) => (event: LayoutChangeEvent) => {
      const size = horizontal
        ? event.nativeEvent.layout.width
        : event.nativeEvent.layout.height;
      if (size > 0) {
        cellSizes.current.set(index, size);
        globalThis.__nitrolistSetCellSize?.(listId.current, index, size);
      }
    },
    [horizontal],
  );

  useEffect(() => {
    let cancelled = false;
    let attempt = 0;
    const push = () => {
      if (cancelled) return;
      const ready =
        typeof globalThis.__nitrolistConfigure === "function" &&
        typeof globalThis.__nitrolistAttach === "function";
      if (!ready) {
        if (attempt++ < 200) setTimeout(push, 50);
        return;
      }
      globalThis.__nitrolistConfigure!(
        listId.current,
        data.length,
        estimatedItemSize,
        mainAxisGap,
        prerenderRatio,
      );
      cellTags.current.forEach((tag, index) => {
        globalThis.__nitrolistSetCell!(listId.current, index, tag);
      });
      cellSizes.current.forEach((size, index) => {
        globalThis.__nitrolistSetCellSize!(listId.current, index, size);
      });
      const svTag = findNodeHandle(scrollRef.current);
      if (typeof svTag === "number") {
        globalThis.__nitrolistAttach!(listId.current, svTag, horizontal);
      }
    };
    push();
    const id = listId.current;
    return () => {
      cancelled = true;
      globalThis.__nitrolistRemove?.(id);
    };
  }, [data.length, horizontal, estimatedItemSize, mainAxisGap, prerenderRatio]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToOffset: ({ offset, animated }) => {
        ensureCommittedThrough(Math.floor(Math.max(0, offset) / slotSize));
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo(
            horizontal ? { x: offset, animated } : { y: offset, animated },
          );
        });
      },
      scrollToIndex: ({ index, animated }) => {
        const clampedIndex = Math.max(0, Math.min(data.length - 1, index));
        ensureCommittedThrough(clampedIndex);
        const offset = clampedIndex * slotSize;
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo(
            horizontal ? { x: offset, animated } : { y: offset, animated },
          );
        });
      },
      scrollToEnd: (o) => {
        setCommittedCount(data.length);
        requestAnimationFrame(() => scrollRef.current?.scrollToEnd(o));
      },
      getNativeScrollRef: () => scrollRef.current,
    }),
    [data.length, ensureCommittedThrough, horizontal, slotSize],
  );

  const isEmpty = data.length === 0;
  const renderedCount = isEmpty
    ? 0
    : Math.min(data.length, committedCount);
  const tailSpacerSize = Math.max(0, data.length - renderedCount) * slotSize;
  const tailSpacerStyle = horizontal
    ? { width: tailSpacerSize }
    : { height: tailSpacerSize };

  return (
    <ScrollView
      ref={scrollRef}
      horizontal={horizontal}
      style={style}
      contentContainerStyle={contentContainerStyle}
      testID={testID}
      onLayout={handleLayout}
      onScroll={onScroll}
      scrollEventThrottle={scrollEventThrottle}
    >
      {ListHeaderComponent}
      {isEmpty
        ? ListEmptyComponent
        : data.slice(0, renderedCount).map((item, index) => {
            const k = keyExtractor(item, index);
            return (
              <View
                key={k}
                collapsable={false}
                ref={reportCell(index)}
                onLayout={reportCellSize(index)}
              >
                {renderItem({ item, index, itemKey: k })}
              </View>
            );
          })}
      {!isEmpty && tailSpacerSize > 0 ? <View style={tailSpacerStyle} /> : null}
      {ListFooterComponent}
    </ScrollView>
  );
}

export const NitroList = forwardRef(Impl) as <T>(
  props: NitroListProps<T> & { ref?: React.Ref<NitroListRef> },
) => React.ReactElement;
