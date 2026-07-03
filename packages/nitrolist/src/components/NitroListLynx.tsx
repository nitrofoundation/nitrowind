import React, {
  forwardRef,
  memo,
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
import type {
  NitroListProps,
  NitroListRef,
  NitroListRenderItem,
} from "../core/types";
import { MeasuredCell } from "../internal/MeasuredCell";
import { useVirtualWindow } from "../internal/virtualWindow";

/**
 * `NitroListLynx` — the "template-fast, blank-averse" variant
 * (docs/nitrolist/list-variants.md variant A, simplified for this first cut).
 *
 * The full Lynx design compiles each cell into a native template in a Metro
 * transformer and fills them with a dumb native scroller — that native template
 * compiler is FUTURE WORK and out of scope here. This is the shippable JS
 * approximation of its GOAL (zero blank cells under a fast fling), sharing the
 * exact same `useVirtualWindow` math as `NitroListVirtual` but trading memory
 * for smoothness in two ways:
 *
 *   1. Blank-averse prerender: a MUCH larger default `drawDistance` (1600px per
 *      edge vs. Virtual's 500) so cells are mounted and measured well before
 *      they scroll into view. More cells stay mounted; far fewer blanks appear
 *      during fast flings.
 *   2. Template memoization: every cell's `renderItem` output is wrapped in a
 *      `React.memo` "template" component keyed on its stable `itemKey`. A
 *      re-render of the list root (e.g. new data tail appended, scroll state
 *      change) never re-renders an unchanged cell — the cheap-cell property that
 *      real Lynx templates provide at compile time.
 *
 * Positioning/windowing is identical to Virtual: a `ScrollView` whose content
 * container is a spacer sized to the exact content extent, with only the
 * `[first, last]` window mounted as absolutely-positioned `MeasuredCell`s.
 */

interface TemplateCellProps<T> {
  item: T;
  index: number;
  itemKey: string;
  render: NitroListRenderItem<T>;
}

/**
 * Memoized "template" cell. Memo comparison is by identity on all props; because
 * `render` is a stable prop and `item`/`index`/`itemKey` only change when the
 * cell is genuinely reassigned, an unchanged cell never re-renders when the list
 * root does. Placeholder for the future Metro-compiled native template.
 */
const TemplateCell = memo(
  function TemplateCell<T>({
    item,
    index,
    itemKey,
    render,
  }: TemplateCellProps<T>) {
    return <>{render({ item, index, itemKey })}</>;
  },
  (prev, next) =>
    prev.item === next.item &&
    prev.index === next.index &&
    prev.itemKey === next.itemKey &&
    prev.render === next.render,
) as <T>(props: TemplateCellProps<T>) => React.ReactElement;

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
    // Blank-averse: prerender aggressively far beyond the viewport.
    drawDistance: drawDistance ?? 1600,
  });

  const endReachedRef = useRef(false);
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      handleScroll(e);
      userOnScroll?.(e);

      if (onEndReached && count > 0) {
        const {
          contentOffset,
          layoutMeasurement,
          contentSize: cs,
        } = e.nativeEvent;
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

  // Mount only the (aggressively wide) [first, last] window; each cell's user
  // content goes through the memoized TemplateCell so root re-renders are cheap.
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
          <TemplateCell
            item={item}
            index={index}
            itemKey={k}
            render={renderItem}
          />
        </MeasuredCell>,
      );
    }
  }

  const isEmpty = count === 0;
  // In-flow window between a leading + trailing spacer (self-correcting under
  // fast fling; absolute per-cell `top` drifts and blanks the view).
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

export const NitroListLynx = forwardRef(Impl) as unknown as (<T>(
  props: NitroListProps<T> & { ref?: React.Ref<NitroListRef> },
) => React.ReactElement) & {
  /**
   * Marker for authoring template cells. A no-op passthrough today — it just
   * renders its children — so callers can annotate cells that the future Metro
   * template compiler will lift into native templates. No runtime effect yet.
   */
  Template: (props: { children: React.ReactNode }) => React.ReactElement;
};

(NitroListLynx as { Template: (props: { children: React.ReactNode }) => React.ReactElement }).Template =
  function Template({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
  };
