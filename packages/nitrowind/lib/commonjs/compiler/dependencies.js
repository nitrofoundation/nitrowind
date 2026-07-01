"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.union = exports.toList = exports.hasFlag = exports.flag = exports.dependencyFromValue = exports.dependencyFromSelector = exports.dependencyFromAtRule = exports.addFlag = void 0;
var _types = require("../specs/types.js");
const flag = dep => 1 << dep;
exports.flag = flag;
const addFlag = (mask, dep) => mask | flag(dep);
exports.addFlag = addFlag;
const hasFlag = (mask, dep) => (mask & flag(dep)) !== 0;
exports.hasFlag = hasFlag;
const union = (...masks) => masks.reduce((acc, m) => acc | m, 0);

/** Expand a mask into the list of `StyleDependency` values it contains. */
exports.union = union;
const toList = mask => {
  const out = [];
  for (const dep of [_types.StyleDependency.Theme, _types.StyleDependency.ColorScheme, _types.StyleDependency.Dimensions, _types.StyleDependency.Insets, _types.StyleDependency.Orientation, _types.StyleDependency.Rtl, _types.StyleDependency.FontScale, _types.StyleDependency.Rem, _types.StyleDependency.ContainerSize, _types.StyleDependency.GroupState]) {
    if (hasFlag(mask, dep)) out.push(dep);
  }
  return out;
};

/**
 * Infer the dependency a CSS `@media`/`@container` condition introduces.
 */
exports.toList = toList;
const dependencyFromAtRule = condition => {
  const c = condition.toLowerCase();
  let mask = 0;
  if (c.includes("prefers-color-scheme")) mask = addFlag(mask, _types.StyleDependency.ColorScheme);
  // A `@container` query reads the nearest container's size, not the screen.
  if (c.startsWith("@container")) return addFlag(mask, _types.StyleDependency.ContainerSize);
  if (c.includes("width") || c.includes("height")) mask = addFlag(mask, _types.StyleDependency.Dimensions);
  if (c.includes("orientation")) mask = addFlag(mask, _types.StyleDependency.Orientation);
  if (c.includes("resolution") || c.includes("dpi")) mask = addFlag(mask, _types.StyleDependency.Dimensions);
  return mask;
};

/**
 * Infer dependencies introduced by a selector (e.g. `[dir="rtl"]`, `:root`
 * theme attributes) or by a raw value referencing a CSS variable / env().
 */
exports.dependencyFromAtRule = dependencyFromAtRule;
const dependencyFromSelector = selector => {
  const s = selector.toLowerCase();
  let mask = 0;
  if (s.includes("dir(rtl)") || s.includes('[dir="rtl"]') || s.includes("[dir=rtl]")) {
    mask = addFlag(mask, _types.StyleDependency.Rtl);
  }
  if (s.includes("[data-theme") || s.includes(".theme-")) {
    mask = addFlag(mask, _types.StyleDependency.Theme);
  }
  if (/group-(active|focus|focus-visible|focus-within|hover|disabled|enabled)/.test(s)) {
    mask = addFlag(mask, _types.StyleDependency.GroupState);
  }
  return mask;
};

/** Dependencies introduced by a raw declaration value. */
exports.dependencyFromSelector = dependencyFromSelector;
const dependencyFromValue = value => {
  let mask = 0;
  // A theme variable resolves against both the active named theme AND the
  // light/dark overlay (see `StyleEngine::effectiveVars`), so any `var(--…)`
  // reference must recompute on a theme switch *or* a color-scheme change.
  if (value.includes("var(--")) {
    mask = addFlag(mask, _types.StyleDependency.Theme);
    mask = addFlag(mask, _types.StyleDependency.ColorScheme);
  }
  if (value.includes("env(safe-area-inset")) mask = addFlag(mask, _types.StyleDependency.Insets);
  if (/\d*\.?\d+rem\b/.test(value)) mask = addFlag(mask, _types.StyleDependency.Rem);
  if (/\d*\.?\d+em\b/.test(value)) mask = addFlag(mask, _types.StyleDependency.FontScale);
  return mask;
};
exports.dependencyFromValue = dependencyFromValue;
//# sourceMappingURL=dependencies.js.map