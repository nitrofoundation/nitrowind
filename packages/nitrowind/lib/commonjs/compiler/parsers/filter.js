"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.extractFilter = extractFilter;
exports.isFilterProp = void 0;
const VAR_RE = /var\(\s*(--[A-Za-z0-9-_]+)\s*(?:,\s*([^()]*))?\)/g;
function resolveVars(expr, resolveVar, depth = 0) {
  if (depth > 6 || !expr.includes("var(")) return expr;
  const resolved = expr.replace(VAR_RE, (_, name, fallback) => {
    const value = resolveVar(name);
    return value ?? (fallback !== undefined ? fallback.trim() : "");
  });
  return resolved === expr ? resolved : resolveVars(resolved, resolveVar, depth + 1);
}
function normalizeFilter(value) {
  const filter = value.replace(/\binitial\b/g, "").replace(/\s+/g, " ").trim();
  if (!filter || filter === "none") return undefined;
  return filter;
}
const FILTER_RE = /([a-z-]+)\(([^)]*)\)/g;
const parseNumberOrPercent = raw => {
  const value = raw.trim();
  if (!value) return undefined;
  if (value.endsWith("%")) return Number.parseFloat(value) / 100;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const parseLength = raw => {
  const parsed = Number.parseFloat(raw.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
};
const parseAngleDegrees = raw => {
  const value = raw.trim();
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return undefined;
  if (parsed === 0 && !/[a-z%]+$/i.test(value)) return 0;
  if (value.endsWith("deg")) return parsed;
  if (value.endsWith("rad")) return 180 * parsed / Math.PI;
  return undefined;
};
const splitArgs = raw => raw.trim().split(/\s+/).filter(Boolean);
function parseDropShadow(raw) {
  const args = splitArgs(raw);
  const offsetX = parseLength(args[0] ?? "");
  const offsetY = parseLength(args[1] ?? "");
  if (offsetX === undefined || offsetY === undefined) return undefined;
  const standardDeviation = parseLength(args[2] ?? "0") ?? 0;
  const color = args.slice(3).join(" ") || "#000000";
  return {
    offsetX,
    offsetY,
    standardDeviation,
    color
  };
}
function parseFilterList(filter) {
  const out = [];
  let match;
  FILTER_RE.lastIndex = 0;
  while ((match = FILTER_RE.exec(filter)) !== null) {
    const name = match[1];
    const raw = match[2].trim();
    switch (name) {
      case "blur":
        {
          const value = parseLength(raw);
          if (value !== undefined) out.push({
            blur: value
          });
          break;
        }
      case "brightness":
      case "contrast":
      case "grayscale":
      case "invert":
      case "opacity":
      case "saturate":
      case "sepia":
        {
          const value = parseNumberOrPercent(raw);
          if (value !== undefined) out.push({
            [name]: value
          });
          break;
        }
      case "hue-rotate":
        {
          const value = parseAngleDegrees(raw);
          if (value !== undefined) out.push({
            hueRotate: value
          });
          break;
        }
      case "drop-shadow":
        {
          const value = parseDropShadow(raw);
          if (value !== undefined) out.push({
            dropShadow: value
          });
          break;
        }
    }
  }
  return out.length > 0 ? out : undefined;
}

/**
 * React Native New Architecture accepts `filter` as an array of filter function
 * objects. Tailwind emits filters as composed `--tw-*` variables, so compile
 * the resolved CSS functions to the native object form Fabric can consume.
 */
function extractFilter(declarations, resolveVar) {
  const raw = declarations.find(d => d.prop === "filter" || d.prop === "backdrop-filter" || d.prop === "-webkit-backdrop-filter")?.value;
  if (raw === undefined) return undefined;
  const filter = normalizeFilter(resolveVars(raw, resolveVar));
  const parsed = filter ? parseFilterList(filter) : undefined;
  return parsed ? {
    filter: parsed
  } : undefined;
}
const isFilterProp = prop => prop === "filter" || prop === "-webkit-filter";
exports.isFilterProp = isFilterProp;
//# sourceMappingURL=filter.js.map