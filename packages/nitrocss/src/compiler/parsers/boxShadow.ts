import type { VarResolver } from "../insetValue";
import { formatHex, formatHex8, parse as parseColor } from "culori";
import type { RNStyle } from "../types";

interface Decl {
  prop: string;
  value: string;
}

const VAR_RE = /var\(\s*(--[A-Za-z0-9-_]+)\s*(?:,\s*([^()]*))?\)/g;

/** Inline `var(--x[, fallback])` references using the supplied resolver. */
const resolveVars = (expr: string, resolveVar: VarResolver): string =>
  expr.replace(VAR_RE, (_, name: string, fallback?: string) => {
    const v = resolveVar(name);
    return v ?? (fallback !== undefined ? fallback.trim() : "");
  });

// Bare numbers not already carrying a unit and not part of a hex color.
const BARE_NUMBER = /(?<![#\w.-])[+-]?(?:\d*\.\d+|\d+)(?![\w-])/g;

/**
 * One layer of RN's *processed* box shadow (the object form of
 * `BoxShadowValue` in Libraries/StyleSheet/StyleSheetTypes.js), restricted to
 * the shape RN's native parser accepts with `enableNativeCSSParsing` OFF
 * (BoxShadowPropsConversions.h `parseProcessedBoxShadow`): px lengths as
 * plain numbers and `inset` as a boolean. `color` stays a culori-lowered hex
 * string — the JS render path runs it through `processColor`, and the native
 * C++ engine (NitroCssEngine.cpp `normalizeShadow`) lowers it to a processed
 * ARGB int before committing.
 */
export type BoxShadowValue = {
  offsetX: number;
  offsetY: number;
  blurRadius?: number;
  spreadDistance?: number;
  color?: string;
  inset?: boolean;
};

/**
 * Build RN's `boxShadow` from Tailwind's `--tw-shadow` helper (the
 * `box-shadow` longhand only composes ring/inset placeholders). Layers we can
 * fully lower are emitted as processed `BoxShadowValue[]` — the only form
 * RN's native parser accepts without `enableNativeCSSParsing` — so the C++
 * engine's ShadowTree re-commits carry working shadows on stable RN. Layers
 * we cannot lower (non-px units in arbitrary values) fall back to the CSS
 * string form, which only the web runtime keeps (see core/normalize.ts).
 */
export function extractBoxShadow(
  declarations: ReadonlyArray<Decl>,
  resolveVar: VarResolver,
): RNStyle | undefined {
  const shadowColor = extractShadowColor(declarations, resolveVar);
  const raw = declarations.find((d) => d.prop === "--tw-shadow")?.value;
  if (raw === undefined) return shadowColor;
  const resolved = resolveVars(raw, resolveVar).trim();
  // `0 0 #0000` is Tailwind's transparent placeholder (shadow-none / unset).
  if (!resolved || resolved === "0 0 #0000") return shadowColor;
  const layers = parseBoxShadowLayers(resolved);
  if (layers === undefined) {
    // Web-only string fallback; native drops it (JS + C++ normalizeShadow).
    const boxShadow = resolved.replace(BARE_NUMBER, (m) => `${m}px`);
    return { boxShadow, ...shadowColor };
  }
  return { boxShadow: layers, ...extractNativeShadow(layers), ...shadowColor };
}

function extractShadowColor(
  declarations: ReadonlyArray<Decl>,
  resolveVar: VarResolver,
): RNStyle | undefined {
  const raw = declarations.find((d) => d.prop === "--tw-shadow-color")?.value;
  if (raw === undefined || raw === "initial") return undefined;
  if (/\bcolor-mix\(/i.test(raw)) return undefined;
  if (raw.includes("var(")) {
    return {
      shadowColor: raw,
      shadowOpacity: 1,
      "--nitrowind-shadow-color": raw,
    };
  }
  const resolved = resolveVars(raw, resolveVar).trim();
  const parsed = parseColor(resolved);
  if (!parsed) return undefined;
  const alpha = parsed.alpha ?? 1;
  return {
    shadowColor: formatHex({ ...parsed, alpha: 1 }),
    shadowOpacity: alpha,
    "--nitrowind-shadow-color":
      alpha < 1 ? formatHex8(parsed) : formatHex({ ...parsed, alpha: 1 }),
  };
}

// Layer / token splitting mirrors RN's processBoxShadow.js: commas and
// whitespace outside parentheses.
const COMMA_SPLIT_RE = /,(?![^()]*\))/;
const WHITESPACE_SPLIT_RE = /\s+(?![^(]*\))/;
// px lengths plus the bare numbers the compiler historically treated as px.
const LENGTH_TOKEN_RE = /^([+-]?(?:\d*\.\d+|\d+))(?:px)?$/;

/**
 * Parse a resolved CSS box-shadow list into processed layers, replicating
 * `parseBoxShadowString` in RN's processBoxShadow.js (including its
 * all-or-nothing error handling), with two compiler-side differences: bare
 * numbers count as px (matching our historical string emission), and colors
 * are lowered to canonical hex via culori. Returns `undefined` when any layer
 * cannot be lowered.
 */
function parseBoxShadowLayers(
  resolved: string,
): BoxShadowValue[] | undefined {
  const layers: BoxShadowValue[] = [];
  for (const rawLayer of resolved
    .split(COMMA_SPLIT_RE)
    .map((layer) => layer.trim())
    .filter((layer) => layer !== "")) {
    const layer = parseBoxShadowLayer(rawLayer);
    if (layer === undefined) return undefined;
    layers.push(layer);
  }
  return layers.length > 0 ? layers : undefined;
}

function parseBoxShadowLayer(rawLayer: string): BoxShadowValue | undefined {
  const lengths: number[] = [];
  let color: string | undefined;
  let inset: boolean | undefined;
  // Like RN, lengths must form one contiguous run: a color/inset keyword may
  // come before or after them, but not interrupt them.
  let keywordAfterLengths = false;

  for (const token of rawLayer.split(WHITESPACE_SPLIT_RE)) {
    if (!token) continue;
    const length = LENGTH_TOKEN_RE.exec(token);
    if (length) {
      if (keywordAfterLengths || lengths.length >= 4) return undefined;
      lengths.push(Number(length[1]));
      continue;
    }
    if (token === "inset") {
      if (inset !== undefined) return undefined;
      if (lengths.length > 0) keywordAfterLengths = true;
      inset = true;
      continue;
    }
    const parsed = parseColor(token);
    if (!parsed || color !== undefined) return undefined;
    if (lengths.length > 0) keywordAfterLengths = true;
    color =
      (parsed.alpha ?? 1) < 1
        ? formatHex8(parsed)
        : formatHex({ ...parsed, alpha: 1 });
  }

  if (lengths.length < 2) return undefined;
  const [offsetX, offsetY, blurRadius, spreadDistance] = lengths;
  // RN rejects negative blur radii (processBoxShadow returns []).
  if (blurRadius !== undefined && blurRadius < 0) return undefined;

  const layer: BoxShadowValue = { offsetX: offsetX!, offsetY: offsetY! };
  if (blurRadius !== undefined) layer.blurRadius = blurRadius;
  if (spreadDistance !== undefined) layer.spreadDistance = spreadDistance;
  if (color !== undefined) layer.color = color;
  if (inset) layer.inset = true;
  return layer;
}

/**
 * Return new layers with every layer's `color` replaced by the theme-resolved
 * `--nitrowind-shadow-color` marker value. Never mutates the input — the
 * layer objects are shared compiled-artifact state. The native C++ engine
 * performs the identical splice (NitroCssEngine.cpp `normalizeShadow`).
 */
export function spliceBoxShadowColor(
  layers: ReadonlyArray<BoxShadowValue>,
  color: string,
): BoxShadowValue[] {
  return layers.map((layer) => ({ ...layer, color }));
}

/** Serialize processed layers back to the CSS string the web runtime keeps. */
export function formatBoxShadow(
  layers: ReadonlyArray<BoxShadowValue>,
): string {
  return layers.map(formatBoxShadowLayer).join(", ");
}

function formatBoxShadowLayer(layer: BoxShadowValue): string {
  const parts: string[] = [];
  if (layer.inset) parts.push("inset");
  parts.push(`${layer.offsetX}px`, `${layer.offsetY}px`);
  if (layer.blurRadius !== undefined || layer.spreadDistance !== undefined) {
    parts.push(`${layer.blurRadius ?? 0}px`);
  }
  if (layer.spreadDistance !== undefined) {
    parts.push(`${layer.spreadDistance}px`);
  }
  if (layer.color !== undefined) parts.push(layer.color);
  return parts.join(" ");
}

/**
 * Derive the legacy iOS `shadow*` props (and the Android `elevation`
 * approximation) from the first layer — these are what the JS render path
 * paints natively (core/normalize.ts strips `boxShadow` there).
 */
function extractNativeShadow(
  layers: ReadonlyArray<BoxShadowValue>,
): RNStyle {
  const first = layers[0];
  if (!first || first.inset) return {};

  const parsedColor = first.color ? parseColor(first.color) : undefined;
  const opacity = parsedColor?.alpha ?? 1;
  const blur = Math.max(0, first.blurRadius ?? 0);

  return {
    ...(parsedColor
      ? { shadowColor: formatHex({ ...parsedColor, alpha: 1 }) }
      : {}),
    shadowOffset: { width: first.offsetX, height: first.offsetY },
    shadowOpacity: opacity,
    shadowRadius: blur,
    elevation: Math.max(
      1,
      Math.round(Math.max(Math.abs(first.offsetY), blur) / 2),
    ),
  };
}

/** True for declarations consumed by the box-shadow parser. */
export const isBoxShadowProp = (prop: string): boolean =>
  prop === "box-shadow" || prop === "-webkit-box-shadow";
