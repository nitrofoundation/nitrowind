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
 * `NitroListVirtual` — the default variant, using the "render-only-window"
 * strategy (docs/nitrolist/list-variants.md variant C).
 *
 * Memory-bounded virtualization: a real RN `ScrollView` whose content container
 * is a single spacer `View` sized to the EXACT main-axis content extent (so the
 * scrollbar/scroll range are always correct), but only the cells inside the
 * inclusive `[first, last]` window emitted by `useVirtualWindow` are mounted.
 * Off-window cells are simply not rendered, so React unmounts them and their
 * memory is reclaimed. Each mounted cell is absolutely positioned at its
 * measured main-axis offset. All windowing math (offsets, sizes, viewport,
 * culling) lives in `useVirtualWindow`; this component only decides what to
 * mount and where to place it.
 */
function Impl<T>(props: NitroListProps<T>, ref: React.Ref<NitroListRef>) {
  const {
    data,
    keyExtractor,
    renderItem,
    horizontal = false,
    estimatedItemSize = 50,
    mainAxisGap = 0,
    drawDistance,
    onEndReached,
    onEndReachedThreshold = 0.5,
    onScroll: userOnScroll,
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

  const count = data.length;
  const scrollRef = useRef<ScrollView>(null);

  const {
    first,
    last,
    contentSize,
    offsetOf,
    handleScroll,
    handleScrollerLayout,
    measureItem,
  } = useVirtualWindow({
    count,
    estimatedItemSize,
    gap: mainAxisGap,
    horizontal,
    drawDistance: drawDistance ?? 500,
  });

  // Fire onEndReached once the window's tail reaches the end of the data, gated
  // by a simple viewport-fraction threshold so we don't spam near the bottom.
  const endReachedRef = useRef(false);
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      handleScroll(e);
      userOnScroll?.(e);

      if (onEndReached && count > 0) {
        const { contentOffset, layoutMeasurement, contentSize: cs } =
          e.nativeEvent;
        const offset = horizontal ? contentOffset.x : contentOffset.y;
        const viewport = horizontal
          ? layoutMeasurement.width
          : layoutMeasurement.height;
        const total = horizontal ? cs.width : cs.height;
        const distanceFromEnd = total - (offset + viewport);
        const threshold = Math.max(0, onEndReachedThreshold) * viewport;
        if (distanceFromEnd <= threshold) {
          if (!endReachedRef.current) {
            endReachedRef.current = true;
            onEndReached();
          }
        } else {
          endReachedRef.current = false;
        }
      }
    },
    [
      handleScroll,
      userOnScroll,
      onEndReached,
      onEndReachedThreshold,
      horizontal,
      count,
    ],
  );

  useImperativeHandle(
    ref,
    () => ({
      scrollToOffset: ({ offset, animated }) =>
        scrollRef.current?.scrollTo(
          horizontal ? { x: offset, animated } : { y: offset, animated },
        ),
      scrollToIndex: ({ index, animated }) => {
        const offset = offsetOf(index);
        scrollRef.current?.scrollTo(
          horizontal ? { x: offset, animated } : { y: offset, animated },
        );
      },
      scrollToEnd: (o) => scrollRef.current?.scrollToEnd(o),
      getNativeScrollRef: () => scrollRef.current,
    }),
    [horizontal, offsetOf],
  );

  // Build the mounted window of cells (only [first, last] when there's data),
  // laid out IN FLOW between a leading and trailing spacer. This self-corrects
  // as sizes are measured (unlike absolute-positioning, whose per-cell `top`
  // drifts from the real scroll position under fast fling and blanks the view):
  // the leading spacer pushes the window to its exact offset, the cells lay out
  // naturally (feeding real sizes back), and the trailing spacer preserves the
  // full scroll range.
  const cells: React.ReactNode[] = [];
  if (count > 0) {
    for (let index = first; index <= last && index < count; index++) {
      const item = data[index];
      if (item === undefined) continue;
      const k = keyExtractor(item, index);
      cells.push(
        <MeasuredCell
          key={k}
          index={index}
          itemKey={k}
          recycleGeneration={0}
          horizontal={horizontal}
          onMeasure={measureItem}
        >
          {renderItem({ item, index, itemKey: k })}
        </MeasuredCell>,
      );
    }
  }

  const isEmpty = count === 0;
  const leadSize = count > 0 ? offsetOf(first) : 0;
  const tailStart = count > 0 ? offsetOf(Math.min(last + 1, count)) : 0;
  const trailSize = Math.max(0, contentSize - tailStart);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal={horizontal}
      onScroll={onScroll}
      scrollEventThrottle={scrollEventThrottle}
      onLayout={handleScrollerLayout}
      testID={testID}
      style={style}
      contentContainerStyle={contentContainerStyle}
      // nitrocss-augmented className props (typed on NitroListProps).
      {...(className != null ? { className } : null)}
      {...(contentContainerClassName != null
        ? { contentContainerClassName }
        : null)}
    >
      {ListHeaderComponent}
      {isEmpty ? (
        ListEmptyComponent
      ) : (
        <View style={horizontal ? { flexDirection: "row" } : undefined}>
          <View
            style={horizontal ? { width: leadSize } : { height: leadSize }}
          />
          {cells}
          <View
            style={horizontal ? { width: trailSize } : { height: trailSize }}
          />
        </View>
      )}
      {ListFooterComponent}
    </ScrollView>
  );
}

export const NitroListVirtual = forwardRef(Impl) as <T>(
  props: NitroListProps<T> & { ref?: React.Ref<NitroListRef> },
) => React.ReactElement;
