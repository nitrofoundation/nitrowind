import React, { memo, useCallback } from "react";
import { type LayoutChangeEvent, StyleSheet, View } from "react-native";
import type { NitroListItemContext } from "../core/types";
import { ListItemContext } from "./ListItemContext";

export interface MeasuredCellProps {
  index: number;
  itemKey: string;
  recycleGeneration: number;
  horizontal: boolean;
  /** Positioning/layout style chosen by the variant (absolute, in-flow, …). */
  style?: object;
  /** Reports the cell's measured main-axis size back to the windowing hook. */
  onMeasure: (index: number, size: number) => void;
  children: React.ReactNode;
}

/**
 * Shared cell wrapper used by every variant. A `collapsable={false}` host view
 * (never flattened by Fabric — the same trick RNGH's `Wrap` uses, and what the
 * native applier needs to find the cell by tag) that measures itself and
 * provides the per-cell context. Variants own positioning via `style`.
 */
export const MeasuredCell = memo(function MeasuredCell({
  index,
  itemKey,
  recycleGeneration,
  horizontal,
  style,
  onMeasure,
  children,
}: MeasuredCellProps) {
  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      onMeasure(index, horizontal ? width : height);
    },
    [index, horizontal, onMeasure],
  );

  const ctx: NitroListItemContext = { index, itemKey, recycleGeneration };

  return (
    <View
      // eslint-disable-next-line react-native/no-inline-styles
      style={style as never}
      collapsable={false}
      onLayout={handleLayout}
    >
      <ListItemContext.Provider value={ctx}>
        {children}
      </ListItemContext.Provider>
    </View>
  );
});

/** A spacer that establishes the scroller's exact content size. */
export function ContentSpacer({
  contentSize,
  horizontal,
}: {
  contentSize: number;
  horizontal: boolean;
}) {
  return (
    <View
      pointerEvents="none"
      style={horizontal ? { width: contentSize } : { height: contentSize }}
    />
  );
}

export const cellStyles = StyleSheet.create({
  absolute: { position: "absolute", left: 0, right: 0 },
  absoluteHorizontal: { position: "absolute", top: 0, bottom: 0 },
});
