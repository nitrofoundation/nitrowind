import { formatHex, formatHex8, parse as parseColor } from "culori";
import type { VarResolver } from "../insetValue";
import type { RNStyle } from "../types";

export const NATIVE_EFFECTS_PROP = "--nitrocss-native-effects";

export interface EffectShadow {
  inset: boolean;
  offsetX: number;
  offsetY: number;
  blurRadius: number;
  spreadDistance: number;
  color: string;
}

export type EffectFilter =
  | { type: "blur"; radius: number }
  | { type: "hueRotate"; degrees: number }
  | { type: "dropShadow"; shadow: EffectShadow }
  | {
      type:
        | "brightness"
        | "contrast"
        | "grayscale"
        | "invert"
        | "opacity"
        | "saturate"
        | "sepia";
      amount: number;
    };

export interface EffectOutline {
  width: number;
  style: "solid" | "dashed" | "dotted" | "double";
  color: string;
  offset: number;
}

export interface NativeEffectsDescriptor {
  shadows?: EffectShadow[];
  filters?: EffectFilter[];
  backdropFilters?: EffectFilter[];
  mixBlendMode?: EffectBlendMode;
  isolation?: "auto" | "isolate";
  outline?: EffectOutline;
  borderCurve?: "circular" | "continuous";
}

/**
 * Compose descriptors from separate utility classes. `undefined` means the
 * later class did not mention that family; an empty list is an explicit CSS
 * `none` and therefore clears an earlier list.
 */
export function mergeNativeEffectsDescriptors(
  ...descriptors: ReadonlyArray<NativeEffectsDescriptor | undefined>
): NativeEffectsDescriptor | undefined {
  const merged: NativeEffectsDescriptor = {};
  for (const descriptor of descriptors) {
    if (!descriptor) continue;
    if (descriptor.shadows !== undefined) merged.shadows = descriptor.shadows;
    if (descriptor.filters !== undefined) merged.filters = descriptor.filters;
    if (descriptor.backdropFilters !== undefined) {
      merged.backdropFilters = descriptor.backdropFilters;
    }
    if (descriptor.mixBlendMode !== undefined) {
      merged.mixBlendMode = descriptor.mixBlendMode;
    }
    if (descriptor.isolation !== undefined) merged.isolation = descriptor.isolation;
    if (descriptor.outline !== undefined) merged.outline = descriptor.outline;
    if (descriptor.borderCurve !== undefined) merged.borderCurve = descriptor.borderCurve;
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

export type EffectBlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion"
  | "hue"
  | "saturation"
  | "color"
  | "luminosity";

interface Decl {
  prop: string;
  value: string;
}

const BLEND_MODES = new Set<EffectBlendMode>([
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
]);
const OUTLINE_STYLES = new Set<EffectOutline["style"]>([
  "solid",
  "dashed",
  "dotted",
  "double",
]);
const LENGTH_RE = /^([+-]?(?:\d*\.\d+|\d+))(?:px)?$/i;
const VAR_RE = /var\(\s*(--[A-Za-z0-9-_]+)\s*(?:,\s*([^()]*))?\)/g;

function resolveVars(value: string, resolveVar: VarResolver, depth = 0): string {
  if (depth > 8 || !value.includes("var(")) return value;
  const next = value.replace(VAR_RE, (_, name: string, fallback?: string) =>
    resolveVar(name) ?? fallback?.trim() ?? "",
  );
  return next === value ? next : resolveVars(next, resolveVar, depth + 1);
}

function splitTopLevel(value: string, separator: "," | "space"): string[] {
  const out: string[] = [];
  let start = 0;
  let depth = 0;
  let quote = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]!;
    if (quote) {
      if (char === quote && value[index - 1] !== "\\") quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "(") depth += 1;
    else if (char === ")") depth = Math.max(0, depth - 1);
    const isSeparator = separator === "," ? char === "," : /\s/.test(char);
    if (depth === 0 && isSeparator) {
      const token = value.slice(start, index).trim();
      if (token) out.push(token);
      start = index + 1;
      if (separator === "space") {
        while (/\s/.test(value[index + 1] ?? "")) index += 1;
        start = index + 1;
      }
    }
  }
  const token = value.slice(start).trim();
  if (token) out.push(token);
  return out;
}

function length(value: string): number | undefined {
  const match = LENGTH_RE.exec(value.trim());
  if (!match) return undefined;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function color(value: string): string | undefined {
  const parsed = parseColor(value.trim());
  if (!parsed) return undefined;
  return (parsed.alpha ?? 1) < 1
    ? formatHex8(parsed)
    : formatHex({ ...parsed, alpha: 1 });
}

export function parseEffectShadow(value: string): EffectShadow | undefined {
  const tokens = splitTopLevel(value, "space");
  const lengths: number[] = [];
  let inset = false;
  let shadowColor: string | undefined;
  for (const token of tokens) {
    if (token.toLowerCase() === "inset") {
      if (inset) return undefined;
      inset = true;
      continue;
    }
    const parsedLength = length(token);
    if (parsedLength !== undefined && lengths.length < 4) {
      lengths.push(parsedLength);
      continue;
    }
    const parsedColor = color(token);
    if (!parsedColor || shadowColor) return undefined;
    shadowColor = parsedColor;
  }
  if (lengths.length < 2 || (lengths[2] ?? 0) < 0) return undefined;
  return {
    inset,
    offsetX: lengths[0]!,
    offsetY: lengths[1]!,
    blurRadius: lengths[2] ?? 0,
    spreadDistance: lengths[3] ?? 0,
    color: shadowColor ?? "#000000",
  };
}

export function parseEffectShadows(value: string): EffectShadow[] | undefined {
  if (value.trim().toLowerCase() === "none") return [];
  const shadows = splitTopLevel(value, ",").map(parseEffectShadow);
  return shadows.length > 0 && shadows.every(Boolean)
    ? (shadows as EffectShadow[])
    : undefined;
}

function parseAmount(raw: string): number | undefined {
  const value = raw.trim();
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return undefined;
  return value.endsWith("%") ? parsed / 100 : parsed;
}

function parseDegrees(raw: string): number | undefined {
  const value = raw.trim().toLowerCase();
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return undefined;
  if (value.endsWith("deg")) return parsed;
  if (value.endsWith("rad")) return (parsed * 180) / Math.PI;
  if (value.endsWith("turn")) return parsed * 360;
  return parsed === 0 ? 0 : undefined;
}

/** Parse a complete CSS filter list without silently accepting stray text. */
export function parseEffectFilters(value: string): EffectFilter[] | undefined {
  const input = value.trim();
  if (input.toLowerCase() === "none") return [];
  const filters: EffectFilter[] = [];
  let cursor = 0;
  while (cursor < input.length) {
    while (/\s/.test(input[cursor] ?? "")) cursor += 1;
    const nameMatch = /^[a-z-]+/i.exec(input.slice(cursor));
    if (!nameMatch) return undefined;
    const name = nameMatch[0]!.toLowerCase();
    cursor += name.length;
    if (input[cursor] !== "(") return undefined;
    const argumentStart = ++cursor;
    let depth = 1;
    while (cursor < input.length && depth > 0) {
      if (input[cursor] === "(") depth += 1;
      else if (input[cursor] === ")") depth -= 1;
      cursor += 1;
    }
    if (depth !== 0) return undefined;
    const raw = input.slice(argumentStart, cursor - 1).trim();
    if (name === "blur") {
      const radius = length(raw);
      if (radius === undefined || radius < 0) return undefined;
      filters.push({ type: "blur", radius });
    } else if (name === "hue-rotate") {
      const degrees = parseDegrees(raw);
      if (degrees === undefined) return undefined;
      filters.push({ type: "hueRotate", degrees });
    } else if (name === "drop-shadow") {
      const shadow = parseEffectShadow(raw);
      if (!shadow || shadow.inset || shadow.spreadDistance !== 0) return undefined;
      filters.push({ type: "dropShadow", shadow });
    } else if (
      [
        "brightness",
        "contrast",
        "grayscale",
        "invert",
        "opacity",
        "saturate",
        "sepia",
      ].includes(name)
    ) {
      const amount = parseAmount(raw);
      if (amount === undefined || amount < 0) return undefined;
      filters.push({
        type: name as Extract<EffectFilter, { amount: number }>["type"],
        amount,
      });
    } else {
      return undefined;
    }
  }
  return filters.length > 0 ? filters : undefined;
}

function parseOutline(declarations: ReadonlyArray<Decl>): EffectOutline | undefined {
  const shorthand = declarations.find((decl) => decl.prop === "outline")?.value;
  let width: number | undefined;
  let style: EffectOutline["style"] | undefined;
  let outlineColor: string | undefined;
  if (shorthand && shorthand.trim().toLowerCase() !== "none") {
    for (const token of splitTopLevel(shorthand, "space")) {
      const parsedWidth = length(token);
      const normalized = token.toLowerCase();
      if (parsedWidth !== undefined) width = parsedWidth;
      else if (OUTLINE_STYLES.has(normalized as EffectOutline["style"])) {
        style = normalized as EffectOutline["style"];
      } else {
        outlineColor = color(token) ?? outlineColor;
      }
    }
  }
  const widthDecl = declarations.find((decl) => decl.prop === "outline-width")?.value;
  const styleDecl = declarations.find((decl) => decl.prop === "outline-style")?.value?.toLowerCase();
  const colorDecl = declarations.find((decl) => decl.prop === "outline-color")?.value;
  const offsetDecl = declarations.find((decl) => decl.prop === "outline-offset")?.value;
  if (widthDecl) width = length(widthDecl);
  if (styleDecl && OUTLINE_STYLES.has(styleDecl as EffectOutline["style"])) {
    style = styleDecl as EffectOutline["style"];
  }
  if (colorDecl) outlineColor = color(colorDecl);
  const offset = offsetDecl ? length(offsetDecl) : 0;
  if (width === undefined && !style && !outlineColor && offset === 0) return undefined;
  if (width === undefined || width < 0 || offset === undefined) return undefined;
  return {
    width,
    style: style ?? "solid",
    color: outlineColor ?? "#000000",
    offset,
  };
}

/**
 * Compile the effect declarations into one immutable, native-oriented marker.
 * This parser is deliberately independent from RN's evolving style prop shape.
 */
export function extractNativeEffects(
  declarations: ReadonlyArray<Decl>,
  resolveVar: VarResolver,
): RNStyle | undefined {
  const resolved = declarations.map((decl) => ({
    prop: decl.prop.toLowerCase(),
    value: resolveVars(decl.value, resolveVar),
  }));
  const descriptor: NativeEffectsDescriptor = {};
  const shadow = resolved.find((decl) => decl.prop === "box-shadow")?.value;
  if (shadow !== undefined) {
    const parsed = parseEffectShadows(shadow);
    if (parsed !== undefined) descriptor.shadows = parsed;
  }
  const filter = resolved.find((decl) => decl.prop === "filter")?.value;
  if (filter !== undefined) {
    const parsed = parseEffectFilters(filter);
    if (parsed !== undefined) descriptor.filters = parsed;
  }
  const backdrop = resolved.find(
    (decl) => decl.prop === "backdrop-filter" || decl.prop === "-webkit-backdrop-filter",
  )?.value;
  if (backdrop !== undefined) {
    const parsed = parseEffectFilters(backdrop);
    if (parsed !== undefined) descriptor.backdropFilters = parsed;
  }
  const blend = resolved.find((decl) => decl.prop === "mix-blend-mode")?.value.toLowerCase();
  if (blend && BLEND_MODES.has(blend as EffectBlendMode)) {
    descriptor.mixBlendMode = blend as EffectBlendMode;
  }
  const isolation = resolved.find((decl) => decl.prop === "isolation")?.value.toLowerCase();
  if (isolation === "auto" || isolation === "isolate") descriptor.isolation = isolation;
  const outline = parseOutline(resolved);
  if (outline) descriptor.outline = outline;
  const curve = resolved.find((decl) => decl.prop === "border-curve")?.value.toLowerCase();
  if (curve === "continuous" || curve === "circular") descriptor.borderCurve = curve;
  return Object.keys(descriptor).length > 0
    ? ({ [NATIVE_EFFECTS_PROP]: descriptor } as unknown as RNStyle)
    : undefined;
}

export const isNativeEffectsProp = (prop: string): boolean =>
  [
    "box-shadow",
    "filter",
    "backdrop-filter",
    "-webkit-backdrop-filter",
    "mix-blend-mode",
    "isolation",
    "outline",
    "outline-width",
    "outline-style",
    "outline-color",
    "outline-offset",
    "border-curve",
  ].includes(prop.toLowerCase());
