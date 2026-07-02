import { TRANSFORM_AXES } from "../compiler/parsers/transform";
import { foldGradient as foldGradientBase } from "../compiler/parsers/gradient";
import { BACKDROP_FILTER_PROP } from "../compiler/parsers/filter";
import type { RNStyle } from "../compiler/types";
import { Platform } from "react-native";

/**
 * Platform-gated gradient fold. Native emits the compact numeric descriptor
 * (consumed by the engine's own Nitro `GradientView`); web keeps a real CSS
 * `backgroundImage` string since the browser owns the paint there. The native
 * C++ engine performs the identical descriptor fold so both paths agree.
 */
export function foldGradient(style: RNStyle): void {
  foldGradientBase(style, Platform.OS === "web" ? "css" : "descriptor");
}

/**
 * Fold the individual transform-axis props the compiler emits (`translateX`,
 * `rotate`, `scaleX`, …) into RN's single `transform` array, in canonical
 * order. Mutates `style` in place.
 *
 * Running this once after every matching class has been merged is what makes
 * multi-class transform composition behave like CSS: the same axis resolves
 * last-wins (plain object merge) while different axes union into one array.
 * The native C++ engine performs the identical fold so both paths agree.
 */
export function foldTransform(style: RNStyle): void {
  let transform: Array<Record<string, string | number>> | undefined;
  for (const axis of TRANSFORM_AXES) {
    const value = style[axis];
    if (value === undefined) continue;
    (transform ??= []).push({ [axis]: value as string | number });
    delete style[axis];
  }
  if (transform) style.transform = transform;
}

const BOX_SHADOW_COLOR_RE =
  /#(?:[0-9a-f]{3,8})\b|rgba?\([^)]*\)|hsla?\([^)]*\)|oklch\([^)]*\)|oklab\([^)]*\)|lab\([^)]*\)|lch\([^)]*\)|color\([^)]*\)/gi;

export function normalizeShadow(style: RNStyle): void {
  // `backdrop-filter` compiles to its own marker (see parsers/filter.ts) and
  // has no runtime consumer yet — strip it so it never reaches RN as a style
  // key. The native C++ engine erases it in resolve() the same way.
  delete style[BACKDROP_FILTER_PROP];
  const marker = style["--nitrowind-shadow-color"];
  delete style["--nitrowind-shadow-color"];
  if (Platform.OS !== "web") {
    delete style.boxShadow;
    return;
  }
  if (typeof marker !== "string" || typeof style.boxShadow !== "string") {
    return;
  }
  style.boxShadow = style.boxShadow.replace(BOX_SHADOW_COLOR_RE, marker);
}
