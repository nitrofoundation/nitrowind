"use strict";

import { StyleDependency } from "../specs/types.js";

/** Bitmask of `StyleDependency` flags. */

/** The full set of runtime dependencies as a single mask. */
export const ALL_DEPENDENCIES = 1 << StyleDependency.Theme | 1 << StyleDependency.ColorScheme | 1 << StyleDependency.Dimensions | 1 << StyleDependency.Insets | 1 << StyleDependency.Orientation | 1 << StyleDependency.Rtl | 1 << StyleDependency.FontScale | 1 << StyleDependency.Rem | 1 << StyleDependency.ContainerSize;
export const flag = dependency => 1 << dependency;
export const hasFlag = (mask, dependency) => (mask & flag(dependency)) !== 0;
export const union = (...masks) => masks.reduce((acc, m) => acc | m, 0);

/** Expand a bitmask into the list of `StyleDependency` values it contains. */
export function toList(mask) {
  const out = [];
  for (let bit = StyleDependency.Theme; bit <= StyleDependency.ContainerSize; bit++) {
    if ((mask & 1 << bit) !== 0) out.push(bit);
  }
  return out;
}
//# sourceMappingURL=mask.js.map