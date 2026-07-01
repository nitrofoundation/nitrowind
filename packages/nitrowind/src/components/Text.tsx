import React, { forwardRef, useMemo } from "react";
import {
  Platform,
  Text as RNText,
  type Text as RNTextType,
  type TextProps,
} from "react-native";
import { resolveStylesForPlatform } from "../core/store";
import { getAnimatedText } from "./animated";
import { useLinkedRef, useReactiveSnapshot } from "./internal";
import { type PseudoStateProp, withChildPseudoState } from "./pseudo";

export interface NitrowindTextProps extends TextProps, PseudoStateProp {
  /** Tailwind class names resolved by the nitrowind engine. */
  className?: string;
}

/**
 * Drop-in replacement for RN's `Text` that accepts a `className`. Native builds
 * resolve first-paint styles through nitrocss; web leaves `className` on the
 * host so Tailwind CSS/browser CSS owns styling directly.
 */
export const Text = forwardRef<RNTextType, NitrowindTextProps>(function Text(
  { className = "", style, children, __nitrowindPseudoState, ...rest },
  forwardedRef,
) {
  const isWeb = Platform.OS === "web";
  const snapshot = useReactiveSnapshot();
  const resolved = useMemo(
    () => resolveStylesForPlatform(className, snapshot, __nitrowindPseudoState),
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
    undefined,
    style,
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
  const webProps: Record<string, unknown> =
    isWeb && className ? { className } : {};

  return (
    <Base
      ref={ref}
      {...webProps}
      style={isWeb ? style : [resolved.styles, style]}
      {...animationProps}
      {...rest}
    >
      {isWeb ? children : withChildPseudoState(children, snapshot)}
    </Base>
  );
});
