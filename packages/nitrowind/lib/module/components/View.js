"use strict";

import React, { forwardRef, useMemo } from "react";
import { View as RNView } from "react-native";
import { resolveStyles } from "../core/store.js";
import { getAnimatedView } from "./animated.js";
import { ContainerProvider, useContainer } from "./containerContext.js";
import { useGridFallback } from "./grid.js";
import { useLinkedRef, useReactiveSnapshot } from "./internal.js";
import { withChildPseudoState } from "./pseudo.js";
import { jsx as _jsx } from "react/jsx-runtime";
/**
 * Drop-in replacement for RN's `View` that accepts a `className`. The initial
 * style is resolved in JS for first paint; the native engine then owns all
 * subsequent updates (no React re-render on theme/dimension changes).
 */
export const View = /*#__PURE__*/forwardRef(function View({
  className = "",
  style,
  onLayout,
  children,
  __nitrowindPseudoState,
  ...rest
}, forwardedRef) {
  const snapshot = useReactiveSnapshot();
  const resolved = useMemo(() => resolveStyles(className, snapshot, __nitrowindPseudoState), [className, snapshot, __nitrowindPseudoState]);
  const ref = useLinkedRef(className, "View", resolved, snapshot, forwardedRef, [], __nitrowindPseudoState, undefined, style);

  // `useContainer` returns a single `onLayout` that already merges the container
  // size reporter (JS fallback) with the caller's own handler.
  const {
    onLayout: handleLayout,
    containerStyle,
    provider
  } = useContainer(resolved, onLayout);
  const gridFallback = useGridFallback(children, className, handleLayout, [resolved.styles, containerStyle, style]);

  // A class using an animation utility (`entering-*`, `animate-wiggle`, …) swaps
  // the host for Reanimated's `Animated.View` so it can drive the animation.
  const Animated = resolved.isAnimated ? getAnimatedView() : null;
  const Base = Animated ?? RNView;
  const animationProps = Animated ? {
    entering: resolved.entering,
    exiting: resolved.exiting,
    layout: resolved.layout
  } : undefined;
  const node = /*#__PURE__*/_jsx(Base, {
    ref: ref,
    style: [resolved.styles, containerStyle, style],
    onLayout: gridFallback.onLayout,
    ...animationProps,
    ...rest,
    children: withChildPseudoState(gridFallback.children, snapshot)
  });
  return provider ? /*#__PURE__*/_jsx(ContainerProvider, {
    value: provider,
    children: node
  }) : node;
});
//# sourceMappingURL=View.js.map