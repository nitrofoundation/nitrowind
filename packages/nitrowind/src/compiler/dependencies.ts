import { StyleDependency } from "../specs/types";
import type { DependencyMask } from "./types";

export const flag = (dep: StyleDependency): DependencyMask => 1 << dep;

export const addFlag = (
  mask: DependencyMask,
  dep: StyleDependency,
): DependencyMask => mask | flag(dep);

export const hasFlag = (mask: DependencyMask, dep: StyleDependency): boolean =>
  (mask & flag(dep)) !== 0;

export const union = (...masks: DependencyMask[]): DependencyMask =>
  masks.reduce((acc, m) => acc | m, 0);

/** Expand a mask into the list of `StyleDependency` values it contains. */
export const toList = (mask: DependencyMask): StyleDependency[] => {
  const out: StyleDependency[] = [];
  for (const dep of [
    StyleDependency.Theme,
    StyleDependency.ColorScheme,
    StyleDependency.Dimensions,
    StyleDependency.Insets,
    StyleDependency.Orientation,
    StyleDependency.Rtl,
    StyleDependency.FontScale,
    StyleDependency.Rem,
    StyleDependency.ContainerSize,
  ]) {
    if (hasFlag(mask, dep)) out.push(dep);
  }
  return out;
};

/**
 * Infer the dependency a CSS `@media`/`@container` condition introduces.
 */
export const dependencyFromAtRule = (condition: string): DependencyMask => {
  const c = condition.toLowerCase();
  let mask = 0;
  if (c.includes("prefers-color-scheme"))
    mask = addFlag(mask, StyleDependency.ColorScheme);
  // A `@container` query reads the nearest container's size, not the screen.
  if (c.startsWith("@container"))
    return addFlag(mask, StyleDependency.ContainerSize);
  if (c.includes("width") || c.includes("height"))
    mask = addFlag(mask, StyleDependency.Dimensions);
  if (c.includes("orientation"))
    mask = addFlag(mask, StyleDependency.Orientation);
  if (c.includes("resolution") || c.includes("dpi"))
    mask = addFlag(mask, StyleDependency.Dimensions);
  return mask;
};

/**
 * Infer dependencies introduced by a selector (e.g. `[dir="rtl"]`, `:root`
 * theme attributes) or by a raw value referencing a CSS variable / env().
 */
export const dependencyFromSelector = (selector: string): DependencyMask => {
  const s = selector.toLowerCase();
  let mask = 0;
  if (
    s.includes("dir(rtl)") ||
    s.includes('[dir="rtl"]') ||
    s.includes("[dir=rtl]")
  ) {
    mask = addFlag(mask, StyleDependency.Rtl);
  }
  if (s.includes("[data-theme") || s.includes(".theme-")) {
    mask = addFlag(mask, StyleDependency.Theme);
  }
  return mask;
};

/** Dependencies introduced by a raw declaration value. */
export const dependencyFromValue = (value: string): DependencyMask => {
  let mask = 0;
  // A theme variable resolves against both the active named theme AND the
  // light/dark overlay (see `StyleEngine::effectiveVars`), so any `var(--…)`
  // reference must recompute on a theme switch *or* a color-scheme change.
  if (value.includes("var(--")) {
    mask = addFlag(mask, StyleDependency.Theme);
    mask = addFlag(mask, StyleDependency.ColorScheme);
  }
  if (value.includes("env(safe-area-inset"))
    mask = addFlag(mask, StyleDependency.Insets);
  if (/\d*\.?\d+rem\b/.test(value)) mask = addFlag(mask, StyleDependency.Rem);
  if (/\d*\.?\d+em\b/.test(value))
    mask = addFlag(mask, StyleDependency.FontScale);
  return mask;
};
