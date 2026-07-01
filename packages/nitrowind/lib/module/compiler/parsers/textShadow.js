"use strict";

const VAR_RE = /var\(\s*(--[A-Za-z0-9-_]+)\s*(?:,\s*([^()]*))?\)/g;
const resolveVars = (expr, resolveVar) => expr.replace(VAR_RE, (_, name, fallback) => {
  const v = resolveVar(name);
  return v ?? (fallback !== undefined ? fallback.trim() : "");
});
/** Coerce a length token (`2px`, `1`) to a number. */
const len = token => {
  if (!token) return 0;
  const n = Number(token.replace(/px$/, ""));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Parse the first layer of a CSS `text-shadow` into RN's text-shadow props. RN
 * only supports a single text shadow, so any extra comma layers are dropped.
 */
export function extractTextShadow(declarations, resolveVar) {
  const raw = declarations.find(d => d.prop === "text-shadow")?.value;
  if (raw === undefined || raw === "none") return undefined;
  const first = resolveVars(raw, resolveVar).split(",")[0]?.trim();
  if (!first) return undefined;
  const tokens = first.split(/\s+/).filter(Boolean);
  // A token that is not a signed number is the color (`#rgba`, `rgb(...)`, …).
  const color = tokens.find(t => !/^[+-]?\.?\d/.test(t)) ?? "#000000";
  const [x, y, blur] = tokens.filter(t => t !== color);
  return {
    textShadowColor: color,
    textShadowOffset: {
      width: len(x),
      height: len(y)
    },
    textShadowRadius: len(blur)
  };
}

/** True for declarations consumed by the text-shadow parser. */
export const isTextShadowProp = prop => prop === "text-shadow";
//# sourceMappingURL=textShadow.js.map