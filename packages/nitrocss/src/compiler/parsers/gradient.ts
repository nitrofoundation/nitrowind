import type { VarResolver } from "../insetValue";
import { formatHex, formatHex8, parse as parseColor } from "culori";
import type { RNStyle } from "../types";

interface Decl {
  prop: string;
  value: string;
}

/**
 * Tailwind v4 splits a gradient across several utilities: `bg-linear-*` /
 * `bg-radial` set the gradient *type* + geometry, while `from-*` / `via-*` /
 * `to-*` each contribute a color stop through the `--tw-gradient-*` custom-prop
 * chain. Those tokens compile to *separate* class buckets in nitrowind, so the
 * pieces can only be reassembled once every matching class has merged — exactly
 * like the per-axis transform props. We therefore emit the atomic pieces as our
 * own `--nw-gradient-*` custom props and fold them into RN's native
 * `experimental_backgroundImage` at resolve time (see the runtime `foldGradient`
 * in `nitrowind/src/core/normalize.ts`, which delegates to {@link foldGradient}).
 */
export const GRADIENT_TYPE_PROP = "--nw-gradient-type";
export const GRADIENT_POSITION_PROP = "--nw-gradient-position";
export const GRADIENT_FROM_PROP = "--nw-gradient-from";
export const GRADIENT_VIA_PROP = "--nw-gradient-via";
export const GRADIENT_TO_PROP = "--nw-gradient-to";
export const GRADIENT_FROM_POSITION_PROP = "--nw-gradient-from-position";
export const GRADIENT_VIA_POSITION_PROP = "--nw-gradient-via-position";
export const GRADIENT_TO_POSITION_PROP = "--nw-gradient-to-position";

/** Every marker prop the parser can emit — cleared by the fold once consumed. */
export const GRADIENT_STYLE_PROPS = [
  GRADIENT_TYPE_PROP,
  GRADIENT_POSITION_PROP,
  GRADIENT_FROM_PROP,
  GRADIENT_VIA_PROP,
  GRADIENT_TO_PROP,
  GRADIENT_FROM_POSITION_PROP,
  GRADIENT_VIA_POSITION_PROP,
  GRADIENT_TO_POSITION_PROP,
] as const;

/** True for declarations consumed by the gradient parser. */
export const isGradientProp = (prop: string): boolean =>
  prop === "background-image" ||
  prop === "--tw-gradient-position" ||
  prop === "--tw-gradient-from" ||
  prop === "--tw-gradient-via" ||
  prop === "--tw-gradient-to" ||
  prop === "--tw-gradient-from-position" ||
  prop === "--tw-gradient-via-position" ||
  prop === "--tw-gradient-to-position" ||
  prop === "--tw-gradient-stops" ||
  prop === "--tw-gradient-via-stops";

/** `linear-gradient(...)` / `radial-gradient(...)` → the RN gradient type. */
const gradientTypeFromImage = (value: string): "linear" | "radial" | undefined => {
  if (/\blinear-gradient\(/i.test(value)) return "linear";
  if (/\bradial-gradient\(/i.test(value)) return "radial";
  // `conic-gradient` is intentionally unsupported: RN's native backgroundImage
  // parser only implements linear + radial.
  return undefined;
};

// Tailwind appends a color-interpolation method (`in oklab`, `in oklch`, …) to
// the gradient position under an `@supports` guard. RN interpolates in its own
// space, so strip it — otherwise the position keyword is unparseable.
const INTERPOLATION_RE =
  /\bin\s+(?:oklab|oklch|srgb(?:-linear)?|lab|lch|hsl|hwb|xyz(?:-d50|-d65)?|longer|shorter|increasing|decreasing|hue)\b/gi;

const stripInterpolation = (value: string): string =>
  value.replace(INTERPOLATION_RE, "").trim();

/**
 * Lower a literal color to a native-parseable hex form. `var(--x)` references
 * are left untouched: the runtime resolves them against the live theme and
 * lowers the result (color-looking values flow through `toRNValue`).
 */
const lowerColorLiteral = (value: string): string => {
  if (value.includes("var(")) return value;
  const parsed = parseColor(value);
  if (!parsed) return value;
  return (parsed.alpha ?? 1) < 1 ? formatHex8(parsed) : formatHex(parsed);
};

/**
 * Fold Tailwind's gradient utilities into our `--nw-gradient-*` marker props.
 * `resolveVar` is currently unused (colors stay as `var()`/literal for the
 * runtime), but kept for signature parity with the other parsers.
 */
export function extractGradient(
  declarations: ReadonlyArray<Decl>,
  _resolveVar: VarResolver,
): RNStyle | undefined {
  const out: RNStyle = {};
  for (const d of declarations) {
    switch (d.prop) {
      case "background-image": {
        const type = gradientTypeFromImage(d.value);
        if (type) out[GRADIENT_TYPE_PROP] = type;
        break;
      }
      case "--tw-gradient-position": {
        const pos = stripInterpolation(d.value);
        if (pos) out[GRADIENT_POSITION_PROP] = pos;
        break;
      }
      case "--tw-gradient-from":
        out[GRADIENT_FROM_PROP] = lowerColorLiteral(d.value);
        break;
      case "--tw-gradient-via":
        out[GRADIENT_VIA_PROP] = lowerColorLiteral(d.value);
        break;
      case "--tw-gradient-to":
        out[GRADIENT_TO_PROP] = lowerColorLiteral(d.value);
        break;
      case "--tw-gradient-from-position":
        out[GRADIENT_FROM_POSITION_PROP] = d.value;
        break;
      case "--tw-gradient-via-position":
        out[GRADIENT_VIA_POSITION_PROP] = d.value;
        break;
      case "--tw-gradient-to-position":
        out[GRADIENT_TO_POSITION_PROP] = d.value;
        break;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

const asString = (value: RNStyle[string] | undefined): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const stop = (color: string, position: string | undefined): string =>
  position ? `${color} ${position}` : color;

/**
 * Assemble the merged `--nw-gradient-*` marker props into RN's native
 * `experimental_backgroundImage` string and delete the markers. Colors have
 * already been lowered to hex (literals at compile time, `var()` at resolve
 * time), so this is pure string composition. Mutates `style` in place.
 *
 * Runs once after every matching class has merged — the same reason
 * `foldTransform` runs late — so multi-class composition (`bg-linear-to-r`
 * + `from-*` + `to-*`) behaves like CSS: later stops win per slot, and the
 * `bg-*` type/position and the stops union into one gradient.
 */
export function foldGradient(style: RNStyle): void {
  const type = asString(style[GRADIENT_TYPE_PROP]);
  const position = asString(style[GRADIENT_POSITION_PROP]);
  const from = asString(style[GRADIENT_FROM_PROP]);
  const via = asString(style[GRADIENT_VIA_PROP]);
  const to = asString(style[GRADIENT_TO_PROP]);
  const fromPosition = asString(style[GRADIENT_FROM_POSITION_PROP]);
  const viaPosition = asString(style[GRADIENT_VIA_POSITION_PROP]);
  const toPosition = asString(style[GRADIENT_TO_POSITION_PROP]);

  for (const prop of GRADIENT_STYLE_PROPS) delete style[prop];

  if (type !== "linear" && type !== "radial") return;

  const stops = [stop(from ?? "transparent", fromPosition ?? "0%")];
  if (via) stops.push(stop(via, viaPosition ?? "50%"));
  stops.push(stop(to ?? "transparent", toPosition ?? "100%"));

  const prelude = position ? `${position}, ` : "";
  style.experimental_backgroundImage = `${type}-gradient(${prelude}${stops.join(", ")})`;
}
