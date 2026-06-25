import React from "react";
import {
  ScrollView,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import type { Range } from "../core/types";
import { useVirtualWindow } from "../core/useVirtualWindow";

export interface LazyStackProps extends Omit<ScrollViewProps, "horizontal"> {
  children: React.ReactNode;
  initialScrollIndex?: number;
  itemContainerStyle?: StyleProp<ViewStyle>;
  onVisibleRangeChange?: (range: Range) => void;
}

interface InternalLazyStackProps extends LazyStackProps {
  horizontal: boolean;
}

function LazyStack({
  children,
  initialScrollIndex = 0,
  itemContainerStyle,
  onVisibleRangeChange,
  contentContainerStyle,
  onScroll,
  onLayout,
  scrollEventThrottle = 16,
  horizontal,
  ...rest
}: InternalLazyStackProps) {
  const {
    normalized,
    range,
    spacers,
    onScroll: handleScroll,
    onViewportLayout,
    onCellLayout,
  } = useVirtualWindow({
    children,
    horizontal,
    initialScrollIndex,
    onVisibleRangeChange,
  });

  const visible = normalized.slice(range.first, range.last + 1);
  const leadingStyle = horizontal
    ? { width: spacers.leadingSpacer }
    : { height: spacers.leadingSpacer };
  const trailingStyle = horizontal
    ? { width: spacers.trailingSpacer }
    : { height: spacers.trailingSpacer };

  return (
    <ScrollView
      horizontal={horizontal}
      scrollEventThrottle={scrollEventThrottle}
      onLayout={(event) => {
        onViewportLayout(event);
        onLayout?.(event);
      }}
      onScroll={(event) => {
        handleScroll(event);
        onScroll?.(event);
      }}
      contentContainerStyle={contentContainerStyle}
      {...rest}
    >
      <View style={leadingStyle} />
      {visible.map((child) => (
        <View
          key={child.key}
          style={itemContainerStyle}
          onLayout={(event) => onCellLayout(child.index, event)}
        >
          {child.element}
        </View>
      ))}
      <View style={trailingStyle} />
    </ScrollView>
  );
}

export function LazyVStack(props: LazyStackProps) {
  return <LazyStack {...props} horizontal={false} />;
}

export function LazyHStack(props: LazyStackProps) {
  return <LazyStack {...props} horizontal />;
}

export const VirtualList = LazyStack;
