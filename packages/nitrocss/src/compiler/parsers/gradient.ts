import type { VarResolver } from "../insetValue";
import { formatHex, formatHex8, parse as parseColor } from "culori";
import type { RNStyle } from "../types";

interface Decl {
  prop: string;
  value: string;
}

/**
 * The compiler splits a gradient across several utilities: `bg-linear-*` /
 * `bg-radial` set the gradient *type* + geometry, while `from-*` / `via-*` /
 * `to-*` each contribute a color stop through the `--tw-gradient-*` custom-prop
 * chain. Those tokens compile to *separate* class buckets in nitrocss, so the
 * pieces can only be reassembled once every matching class has merged — exactly
 * like the per-axis transform props. We therefore emit the atomic pieces as our
 * own `--nw-gradient-*` custom props and fold them at resolve time into the
 * compact numeric {@link GradientDescriptor} consumed by the engine's own
 * native `GradientView` (see the runtime `foldGradient` in
 * `nitro-css/src/core/normalize.ts`, which delegates to {@link foldGradient};
 * web folds to a real CSS `backgroundImage` string instead).
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

// The compiler appends a color-interpolation method (`in oklab`, `in oklch`, …) to
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
 * Fold the utility compiler's gradient utilities into our `--nw-gradient-*` marker props.
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
 * The single resolved-style key carrying the folded gradient on native. The
 * value is a compact NUMERIC descriptor (no CSS-string parsing at paint time):
 * the engine's own Nitro `GradientView` consumes it verbatim, and the C++
 * mirror fold in `nitro-css/cpp/NitroCssEngine.cpp` emits the identical object
 * so native theme-swap commits match JS-resolved styles exactly.
 */
export const GRADIENT_DESCRIPTOR_PROP = "--nitrocss-gradient";

export interface GradientDescriptor {
  gradientType: "linear" | "radial";
  /**
   * Linear sweep angle in CSS degrees (`0` = to top, `90` = to right,
   * `180` = to bottom — the default when the utility compiler gave no direction).
   * `0` for radial gradients (unused).
   */
  angle: number;
  /** Radial center as fractions of the box (`0..1`); `0.5, 0.5` when centered. */
  positionX: number;
  positionY: number;
  /** Stop colors in order, already lowered to hex (or `transparent`). */
  colors: string[];
  /** Stop offsets `0..1`, monotonic, same length as `colors`. */
  locations: number[];
}

/** Where the fold's output goes: native descriptor vs. web CSS string. */
export type GradientFoldTarget = "descriptor" | "css";

const clamp01 = (value: number): number =>
  value < 0 ? 0 : value > 1 ? 1 : value;

/**
 * `"40%"` → `0.4`; bare numbers pass through (`"0.4"` → `0.4`). Falls back for
 * anything unparseable. Mirrored byte-for-byte by the C++ fold.
 */
export function parseStopLocation(
  raw: string | undefined,
  fallback: number,
): number {
  if (!raw) return fallback;
  const trimmed = raw.trim();
  const isPercent = trimmed.endsWith("%");
  const num = Number.parseFloat(trimmed);
  if (Number.isNaN(num)) return fallback;
  return clamp01(isPercent ? num / 100 : num);
}

/**
 * Resolve the utility compiler's `--tw-gradient-position` for a LINEAR gradient into a CSS
 * angle in degrees. Keyword corners use the fixed 45°-diagonal table (the Lynx
 * convention — aspect-ratio-exact corner targeting is a fidelity follow-up).
 * Mirrored byte-for-byte by the C++ fold.
 */
export function angleFromPosition(position: string | undefined): number {
  if (!position) return 180;
  const normalized = position.trim().replace(/\s+/g, " ").toLowerCase();
  switch (normalized) {
    case "to top":
      return 0;
    case "to top right":
    case "to right top":
      return 45;
    case "to right":
      return 90;
    case "to bottom right":
    case "to right bottom":
      return 135;
    case "to bottom":
      return 180;
    case "to bottom left":
    case "to left bottom":
      return 225;
    case "to left":
      return 270;
    case "to top left":
    case "to left top":
      return 315;
  }
  const match = /^(-?\d*\.?\d+)(deg)?$/.exec(normalized);
  if (match) {
    let angle = Number.parseFloat(match[1]!) % 360;
    if (angle < 0) angle += 360;
    return angle;
  }
  return 180;
}

/**
 * Resolve a RADIAL gradient's `at <position>` clause into fractional center
 * coordinates. Shape/size keywords before `at` are ignored (v1 renders the
 * `ellipse farthest-corner` approximation). Mirrored byte-for-byte in C++.
 */
export function radialCenterFromPosition(position: string | undefined): {
  x: number;
  y: number;
} {
  let x = 0.5;
  let y = 0.5;
  if (!position) return { x, y };
  const normalized = position.trim().replace(/\s+/g, " ").toLowerCase();
  const at = normalized.indexOf("at ");
  if (at < 0) return { x, y };
  const tokens = normalized.slice(at + 3).split(" ");
  for (let i = 0; i < tokens.length && i < 2; i++) {
    const token = tokens[i]!;
    if (token === "left") x = 0;
    else if (token === "right") x = 1;
    else if (token === "top") y = 0;
    else if (token === "bottom") y = 1;
    else if (token === "center") {
      /* already 0.5 */
    } else if (token.endsWith("%")) {
      const num = Number.parseFloat(token);
      if (!Number.isNaN(num)) {
        if (i === 0) x = clamp01(num / 100);
        else y = clamp01(num / 100);
      }
    }
  }
  return { x, y };
}

/**
 * Assemble the merged `--nw-gradient-*` marker props and delete the markers.
 * Mutates `style` in place.
 *
 * - `target === "descriptor"` (native): emits the compact numeric
 *   {@link GradientDescriptor} under {@link GRADIENT_DESCRIPTOR_PROP}. The
 *   `View` host strips it from the RN style and feeds it to the engine's own
 *   Nitro `GradientView`; the C++ engine re-emits it on theme/scheme change.
 * - `target === "css"` (web): emits a real CSS `backgroundImage` string so
 *   plain-CSS web consumers keep a browser-paintable gradient.
 *
 * Colors have already been lowered to hex (literals at compile time, `var()`
 * at resolve time). Runs once after every matching class has merged — the same
 * reason `foldTransform` runs late — so multi-class composition
 * (`bg-linear-to-r` + `from-*` + `to-*`) behaves like CSS: later stops win per
 * slot, and the `bg-*` type/position and the stops union into one gradient.
 */
export function foldGradient(
  style: RNStyle,
  target: GradientFoldTarget = "descriptor",
): void {
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

  if (target === "css") {
    const stops = [stop(from ?? "transparent", fromPosition ?? "0%")];
    if (via) stops.push(stop(via, viaPosition ?? "50%"));
    stops.push(stop(to ?? "transparent", toPosition ?? "100%"));
    const prelude = position ? `${position}, ` : "";
    style.backgroundImage = `${type}-gradient(${prelude}${stops.join(", ")})`;
    return;
  }

  const colors: string[] = [];
  const locations: number[] = [];
  const push = (color: string, location: number): void => {
    // CSS color-stop fixup: positions are monotonic non-decreasing.
    const previous = locations.length > 0 ? locations[locations.length - 1]! : 0;
    colors.push(color);
    locations.push(location < previous ? previous : location);
  };
  push(from ?? "transparent", parseStopLocation(fromPosition, 0));
  if (via) push(via, parseStopLocation(viaPosition, 0.5));
  push(to ?? "transparent", parseStopLocation(toPosition, 1));

  const isRadial = type === "radial";
  const center = isRadial
    ? radialCenterFromPosition(position)
    : { x: 0.5, y: 0.5 };

  const descriptor: GradientDescriptor = {
    gradientType: type,
    angle: isRadial ? 0 : angleFromPosition(position),
    positionX: center.x,
    positionY: center.y,
    colors,
    locations,
  };
  style[GRADIENT_DESCRIPTOR_PROP] =
    descriptor as unknown as RNStyle[string];
}
