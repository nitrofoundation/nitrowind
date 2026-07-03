import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { findNodeHandle, ScrollView, View } from "react-native";
import type { NitroListProps, NitroListRef } from "../core/types";

/**
 * NitroList — native, UI-thread virtualized list (see
 * `docs/nitrolist/ui-thread-engine.md`).
 *
 * JS renders a real `ScrollView` and every cell's React subtree ONCE, each in a
 * `collapsable={false}` host so it has a stable Fabric node. JS reports only
 * COLD-path facts through the JSI channel: the list config, each cell's Fabric
 * tag, and the scroll view's tag to attach to. From there the per-frame loop is
 * entirely native/UI-thread — a `UIScrollViewDelegate` observer → C++
 * `ListEngine` → `view.hidden` toggle — with NO JS `onScroll` and NO React
 * re-render. `onScroll` is never wired in JS.
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
  var __nitrolistAttach:
    | ((listId: number, scrollViewTag: number, horizontal: boolean) => void)
    | undefined;
  // eslint-disable-next-line no-var
  var __nitrolistRemove: ((listId: number) => void) | undefined;
}

let nextListId = 1;

function Impl<T>(props: NitroListProps<T>, ref: React.Ref<NitroListRef>) {
  const {
    data,
    keyExtractor,
    renderItem,
    horizontal = false,
    estimatedItemSize = 50,
    mainAxisGap = 0,
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

  // Configure DURING render (parent body runs before children mount + report
  // their tags), re-running only when the count changes.
  const configuredCount = useRef(-1);
  if (configuredCount.current !== data.length) {
    configuredCount.current = data.length;
    globalThis.__nitrolistConfigure?.(
      listId.current,
      data.length,
      estimatedItemSize,
      mainAxisGap,
      0.5,
    );
  }

  // Attach the native scroll observer after the first commit (all cell refs
  // have fired their tags by then); detach on unmount.
  useEffect(() => {
    const svTag = findNodeHandle(scrollRef.current);
    if (typeof svTag === "number") {
      globalThis.__nitrolistAttach?.(listId.current, svTag, horizontal);
    }
    const id = listId.current;
    return () => globalThis.__nitrolistRemove?.(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [horizontal]);

  const reportCell = useCallback(
    (index: number) => (node: View | null) => {
      if (node == null) return;
      const tag = findNodeHandle(node);
      if (typeof tag === "number") {
        globalThis.__nitrolistSetCell?.(listId.current, index, tag);
      }
    },
    [],
  );

  useImperativeHandle(
    ref,
    () => ({
      scrollToOffset: ({ offset, animated }) =>
        scrollRef.current?.scrollTo(
          horizontal ? { x: offset, animated } : { y: offset, animated },
        ),
      scrollToIndex: () => {},
      scrollToEnd: (o) => scrollRef.current?.scrollToEnd(o),
      getNativeScrollRef: () => scrollRef.current,
    }),
    [horizontal],
  );

  const isEmpty = data.length === 0;

  return (
    <ScrollView
      ref={scrollRef}
      horizontal={horizontal}
      style={style}
      contentContainerStyle={contentContainerStyle}
      testID={testID}
    >
      {ListHeaderComponent}
      {isEmpty
        ? ListEmptyComponent
        : data.map((item, index) => {
            const k = keyExtractor(item, index);
            return (
              <View key={k} collapsable={false} ref={reportCell(index)}>
                {renderItem({ item, index, itemKey: k })}
              </View>
            );
          })}
      {ListFooterComponent}
    </ScrollView>
  );
}

export const NitroList = forwardRef(Impl) as <T>(
  props: NitroListProps<T> & { ref?: React.Ref<NitroListRef> },
) => React.ReactElement;
