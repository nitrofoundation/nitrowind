"use strict";

const VAR_RE = /var\(\s*(--[A-Za-z0-9-_]+)\s*(?:,\s*([^()]*))?\)/g;
const resolveVars = (expr, resolveVar) => expr.replace(VAR_RE, (_, name, fallback) => {
  const v = resolveVar(name);
  return v ?? (fallback !== undefined ? fallback.trim() : "");
});

/**
 * Map CSS `font-variant` / `font-variant-numeric` (and the other
 * `font-variant-*` longhands) onto RN's `fontVariant` array. Tailwind composes
 * these from per-feature `--tw-*` helpers, so the value is resolved first and
 * the empty placeholders are dropped.
 */
export function extractFontVariant(declarations, resolveVar) {
  const values = declarations.filter(d => d.prop === "font-variant" || d.prop.startsWith("font-variant-")).flatMap(d => resolveVars(d.value, resolveVar).split(/\s+/)).filter(t => t && t !== "normal" && t !== "undefined");
  return values.length ? values : undefined;
}

/** True for declarations consumed by the font-variant parser. */
export const isFontVariantProp = prop => prop === "font-variant" || prop.startsWith("font-variant-");
//# sourceMappingURL=fontVariant.js.map