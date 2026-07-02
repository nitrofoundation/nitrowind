import React, { memo, useEffect, useMemo, useRef } from "react";
import type { ComponentType } from "react";
import { Platform, StyleSheet } from "react-native";
import type { GradientDescriptor } from "../compiler/parsers/gradient";
import type { RNStyle } from "../compiler/types";
import { getEngine, hasNativeEngine } from "../core/native";
import type { GradientRegistry, GradientView } from "../specs";

export type { GradientDescriptor };
export { GRADIENT_DESCRIPTOR_PROP } from "../compiler/parsers/gradient";

/** Props the Nitro `GradientView` host component accepts from JSX. */
interface GradientHostProps {
  style?: unknown;
  gradientType: GradientDescriptor["gradientType"];
  angle: number;
  positionX: number;
  positionY: number;
  colors: string[];
  locations: number[];
  borderRadius: number;
  /** Nitro-wrapped ref callback delivering the hybrid object on mount. */
  hybridRef?: unknown;
}

let cachedHost: ComponentType<GradientHostProps> | null | undefined;

/**
 * The engine's own Nitro `GradientView` host component, lazily resolved (same
 * pattern as `components/animated.ts`): `null` on web or when the native
 * module / nitrogen output isn't available, so callers degrade gracefully.
 */
export function getGradientView(): ComponentType<GradientHostProps> | null {
  if (cachedHost !== undefined) return cachedHost;
  if (Platform.OS === "web") return (cachedHost = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getHostComponent } = require("react-native-nitro-modules");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const viewConfig = require("../../nitrogen/generated/shared/json/GradientViewConfig.json");
    cachedHost = getHostComponent(
      "GradientView",
      () => viewConfig,
    ) as ComponentType<GradientHostProps>;
  } catch {
    cachedHost = null;
  }
  return cachedHost;
}

/** Nitro's `callback(...)` wrapper, lazily resolved for web safety. */
function wrapCallback<T>(fn: T): unknown {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { callback } = require("react-native-nitro-modules");
    return callback(fn);
  } catch {
    return undefined;
  }
}

function getGradientRegistry(): GradientRegistry | null {
  if (Platform.OS === "web" || !hasNativeEngine()) return null;
  try {
    return getEngine()?.Gradients ?? null;
  } catch {
    return null;
  }
}

/** Extract the parent's uniform corner radius so the gradient self-clips. */
export function pickBorderRadius(style: RNStyle): number {
  const radius = style.borderRadius;
  return typeof radius === "number" ? radius : 0;
}

export interface GradientLayerProps {
  descriptor: GradientDescriptor;
  borderRadius: number;
  /**
   * The owning component's full className. Linked to the native
   * `GradientRegistry` so the C++ engine re-folds and pushes the descriptor on
   * Theme/ColorScheme change — no JS re-render (engine-v2 locked decision).
   */
  className: string;
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
 * The absolutely-filling gradient paint, rendered as the FIRST child of a
 * `View` whose resolved style carried `--nitrowind-gradient`. Pointer-events
 * off; paints behind the real children (RN paints children in source order).
 */
export const GradientLayer = memo(function GradientLayer({
  descriptor,
  borderRadius,
  className,
}: GradientLayerProps) {
  const Host = getGradientView();
  const registry = getGradientRegistry();
  const linkedView = useRef<GradientView | null>(null);
  const classNameRef = useRef(className);
  classNameRef.current = className;

  // Deliver the hybrid object to the native GradientRegistry so the C++
  // engine owns theme-reactive updates for this view. The wrapped callback is
  // deliberately STABLE for the component's lifetime (a new hybridRef identity
  // would make Fabric re-deliver it in an order that can race the unlink
  // cleanup); className changes re-link through the effect below instead.
  const hybridRef = useMemo(() => {
    if (!registry) return undefined;
    return wrapCallback((view: GradientView) => {
      linkedView.current = view;
      try {
        registry.link(view, classNameRef.current);
      } catch {
        /* native registry is best-effort; first-paint props still painted */
      }
    });
  }, [registry]);

  // Re-link with the new className once we already hold the hybrid object.
  useEffect(() => {
    const view = linkedView.current;
    if (registry && view) {
      try {
        registry.link(view, className);
      } catch {
        /* best-effort */
      }
    }
  }, [registry, className]);

  // Unlink only on unmount (the registry also self-prunes expired views).
  useEffect(() => {
    return () => {
      const view = linkedView.current;
      linkedView.current = null;
      if (registry && view) {
        try {
          registry.unlink(view);
        } catch {
          /* view already dropped */
        }
      }
    };
  }, [registry]);

  if (!Host) return null;
  return (
    <Host
      style={styles.fill}
      gradientType={descriptor.gradientType}
      angle={descriptor.angle}
      positionX={descriptor.positionX}
      positionY={descriptor.positionY}
      colors={descriptor.colors}
      locations={descriptor.locations}
      borderRadius={borderRadius}
      hybridRef={hybridRef}
    />
  );
});
