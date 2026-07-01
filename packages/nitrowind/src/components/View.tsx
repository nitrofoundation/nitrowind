import React, { forwardRef, useMemo } from "react";
import {
  Platform,
  View as RNView,
  type View as RNViewType,
  type ViewProps,
} from "react-native";
import { resolveStylesForPlatform } from "../core/store";
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
 * Drop-in replacement for RN's `View` that accepts a `className`. Native builds
 * resolve first-paint styles through nitrocss; web leaves `className` on the
 * host so Tailwind CSS/browser CSS owns styling directly.
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
  const isWeb = Platform.OS === "web";
  const snapshot = useReactiveSnapshot();
  const resolved = useMemo(
    () => resolveStylesForPlatform(className, snapshot, __nitrowindPseudoState),
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
    undefined,
    style,
  );

  // `useContainer` returns a single `onLayout` that already merges the container
  // size reporter (JS fallback) with the caller's own handler.
  const {
    onLayout: handleLayout,
    containerStyle,
    provider,
  } = useContainer(resolved, onLayout);
  const gridFallback = useGridFallback(children, className, handleLayout, [
    resolved.styles,
    containerStyle,
    style,
  ]);

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
  const webProps: Record<string, unknown> =
    isWeb && className ? { className } : {};

  const node = (
    <Base
      ref={ref}
      {...webProps}
      style={isWeb ? style : [resolved.styles, containerStyle, style]}
      onLayout={gridFallback.onLayout}
      {...animationProps}
      {...rest}
    >
      {isWeb
        ? gridFallback.children
        : withChildPseudoState(gridFallback.children, snapshot)}
    </Base>
  );

  return provider ? (
    <ContainerProvider value={provider}>{node}</ContainerProvider>
  ) : (
    node
  );
});
