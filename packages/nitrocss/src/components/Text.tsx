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

export interface NitroCssTextProps extends TextProps, PseudoStateProp {
  /** Class names resolved by the nitrocss engine. */
  className?: string;
}

/**
 * Normalize inline JSX children of a native `<Text>` (effects contract §5).
 * This is JSX-child normalization, NOT HTML-string parsing:
 *   - strings / numbers pass through unchanged;
 *   - `<br/>` (`type === "br"`) becomes a "\n" text node;
 *   - `<b>` / `<strong>` wrap their (recursively normalized) children in an RN
 *     `Text` with `fontWeight: '700'`;
 *   - nested `<Text>` / other React elements are recursed into;
 *   - unknown lowercase intrinsic elements dev-warn and flatten their children.
 * On web these tags render natively, so `Text` passes children through as-is and
 * never calls this.
 */
function normalizeInlineText(children: React.ReactNode): React.ReactNode {
  let keySeed = 0;
  const walk = (node: React.ReactNode): React.ReactNode => {
    if (node == null || typeof node === "boolean") return node;
    if (typeof node === "string" || typeof node === "number") return node;
    if (Array.isArray(node)) {
      return React.Children.map(node, (child) => walk(child));
    }
    if (!React.isValidElement(node)) return node;
    const element = node as React.ReactElement<{ children?: React.ReactNode }>;
    const type = element.type;
    if (typeof type === "string") {
      const inner = walk(element.props.children);
      if (type === "br") return "\n";
      if (type === "b" || type === "strong") {
        return (
          <RNText key={element.key ?? `nw-b-${keySeed++}`} style={BOLD_STYLE}>
            {inner}
          </RNText>
        );
      }
      // Unknown intrinsic (e.g. <i>, <span>) inside a native Text: RN cannot
      // render it. Warn in dev and flatten its children safely.
      if (__DEV__) {
        console.warn(
          `[nitrocss] <Text> received an unsupported inline element <${type}>. ` +
            `Only <b>, <strong>, and <br/> are supported inside native <Text>; ` +
            `its children were flattened.`,
        );
      }
      return inner;
    }
    // A React component element (including nested NitroCss <Text>): recurse into
    // its children so bold/br nested inside still normalize.
    const childProps = element.props.children;
    if (childProps === undefined) return node;
    return React.cloneElement(element, undefined, walk(childProps));
  };
  return walk(children);
}

const BOLD_STYLE = { fontWeight: "700" as const };

/**
 * Drop-in replacement for RN's `Text` that accepts a `className`. Native builds
 * resolve first-paint styles through nitrocss; web leaves `className` on the
 * host so browser CSS owns styling directly.
 */
export const Text = forwardRef<RNTextType, NitroCssTextProps>(function Text(
  { className = "", style, children, __nitrocssPseudoState, ...rest },
  forwardedRef,
) {
  const isWeb = Platform.OS === "web";
  const snapshot = useReactiveSnapshot();
  const resolved = useMemo(
    () => resolveStylesForPlatform(className, snapshot, __nitrocssPseudoState),
    [className, snapshot, __nitrocssPseudoState],
  );
  const ref = useLinkedRef<RNTextType>(
    className,
    "Text",
    resolved,
    snapshot,
    forwardedRef,
    [],
    __nitrocssPseudoState,
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
      {isWeb
        ? children
        : withChildPseudoState(normalizeInlineText(children), snapshot)}
    </Base>
  );
});
