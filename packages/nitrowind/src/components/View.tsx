import React, { forwardRef, useMemo, useRef } from "react";
import {
  Platform,
  View as RNView,
  type View as RNViewType,
  type ViewProps,
} from "react-native";
import type { RNStyle } from "../compiler/types";
import { resolveStylesForPlatform } from "../core/store";
import type { ReanimatedAnimation } from "../core/reanimated";
import { getAnimatedView } from "./animated";
import { ContainerProvider, useContainer } from "./containerContext";
import {
  GRADIENT_DESCRIPTOR_PROP,
  GradientLayer,
  pickBorderRadius,
  type GradientDescriptor,
} from "./gradient";
import { serializeGridConfig, useGridFallback } from "./grid";
import { useLinkedRef, useReactiveSnapshot } from "./internal";
import { type PseudoStateProp, withChildPseudoState } from "./pseudo";

export interface NitrowindViewProps extends ViewProps, PseudoStateProp {
  /** Tailwind class names resolved by the nitrowind engine. */
  className?: string;
}

/** Animation objects pinned across snapshot recomputes (see below). */
interface AnimationIdentity {
  key: string;
  entering?: ReanimatedAnimation;
  exiting?: ReanimatedAnimation;
  layout?: ReanimatedAnimation;
  styles: RNStyle;
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
  // Native grid config, serialized once so the C++ engine can lay the grid out
  // from the measured container width (no `onLayout` reflow). `undefined` on web,
  // non-grids, or grids the native engine can't handle (JS fallback owns those).
  const gridConfig = useMemo(
    () => (isWeb ? undefined : serializeGridConfig(className, children, style)),
    [isWeb, className, children, style],
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
    gridConfig,
  );

  // Gradient: the fold emits the compact numeric descriptor under
  // `--nitrowind-gradient`. Strip it from the RN style (it is not a real style
  // key), force `overflow: hidden` so the absolutely-filling gradient child
  // clips to the box, and remember the uniform borderRadius so the native
  // layer self-clips to the same rounded rect.
  const gradient = isWeb
    ? undefined
    : ((resolved.styles as Record<string, unknown>)[
        GRADIENT_DESCRIPTOR_PROP
      ] as GradientDescriptor | undefined);
  const { viewStyles, gradientBorderRadius } = useMemo(() => {
    if (!gradient) {
      return { viewStyles: resolved.styles, gradientBorderRadius: 0 };
    }
    const { [GRADIENT_DESCRIPTOR_PROP]: _descriptor, ...restStyles } =
      resolved.styles as Record<string, unknown>;
    const stripped = restStyles as RNStyle;
    if (stripped.overflow === undefined) stripped.overflow = "hidden";
    return {
      viewStyles: stripped,
      gradientBorderRadius: pickBorderRadius(stripped),
    };
  }, [resolved.styles, gradient]);

  // `useContainer` returns a single `onLayout` that already merges the container
  // size reporter (JS fallback) with the caller's own handler.
  const {
    onLayout: handleLayout,
    containerStyle,
    provider,
  } = useContainer(resolved, onLayout);
  const gridFallback = useGridFallback(children, className, handleLayout, [
    viewStyles,
    containerStyle,
    style,
  ]);

  // A class using an animation utility (`entering-*`, `animate-wiggle`, …) swaps
  // the host for Reanimated's `Animated.View` so it can drive the animation.
  const Animated = resolved.isAnimated ? getAnimatedView() : null;
  const Base = (Animated ?? RNView) as typeof RNView;

  // Animation identity (research/animation.md §2c): a snapshot recompute (e.g.
  // a theme toggle re-rendering the tree) rebuilds `resolved` and hands NEW
  // object identities for `entering`/`exiting`/`layout` and the styles object
  // carrying `animationName`, which can restart running animations even though
  // the animation didn't logically change. Pin those objects to the animation's
  // identity — the className + pseudo state, which is what the animation
  // actually derives from — and reuse the exact same instances until it
  // changes. Theme-driven style updates for animated views are committed
  // natively by the C++ engine, so freezing the JS copies loses nothing.
  const animationRef = useRef<AnimationIdentity | null>(null);
  let entering = resolved.entering;
  let exiting = resolved.exiting;
  let layoutAnim = resolved.layout;
  let hostStyles = viewStyles;
  if (Animated) {
    const animationKey = __nitrowindPseudoState
      ? `${className}|${JSON.stringify(__nitrowindPseudoState)}`
      : className;
    const cached = animationRef.current;
    if (cached && cached.key === animationKey) {
      entering = cached.entering;
      exiting = cached.exiting;
      layoutAnim = cached.layout;
      hostStyles = cached.styles;
    } else {
      animationRef.current = {
        key: animationKey,
        entering,
        exiting,
        layout: layoutAnim,
        styles: hostStyles,
      };
    }
  } else if (animationRef.current) {
    animationRef.current = null;
  }
  const animationProps = Animated
    ? { entering, exiting, layout: layoutAnim }
    : undefined;

  // Memoize the composed style array so its identity only changes when an
  // input actually changes (same §2c concern for `animationName` in-place).
  const composedStyle = useMemo(
    () => [hostStyles, containerStyle, style],
    [hostStyles, containerStyle, style],
  );

  const webProps: Record<string, unknown> =
    isWeb && className ? { className } : {};

  const node = (
    <Base
      ref={ref}
      {...webProps}
      style={isWeb ? style : composedStyle}
      onLayout={gridFallback.onLayout}
      {...animationProps}
      {...rest}
    >
      {!isWeb && gradient ? (
        // FIRST child + absolute fill + no pointer events → paints behind the
        // real children. The C++ engine keeps its colors theme-fresh natively
        // via the GradientRegistry link (no JS re-render).
        <GradientLayer
          descriptor={gradient}
          borderRadius={gradientBorderRadius}
          className={className}
        />
      ) : null}
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
