import React, { forwardRef, useMemo } from "react";
import {
  View as RNView,
  type View as RNViewType,
  type ViewProps,
} from "react-native";
import { resolveStyles } from "../core/store";
import { getAnimatedView } from "./animated";
import { ContainerProvider, useContainer } from "./containerContext";
import { useGridFallback } from "./grid";
import { useLinkedRef, useReactiveSnapshot } from "./internal";
import { type PseudoStateProp, withChildPseudoState } from "./pseudo";

export interface NitrowindViewProps extends ViewProps, PseudoStateProp {
  /** Tailwind class names resolved by the nitrowind engine. */
  className?: string;
}

/**
 * Drop-in replacement for RN's `View` that accepts a `className`. The initial
 * style is resolved in JS for first paint; the native engine then owns all
 * subsequent updates (no React re-render on theme/dimension changes).
 */
export const View = forwardRef<RNViewType, NitrowindViewProps>(function View(
  {
    className = "",
    style,
    onLayout,
    children,
    __nitrowindPseudoState,
    ...rest
  },
  forwardedRef,
) {
  const snapshot = useReactiveSnapshot();
  const resolved = useMemo(
    () => resolveStyles(className, snapshot, __nitrowindPseudoState),
    [className, snapshot, __nitrowindPseudoState],
  );
  const ref = useLinkedRef<RNViewType>(
    className,
    "View",
    resolved,
    snapshot,
    forwardedRef,
    [],
    __nitrowindPseudoState,
  );

  // `useContainer` returns a single `onLayout` that already merges the container
  // size reporter (JS fallback) with the caller's own handler.
  const {
    onLayout: handleLayout,
    containerStyle,
    provider,
  } = useContainer(resolved, onLayout);
  const gridFallback = useGridFallback(children, className, handleLayout);

  // A class using an animation utility (`entering-*`, `animate-wiggle`, …) swaps
  // the host for Reanimated's `Animated.View` so it can drive the animation.
  const Animated = resolved.isAnimated ? getAnimatedView() : null;
  const Base = (Animated ?? RNView) as typeof RNView;
  const animationProps = Animated
    ? {
        entering: resolved.entering,
        exiting: resolved.exiting,
        layout: resolved.layout,
      }
    : undefined;

  const node = (
    <Base
      ref={ref}
      style={[resolved.styles, containerStyle, style]}
      onLayout={gridFallback.onLayout}
      {...animationProps}
      {...rest}
    >
      {withChildPseudoState(gridFallback.children)}
    </Base>
  );

  return provider ? (
    <ContainerProvider value={provider}>{node}</ContainerProvider>
  ) : (
    node
  );
});
