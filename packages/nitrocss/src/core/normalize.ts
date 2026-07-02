import { TRANSFORM_AXES } from "../compiler/parsers/transform";
import { foldGradient as foldGradientBase } from "../compiler/parsers/gradient";
import {
  formatBoxShadow,
  spliceBoxShadowColor,
  type BoxShadowValue,
} from "../compiler/parsers/boxShadow";
import type { RNStyle } from "../compiler/types";
import { Platform } from "react-native";

/**
 * Platform-gated gradient fold. Native emits the compact numeric descriptor
 * (routed by the C++ engine to the platform gradient applier, which paints a
 * CAGradientLayer on the view's own layer); web keeps a real CSS
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
  // NOTE: the `--nitrocss-backdrop-filter` marker (parsers/filter.ts) is
  // intentionally NOT stripped here anymore: `View` consumes it from the
  // JS-resolved styles to render the native `BackdropLayer`, then strips it
  // before the style reaches RN. The native C++ engine still erases it at its
  // resolve() tail so COMMITTED RN props never carry it.
  const marker = style["--nitrocss-shadow-color"];
  delete style["--nitrocss-shadow-color"];
  if (Platform.OS !== "web") {
    // The JS render path paints native shadows via the legacy iOS `shadow*` /
    // Android `elevation` fallbacks the compiler emits alongside `boxShadow`.
    // The processed `BoxShadowValue[]` the compiler now emits is for the
    // native C++ engine, whose ShadowTree re-commits splice the marker into
    // each layer and commit the array directly (NitroCssEngine.cpp
    // `normalizeShadow`) — parseable by stable RN without the experimental
    // `enableNativeCSSParsing` flag.
    delete style.boxShadow;
    return;
  }
  const boxShadow = style.boxShadow;
  if (Array.isArray(boxShadow)) {
    // The compiler emits processed `BoxShadowValue[]`; the browser owns the
    // paint on web, so fold it back into a CSS string, splicing the
    // theme-resolved shadow color into every layer first.
    const layers =
      typeof marker === "string"
        ? spliceBoxShadowColor(boxShadow as BoxShadowValue[], marker)
        : (boxShadow as BoxShadowValue[]);
    style.boxShadow = formatBoxShadow(layers);
    return;
  }
  // String fallback: layers the compiler could not lower to the processed
  // form (non-px units in arbitrary values) stay a CSS string on web; splice
  // the theme-resolved color by regex as before.
  if (typeof marker !== "string" || typeof boxShadow !== "string") {
    return;
  }
  style.boxShadow = boxShadow.replace(BOX_SHADOW_COLOR_RE, marker);
}
