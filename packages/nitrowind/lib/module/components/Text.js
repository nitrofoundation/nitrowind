"use strict";

import React, { forwardRef, useMemo } from "react";
import { Text as RNText } from "react-native";
import { resolveStyles } from "../core/store.js";
import { getAnimatedText } from "./animated.js";
import { useLinkedRef, useReactiveSnapshot } from "./internal.js";
import { withChildPseudoState } from "./pseudo.js";
import { jsx as _jsx } from "react/jsx-runtime";
/**
 * Drop-in replacement for RN's `Text` that accepts a `className`. Behaves like
 * {@link View}: JS resolves the first paint, the native engine owns updates.
 */
export const Text = /*#__PURE__*/forwardRef(function Text({
  className = "",
  style,
  children,
  __nitrowindPseudoState,
  ...rest
}, forwardedRef) {
  const snapshot = useReactiveSnapshot();
  const resolved = useMemo(() => resolveStyles(className, snapshot, __nitrowindPseudoState), [className, snapshot, __nitrowindPseudoState]);
  const ref = useLinkedRef(className, "Text", resolved, snapshot, forwardedRef, [], __nitrowindPseudoState, undefined, style);

  // A class using an animation utility swaps the host for `Animated.Text`.
  const Animated = resolved.isAnimated ? getAnimatedText() : null;
  const Base = Animated ?? RNText;
  const animationProps = Animated ? {
    entering: resolved.entering,
    exiting: resolved.exiting,
    layout: resolved.layout
  } : undefined;
  return /*#__PURE__*/_jsx(Base, {
    ref: ref,
    style: [resolved.styles, style],
    ...animationProps,
    ...rest,
    children: withChildPseudoState(children, snapshot)
  });
});
//# sourceMappingURL=Text.js.map