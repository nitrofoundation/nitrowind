import React, { memo } from "react";
import type { ComponentType } from "react";
import { Platform, StyleSheet } from "react-native";

export {
  BACKDROP_FILTER_PROP,
  backdropBlurRadius,
} from "../compiler/parsers/filter";

/** Props the Nitro `BackdropView` host component accepts from JSX. */
interface BackdropHostProps {
  style?: unknown;
  blurRadius: number;
  borderRadius: number;
}

let cachedHost: ComponentType<BackdropHostProps> | null | undefined;

/**
 * The engine's own Nitro `BackdropView` host component, lazily resolved (same
 * pattern as `components/gradient.tsx`): `null` on web or when the native
 * module / nitrogen output isn't available, so callers degrade gracefully.
 */
export function getBackdropView(): ComponentType<BackdropHostProps> | null {
  if (cachedHost !== undefined) return cachedHost;
  if (Platform.OS === "web") return (cachedHost = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getHostComponent } = require("react-native-nitro-modules");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const viewConfig = require("../../nitrogen/generated/shared/json/BackdropViewConfig.json");
    cachedHost = getHostComponent(
      "BackdropView",
      () => viewConfig,
    ) as ComponentType<BackdropHostProps>;
  } catch {
    cachedHost = null;
  }
  return cachedHost;
}

export interface BackdropLayerProps {
  /** CSS blur radius (dp/pt), already folded from the marker's filter array. */
  blurRadius: number;
  /** The owning view's uniform corner radius so the blur self-clips. */
  borderRadius: number;
}

const styles = StyleSheet.create({
  fill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // Style-level pointerEvents (the `pointerEvents` PROP is deprecated in RN).
    pointerEvents: "none",
  },
});

/**
 * The absolutely-filling blur-behind surface, rendered as the VERY FIRST child
 * of a `View` whose resolved style carried `--nitrowind-backdrop-filter`
 * (before `GradientLayer`, which must paint over it; RN paints children in
 * source order). Pointer-events off.
 *
 * Unlike `GradientLayer` there is no native registry link: the blur radius is
 * a plain number with no theme/scheme dependency, so first-paint props are the
 * whole story. v1 renders on iOS only — Android's `HybridBackdropView` is a
 * documented graceful stub (no public backdrop primitive).
 */
export const BackdropLayer = memo(function BackdropLayer({
  blurRadius,
  borderRadius,
}: BackdropLayerProps) {
  const Host = getBackdropView();
  if (!Host || blurRadius <= 0) return null;
  return (
    <Host
      style={styles.fill}
      blurRadius={blurRadius}
      borderRadius={borderRadius}
    />
  );
});
