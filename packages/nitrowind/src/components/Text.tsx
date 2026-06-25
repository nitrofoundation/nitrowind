import React, { forwardRef, useMemo } from "react";
import {
  Text as RNText,
  type Text as RNTextType,
  type TextProps,
} from "react-native";
import { resolveStyles } from "../core/store";
import { getAnimatedText } from "./animated";
import { useLinkedRef, useReactiveSnapshot } from "./internal";
import { type PseudoStateProp, withChildPseudoState } from "./pseudo";

export interface NitrowindTextProps extends TextProps, PseudoStateProp {
  /** Tailwind class names resolved by the nitrowind engine. */
  className?: string;
}

/**
 * Drop-in replacement for RN's `Text` that accepts a `className`. Behaves like
 * {@link View}: JS resolves the first paint, the native engine owns updates.
 */
export const Text = forwardRef<RNTextType, NitrowindTextProps>(function Text(
  { className = "", style, children, __nitrowindPseudoState, ...rest },
  forwardedRef,
) {
  const snapshot = useReactiveSnapshot();
  const resolved = useMemo(
    () => resolveStyles(className, snapshot, __nitrowindPseudoState),
    [className, snapshot, __nitrowindPseudoState],
  );
  const ref = useLinkedRef<RNTextType>(
    className,
    "Text",
    resolved,
    snapshot,
    forwardedRef,
    [],
    __nitrowindPseudoState,
  );

  // A class using an animation utility swaps the host for `Animated.Text`.
  const Animated = resolved.isAnimated ? getAnimatedText() : null;
  const Base = (Animated ?? RNText) as typeof RNText;
  const animationProps = Animated
    ? {
        entering: resolved.entering,
        exiting: resolved.exiting,
        layout: resolved.layout,
      }
    : undefined;

  return (
    <Base
      ref={ref}
      style={[resolved.styles, style]}
      {...animationProps}
      {...rest}
    >
      {withChildPseudoState(children)}
    </Base>
  );
});
