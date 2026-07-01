"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.hasFlag = exports.flag = exports.ALL_DEPENDENCIES = void 0;
exports.toList = toList;
exports.union = void 0;
var _types = require("../specs/types.js");
/** Bitmask of `StyleDependency` flags. */

/** The full set of runtime dependencies as a single mask. */
const ALL_DEPENDENCIES = exports.ALL_DEPENDENCIES = 1 << _types.StyleDependency.Theme | 1 << _types.StyleDependency.ColorScheme | 1 << _types.StyleDependency.Dimensions | 1 << _types.StyleDependency.Insets | 1 << _types.StyleDependency.Orientation | 1 << _types.StyleDependency.Rtl | 1 << _types.StyleDependency.FontScale | 1 << _types.StyleDependency.Rem | 1 << _types.StyleDependency.ContainerSize;
const flag = dependency => 1 << dependency;
exports.flag = flag;
const hasFlag = (mask, dependency) => (mask & flag(dependency)) !== 0;
exports.hasFlag = hasFlag;
const union = (...masks) => masks.reduce((acc, m) => acc | m, 0);

/** Expand a bitmask into the list of `StyleDependency` values it contains. */
exports.union = union;
function toList(mask) {
  const out = [];
  for (let bit = _types.StyleDependency.Theme; bit <= _types.StyleDependency.ContainerSize; bit++) {
    if ((mask & 1 << bit) !== 0) out.push(bit);
  }
  return out;
}
//# sourceMappingURL=mask.js.map