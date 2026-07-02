import type { VarResolver } from "../insetValue";
import type { RNStyle } from "../types";

interface Decl {
  prop: string;
  value: string;
}

const VAR_RE = /var\(\s*(--[A-Za-z0-9-_]+)\s*(?:,\s*([^()]*))?\)/g;

function resolveVars(expr: string, resolveVar: VarResolver, depth = 0): string {
  if (depth > 6 || !expr.includes("var(")) return expr;
  const resolved = expr.replace(
    VAR_RE,
    (_, name: string, fallback?: string) => {
      const value = resolveVar(name);
      return value ?? (fallback !== undefined ? fallback.trim() : "");
    },
  );
  return resolved === expr
    ? resolved
    : resolveVars(resolved, resolveVar, depth + 1);
}

function normalizeFilter(value: string): string | undefined {
  const filter = value
    .replace(/\binitial\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!filter || filter === "none") return undefined;
  return filter;
}

const FILTER_RE = /([a-z-]+)\(([^)]*)\)/g;

const parseNumberOrPercent = (raw: string): number | undefined => {
  const value = raw.trim();
  if (!value) return undefined;
  if (value.endsWith("%")) return Number.parseFloat(value) / 100;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseLength = (raw: string): number | undefined => {
  const parsed = Number.parseFloat(raw.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseAngleDegrees = (raw: string): number | undefined => {
  const value = raw.trim();
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return undefined;
  if (parsed === 0 && !/[a-z%]+$/i.test(value)) return 0;
  if (value.endsWith("deg")) return parsed;
  if (value.endsWith("rad")) return (180 * parsed) / Math.PI;
  return undefined;
};

const splitArgs = (raw: string): string[] =>
  raw.trim().split(/\s+/).filter(Boolean);

function parseDropShadow(raw: string): Record<string, unknown> | undefined {
  const args = splitArgs(raw);
  const offsetX = parseLength(args[0] ?? "");
  const offsetY = parseLength(args[1] ?? "");
  if (offsetX === undefined || offsetY === undefined) return undefined;
  const standardDeviation = parseLength(args[2] ?? "0") ?? 0;
  const color = args.slice(3).join(" ") || "#000000";
  return { offsetX, offsetY, standardDeviation, color };
}

function parseFilterList(filter: string): RNStyle["filter"] | undefined {
  const out: Array<Record<string, unknown>> = [];
  let match: RegExpExecArray | null;
  FILTER_RE.lastIndex = 0;
  while ((match = FILTER_RE.exec(filter)) !== null) {
    const name = match[1]!;
    const raw = match[2]!.trim();
    switch (name) {
      case "blur": {
        const value = parseLength(raw);
        if (value !== undefined) out.push({ blur: value });
        break;
      }
      case "brightness":
      case "contrast":
      case "grayscale":
      case "invert":
      case "opacity":
      case "saturate":
      case "sepia": {
        const value = parseNumberOrPercent(raw);
        if (value !== undefined) out.push({ [name]: value });
        break;
      }
      case "hue-rotate": {
        const value = parseAngleDegrees(raw);
        if (value !== undefined) out.push({ hueRotate: value });
        break;
      }
      case "drop-shadow": {
        const value = parseDropShadow(raw);
        if (value !== undefined) out.push({ dropShadow: value });
        break;
      }
    }
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Marker prop carrying a rule's `backdrop-filter` as the same parsed
 * filter-function array shape as RN's `filter`. RN has no backdrop-filter
 * support, so the value must NOT be folded into the `filter` prop (that
 * would filter the view's own content instead of what's behind it). The
 * marker is kept out of committed RN styles (see `normalizeShadow` in
 * src/core/normalize.ts and the native engine's resolve()) until a native
 * backdrop consumer lands.
 */
export const BACKDROP_FILTER_PROP = "--nitrowind-backdrop-filter";

/**
 * React Native New Architecture accepts `filter` as an array of filter function
 * objects. Tailwind emits filters as composed `--tw-*` variables, so compile
 * the resolved CSS functions to the native object form Fabric can consume.
 * `backdrop-filter` declarations compile to the separate
 * {@link BACKDROP_FILTER_PROP} marker instead of polluting `filter`.
 */
export function extractFilter(
  declarations: ReadonlyArray<Decl>,
  resolveVar: VarResolver,
): RNStyle | undefined {
  const out: RNStyle = {};

  const rawFilter = declarations.find((d) => d.prop === "filter")?.value;
  if (rawFilter !== undefined) {
    const filter = normalizeFilter(resolveVars(rawFilter, resolveVar));
    const parsed = filter ? parseFilterList(filter) : undefined;
    if (parsed) out.filter = parsed;
  }

  const rawBackdrop = declarations.find(
    (d) => d.prop === "backdrop-filter" || d.prop === "-webkit-backdrop-filter",
  )?.value;
  if (rawBackdrop !== undefined) {
    const backdrop = normalizeFilter(resolveVars(rawBackdrop, resolveVar));
    const parsed = backdrop ? parseFilterList(backdrop) : undefined;
    if (parsed) out[BACKDROP_FILTER_PROP] = parsed;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

export const isFilterProp = (prop: string): boolean =>
  prop === "filter" || prop === "-webkit-filter";
