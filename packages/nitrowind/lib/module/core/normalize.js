"use strict";

import { TRANSFORM_AXES } from "../compiler/parsers/transform.js";
import { Platform } from "react-native";

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
export function foldTransform(style) {
  let transform;
  for (const axis of TRANSFORM_AXES) {
    const value = style[axis];
    if (value === undefined) continue;
    (transform ??= []).push({
      [axis]: value
    });
    delete style[axis];
  }
  if (transform) style.transform = transform;
}
const BOX_SHADOW_COLOR_RE = /#(?:[0-9a-f]{3,8})\b|rgba?\([^)]*\)|hsla?\([^)]*\)|oklch\([^)]*\)|oklab\([^)]*\)|lab\([^)]*\)|lch\([^)]*\)|color\([^)]*\)/gi;
export function normalizeShadow(style) {
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
//# sourceMappingURL=normalize.js.map