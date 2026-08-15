import React, {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  useImperativeHandle,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  Animated,
  StyleSheet,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  NITROCSS_STICKY_ORDER_PROP,
  NITROCSS_STICKY_TOP_PROP,
} from "./stickyHeader";

interface StickyChildProps {
  onLayout?: (event: LayoutChangeEvent) => void;
  style?: StyleProp<ViewStyle>;
  [NITROCSS_STICKY_TOP_PROP]?: number;
  [NITROCSS_STICKY_ORDER_PROP]?: number;
}

interface NativeCssStickyHeaderProps {
  children?: ReactNode;
  nextHeaderLayoutY?: number;
  onLayout: (event: LayoutChangeEvent) => void;
  scrollAnimatedValue: Animated.Value;
  inverted?: boolean;
}

export interface NativeCssStickyHeaderHandle {
  setNextHeaderY: (value: number) => void;
}

/**
 * Native counterpart of browser `position: sticky` for direct ScrollView
 * children. React Native's stock sticky wrapper pushes the previous header out
 * when the next one arrives. Browser sticky boxes remain pinned independently,
 * which is what produces stacked-card decks, so CSS-sticky children deliberately
 * omit that collision stop. The transform is driven by ScrollView's attached
 * native Animated value; there is no JS `onScroll` callback.
 */
export const NativeCssStickyHeader = forwardRef<
  NativeCssStickyHeaderHandle,
  NativeCssStickyHeaderProps
>(function NativeCssStickyHeader(
  {
    children,
    nextHeaderLayoutY: initialNextHeaderLayoutY,
    onLayout,
    scrollAnimatedValue,
    inverted = false,
  },
  forwardedRef,
) {
  const child = Children.only(children) as ReactElement<StickyChildProps>;
  const cssTop = child.props[NITROCSS_STICKY_TOP_PROP];
  const isCssSticky = typeof cssTop === "number";
  const stickyTop = cssTop ?? 0;
  const stickyOrder = child.props[NITROCSS_STICKY_ORDER_PROP] ?? 0;
  const [layoutY, setLayoutY] = useState(0);
  const [layoutHeight, setLayoutHeight] = useState(0);
  const [measured, setMeasured] = useState(false);
  const [nextHeaderLayoutY, setNextHeaderLayoutY] = useState(
    initialNextHeaderLayoutY,
  );

  useImperativeHandle(
    forwardedRef,
    () => ({ setNextHeaderY: setNextHeaderLayoutY }),
    [],
  );

  const translateY = useMemo(() => {
    if (!measured || inverted) {
      return scrollAnimatedValue.interpolate({
        inputRange: [-1, 0],
        outputRange: [0, 0],
      });
    }

    const stickStart = layoutY - stickyTop;
    const inputRange: number[] = [];
    const outputRange: number[] = [];
    if (stickStart > 0) {
      inputRange.push(-1, 0, stickStart, stickStart + 1);
      outputRange.push(0, 0, 0, 1);
    } else {
      // A first child with `top > 0` is already sticky at scroll offset zero.
      inputRange.push(-1_000_000, stickStart, stickStart + 1);
      outputRange.push(0, 0, 1);
    }

    // Explicit stickyHeaderIndices retain React Native's push-off collision.
    // CSS sticky boxes do not: independent pinning creates the browser-style
    // accumulated deck used by stacked-card layouts.
    if (!isCssSticky && nextHeaderLayoutY != null) {
      const collisionPoint = nextHeaderLayoutY - layoutHeight;
      if (collisionPoint >= layoutY) {
        inputRange.push(collisionPoint, collisionPoint + 1);
        const stop = collisionPoint - layoutY;
        outputRange.push(stop, stop);
      }
    }

    return scrollAnimatedValue.interpolate({ inputRange, outputRange });
  }, [
    inverted,
    isCssSticky,
    layoutHeight,
    layoutY,
    measured,
    nextHeaderLayoutY,
    scrollAnimatedValue,
    stickyTop,
  ]);

  const handleLayout = (event: LayoutChangeEvent) => {
    setLayoutY(event.nativeEvent.layout.y);
    setLayoutHeight(event.nativeEvent.layout.height);
    setMeasured(true);
    onLayout(event);
    child.props.onLayout?.(event);
  };

  return (
    <Animated.View
      collapsable={false}
      onLayout={handleLayout}
      style={[
        child.props.style,
        styles.header,
        isCssSticky ? { zIndex: 10 + stickyOrder } : undefined,
        { transform: [{ translateY }] },
      ]}
    >
      {isValidElement<StickyChildProps>(child)
        ? cloneElement(child, { onLayout: undefined, style: styles.fill })
        : child}
    </Animated.View>
  );
});

NativeCssStickyHeader.displayName = "NitroCss(NativeStickyHeader)";

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { zIndex: 10 },
});
