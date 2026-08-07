import React, {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import {
  findNodeHandle,
  Platform,
  View as RNView,
  type View as RNViewType,
  type ViewProps,
} from "react-native";
import type { RNStyle } from "../compiler/types";
import { resolveStylesForPlatform } from "../core/store";
import {
  BACKGROUND_IMAGE_PROP,
  CLIP_PATH_PROP,
  GRADIENT_ANGLE_PROP,
} from "../core/normalize";
import {
  startGradientAngleDriver,
  type GradientAngleTrack,
} from "../core/gradientAngle";
import type { ReanimatedAnimation } from "../core/reanimated";
import { getAnimatedView } from "./animated";
import {
  BACKDROP_FILTER_PROP,
  BackdropLayer,
  backdropBlurRadius,
} from "./backdrop";
import { GRADIENT_DESCRIPTOR_PROP } from "../compiler/parsers/gradient";
import { ContainerProvider, useContainer } from "./containerContext";
import { serializeGridConfig, useGridFallback } from "./grid";
import { assignRef, useLinkedRef, useReactiveSnapshot } from "./internal";
import { type PseudoStateProp, withChildPseudoState } from "./pseudo";

export interface NitroCssViewProps extends ViewProps, PseudoStateProp {
  /** Class names resolved by the nitrocss engine. */
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
 * host so browser CSS owns styling directly.
 */
export const View = forwardRef<RNViewType, NitroCssViewProps>(function View(
  {
    className = "",
    style,
    onLayout,
    children,
    __nitrocssPseudoState,
    ...rest
  },
  forwardedRef,
) {
  const isWeb = Platform.OS === "web";
  const snapshot = useReactiveSnapshot();
  const resolved = useMemo(
    () => resolveStylesForPlatform(className, snapshot, __nitrocssPseudoState),
    [className, snapshot, __nitrocssPseudoState],
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
    __nitrocssPseudoState,
    undefined,
    style,
    gridConfig,
  );

  // Keep a direct handle to the mounted host node so the gradient-angle driver
  // can resolve its Fabric tag via findNodeHandle. `ref` (from useLinkedRef) is
  // itself a callback ref, so compose: store the node, then delegate to it.
  const nodeRef = useRef<RNViewType | null>(null);

  // Gradient: the fold emits the compact numeric descriptor under
  // `--nitrocss-gradient`. It is NOT a real RN style key and it is NOT a
  // child component either — the C++ engine registers `tag → descriptor` at
  // link/resolve time and the native applier paints it as a CAGradientLayer on
  // this view's own layer (RN backgroundImage-style). All JS does is strip the
  // marker from the host style.
  // Backdrop: `backdrop-filter` compiles to the parsed filter array under
  // `--nitrocss-backdrop-filter` (parsers/filter.ts). Strip it too; the
  // BackdropLayer child needs `overflow: hidden` + the uniform borderRadius so
  // the absolutely-filling blur surface clips to the box.
  const hasGradient =
    !isWeb && GRADIENT_DESCRIPTOR_PROP in (resolved.styles as object);
  const backdropFilter = isWeb
    ? undefined
    : (resolved.styles as Record<string, unknown>)[BACKDROP_FILTER_PROP];
  // Runtime-only animated gradient angle. On native, the JS driver interpolates
  // the track per frame and pushes the angle to the applier via the JSI channel;
  // on web the browser animates it (via @property/keyframes), so the driver is a
  // no-op. In both cases the marker must be stripped from the RN style below.
  const gradientAngleTrack = isWeb
    ? undefined
    : ((resolved.styles as Record<string, unknown>)[GRADIENT_ANGLE_PROP] as
        | GradientAngleTrack
        | undefined);
  const composedRef = useMemo(() => {
    // A plain provider-managed View has no native registration and no caller
    // ref, so passing a ref callback would be pure mount/unmount overhead.
    if (!ref && gradientAngleTrack === undefined) return undefined;
    return (node: RNViewType | null) => {
      nodeRef.current = node;
      assignRef(ref, node);
    };
  }, [ref, gradientAngleTrack]);
  // These extra visual-effect markers (clip-path/background-image) are already
  // routed by normalize (→ real CSS on web, deleted on native). Belt-and-braces:
  // strip the MARKER names here too so RN never warns on an unknown prop. On web
  // normalize has already converted them to real CSS props (clipPath/
  // backgroundImage/…) which are NOT stripped — only the marker names are.
  const hasNewEffectMarker =
    !isWeb &&
    (gradientAngleTrack !== undefined ||
      CLIP_PATH_PROP in (resolved.styles as object) ||
      BACKGROUND_IMAGE_PROP in (resolved.styles as object));
  const { viewStyles, layerBorderRadius, backdropRadius } = useMemo(() => {
    if (!hasGradient && backdropFilter === undefined && !hasNewEffectMarker) {
      return {
        viewStyles: resolved.styles,
        layerBorderRadius: 0,
        backdropRadius: 0,
      };
    }
    const {
      [GRADIENT_DESCRIPTOR_PROP]: _descriptor,
      [BACKDROP_FILTER_PROP]: _backdrop,
      [GRADIENT_ANGLE_PROP]: _angle,
      [CLIP_PATH_PROP]: _clipPath,
      [BACKGROUND_IMAGE_PROP]: _bgImage,
      ...restStyles
    } = resolved.styles as Record<string, unknown>;
    const stripped = restStyles as RNStyle;
    if (backdropFilter === undefined) {
      // Gradient-only: the native layer corner-clips itself (mirrors the
      // view's radius, RN shapeLayerToMatchView-style) — no overflow forcing.
      return { viewStyles: stripped, layerBorderRadius: 0, backdropRadius: 0 };
    }
    if (stripped.overflow === undefined) stripped.overflow = "hidden";
    const radius = stripped.borderRadius;
    return {
      viewStyles: stripped,
      layerBorderRadius: typeof radius === "number" ? radius : 0,
      // v1 backdrop = blur only; non-blur backdrop functions are ignored
      // (documented TODO in parsers/filter.ts `backdropBlurRadius`).
      backdropRadius: backdropBlurRadius(backdropFilter),
    };
  }, [resolved.styles, hasGradient, backdropFilter, hasNewEffectMarker]);

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
    const animationKey = __nitrocssPseudoState
      ? `${className}|${JSON.stringify(__nitrocssPseudoState)}`
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

  // Animated gradient angle (native only). After mount, resolve the host's
  // Fabric tag via findNodeHandle(nodeRef) and start the per-frame RAF driver,
  // which interpolates the track and pushes the angle to the native applier
  // through the JSI channel. Keyed on className + pseudo state (what the track
  // derives from) so a theme-driven re-render — which mints a NEW track object
  // identity but the SAME logical animation — does not restart the loop. The
  // cleanup cancels the RAF and clears the native override on unmount/change.
  const trackRef = useRef<GradientAngleTrack | undefined>(undefined);
  trackRef.current = gradientAngleTrack;
  const angleKey =
    gradientAngleTrack === undefined
      ? ""
      : __nitrocssPseudoState
        ? `${className}|${JSON.stringify(__nitrocssPseudoState)}`
        : className;
  useEffect(() => {
    if (isWeb || !angleKey) return;
    const track = trackRef.current;
    if (!track) return;
    const tag = findNodeHandle(nodeRef.current);
    if (typeof tag !== "number") return;
    const stop = startGradientAngleDriver(tag, track);
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWeb, angleKey]);

  const webProps: Record<string, unknown> =
    isWeb && className ? { className } : {};

  // A gradient/backdrop host must stay in the mounted hierarchy: after the
  // marker is stripped its committed props can look layout-only, and Fabric's
  // view flattening would then remove the view entirely — leaving the native
  // gradient applier's `tag → mounted view` lookup with nothing to paint on.
  const preventFlattening =
    !isWeb &&
    (hasGradient ||
      backdropFilter !== undefined ||
      gradientAngleTrack !== undefined);

  const node = (
    <Base
      ref={composedRef}
      {...webProps}
      style={isWeb ? style : composedStyle}
      onLayout={gridFallback.onLayout}
      {...animationProps}
      {...rest}
      {...(preventFlattening ? { collapsable: false as const } : {})}
    >
      {!isWeb && backdropRadius > 0 ? (
        // VERY FIRST child: the blur-behind surface must paint below
        // everything else. RN paints children in source order. (Gradients are
        // NOT a child — they paint as a layer on this view's own backing
        // layer, installed natively by the engine's gradient applier.)
        <BackdropLayer
          blurRadius={backdropRadius}
          borderRadius={layerBorderRadius}
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
