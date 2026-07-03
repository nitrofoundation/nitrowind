import React, { forwardRef, useImperativeHandle, useRef } from "react";
import { ScrollView, View } from "react-native";
import type { NitroListProps, NitroListRef } from "../core/types";

/**
 * NitroList — native, UI-thread virtualized list (see
 * `docs/nitrolist/ui-thread-engine.md`).
 *
 * JS renders a real `ScrollView` and every cell's React subtree ONCE, each
 * wrapped in a `collapsable={false}` host so it has a stable Fabric node the
 * native engine can address by `ShadowNodeFamily`. From there the per-frame
 * loop is entirely native/UI-thread: a `UIScrollViewDelegate` scroll observer →
 * C++ `Virtualizer`/`ViewportCuller` → `ShadowTreeMutator` `display:none`
 * commit, with NO JS `onScroll` and NO React re-render per frame.
 *
 * This file is the JS seam only. Culling is wired by the native engine
 * (`packages/nitrolist/cpp` + the native module) — added in the next stage.
 * Until then it renders all cells (committed-window base, uncelled).
 */
function Impl<T>(props: NitroListProps<T>, ref: React.Ref<NitroListRef>) {
  const {
    data,
    keyExtractor,
    renderItem,
    horizontal = false,
    style,
    contentContainerStyle,
    testID,
    ListHeaderComponent,
    ListFooterComponent,
    ListEmptyComponent,
  } = props;

  const scrollRef = useRef<ScrollView>(null);

  useImperativeHandle(
    ref,
    () => ({
      scrollToOffset: ({ offset, animated }) =>
        scrollRef.current?.scrollTo(
          horizontal ? { x: offset, animated } : { y: offset, animated },
        ),
      // scrollToIndex resolves through the native engine's frame store; stubbed
      // until the engine lands.
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
              <View key={k} collapsable={false}>
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
