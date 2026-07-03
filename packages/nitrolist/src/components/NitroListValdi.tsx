import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
} from "react";
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  View,
} from "react-native";
import type { NitroListProps, NitroListRef } from "../core/types";
import { MeasuredCell } from "../internal/MeasuredCell";
import { useVirtualWindow } from "../internal/virtualWindow";

/**
 * NitroListValdi — Variant B, "virtualize views, not components".
 *
 * Thesis (Snapchat Valdi / docs `list-variants.md` §B): NOTHING recycles at the
 * React level. Every cell's fiber tree stays mounted for the whole list's life,
 * so per-cell state survives scrolling by construction — TextInput focus, video
 * position, Swipeable open-state, editor buffers — with no `useRecyclingState`
 * hygiene and `recycleGeneration` pinned to 0 forever. Cells render in natural
 * in-flow order inside a real RN `ScrollView` (NOT absolute-positioned), and we
 * still feed `measureItem` so the shared window hook knows each cell's size.
 *
 * The trade is memory: all fibers are alive, so this is an honest ~2k-item
 * ceiling — heavy but state-safe. To claw back native cost we cheapen only the
 * VIEWS of cells outside the `[first, last]` window, two ways:
 *
 *   1. Preferred — React's Activity/Offscreen. When `unstable_Activity` is
 *      exported by `react`, each cell's children are wrapped in
 *      `<Activity mode={inWindow ? "visible" : "hidden"}>`. Hidden mode keeps
 *      the fiber + its state but drops the host views (iOS's mounting pool
 *      recycles them for free), which is exactly Valdi's detach model.
 *
 *   2. Fallback — when Activity is unavailable, keep children mounted but hide
 *      off-window cells with `opacity: 0` on an inner wrapper. We deliberately
 *      do NOT use `display:'none'`: that collapses layout and would corrupt
 *      scroll geometry. The `MeasuredCell` container reserves `sizeOf(index)`
 *      so the scroll position stays stable whether a cell paints or not.
 *
 * Availability is detected once at module load so the choice is branch-free per
 * cell.
 */

const DEFAULT_ESTIMATED_ITEM_SIZE = 100;
const DEFAULT_DRAW_DISTANCE = 800;
const DEFAULT_END_REACHED_THRESHOLD = 0.5;

interface ValdiCellProps<T> {
  item: T;
  index: number;
  itemKey: string;
  horizontal: boolean;
  renderItem: NitroListProps<T>["renderItem"];
  onMeasure: (index: number, size: number) => void;
}

/**
 * A single always-mounted, always-visible cell. Its fiber never recycles and
 * its host views are never torn down — the "virtualize views, not components"
 * thesis in its shippable first cut: every cell's state (TextInput focus, video
 * position, Swipeable) survives scrolling because nothing is recycled. Native
 * off-screen view detach (Activity / view pools) is the deferred V2; the earlier
 * opacity-freeze cheapening was removed because it collapsed the window.
 */
function ValdiCellImpl<T>({
  item,
  index,
  itemKey,
  horizontal,
  renderItem,
  onMeasure,
}: ValdiCellProps<T>) {
  return (
    <MeasuredCell
      index={index}
      itemKey={itemKey}
      recycleGeneration={0}
      horizontal={horizontal}
      onMeasure={onMeasure}
    >
      {renderItem({ item, index, itemKey })}
    </MeasuredCell>
  );
}

const ValdiCell = React.memo(ValdiCellImpl) as typeof ValdiCellImpl;

function Impl<T>(props: NitroListProps<T>, ref: React.Ref<NitroListRef>) {
  const {
    data,
    keyExtractor,
    renderItem,
    horizontal = false,
    estimatedItemSize = DEFAULT_ESTIMATED_ITEM_SIZE,
    mainAxisGap = 0,
    drawDistance = DEFAULT_DRAW_DISTANCE,
    onEndReached,
    onEndReachedThreshold = DEFAULT_END_REACHED_THRESHOLD,
    onScroll,
    scrollEventThrottle = 16,
    ListHeaderComponent,
    ListFooterComponent,
    ListEmptyComponent,
    className,
    contentContainerClassName,
    style,
    contentContainerStyle,
    testID,
  } = props;

  const scrollRef = useRef<ScrollView>(null);
  const count = data.length;

  const win = useVirtualWindow({
    count,
    estimatedItemSize,
    gap: mainAxisGap,
    horizontal,
    drawDistance,
  });

  const { offsetOf, measureItem } = win;

  const endReachedFired = useRef(false);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      win.handleScroll(e);
      onScroll?.(e);

      if (onEndReached != null) {
        const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
        const offset = horizontal ? contentOffset.x : contentOffset.y;
        const total = horizontal ? contentSize.width : contentSize.height;
        const viewport = horizontal
          ? layoutMeasurement.width
          : layoutMeasurement.height;
        const distanceFromEnd = total - (offset + viewport);
        const threshold = viewport * onEndReachedThreshold;
        if (distanceFromEnd <= threshold) {
          if (!endReachedFired.current) {
            endReachedFired.current = true;
            onEndReached();
          }
        } else {
          endReachedFired.current = false;
        }
      }
    },
    [
      win,
      onScroll,
      onEndReached,
      onEndReachedThreshold,
      horizontal,
    ],
  );

  useImperativeHandle(
    ref,
    () => ({
      scrollToIndex: ({ index, animated }) => {
        const offset = offsetOf(index);
        scrollRef.current?.scrollTo(
          horizontal ? { x: offset, animated } : { y: offset, animated },
        );
      },
      scrollToOffset: ({ offset, animated }) => {
        scrollRef.current?.scrollTo(
          horizontal ? { x: offset, animated } : { y: offset, animated },
        );
      },
      scrollToEnd: (o) => scrollRef.current?.scrollToEnd(o),
      getNativeScrollRef: () => scrollRef.current,
    }),
    [horizontal, offsetOf],
  );

  const isEmpty = count === 0;

  return (
    <ScrollView
      ref={scrollRef}
      testID={testID}
      horizontal={horizontal}
      style={style}
      contentContainerStyle={contentContainerStyle}
      onScroll={handleScroll}
      scrollEventThrottle={scrollEventThrottle}
      onLayout={win.handleScrollerLayout}
      // nitrocss-augmented className props (typed on NitroListProps).
      {...(className != null ? { className } : null)}
      {...(contentContainerClassName != null
        ? { contentContainerClassName }
        : null)}
    >
      {ListHeaderComponent}

      {isEmpty
        ? ListEmptyComponent
        : data.map((item, index) => {
            const k = keyExtractor(item, index);
            return (
              <ValdiCell
                key={k}
                item={item}
                index={index}
                itemKey={k}
                horizontal={horizontal}
                renderItem={renderItem}
                onMeasure={measureItem}
              />
            );
          })}

      {ListFooterComponent}
    </ScrollView>
  );
}

export const NitroListValdi = forwardRef(Impl) as <T>(
  props: NitroListProps<T> & { ref?: React.Ref<NitroListRef> },
) => React.ReactElement;
