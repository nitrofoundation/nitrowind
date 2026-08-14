import type { VarResolver } from "../insetValue";
import {
  formatHex,
  formatHex8,
  interpolate,
  parse as parseColor,
} from "culori";
import type { RNStyle } from "../types";
import { BACKGROUND_IMAGE_RAW_PROP } from "./backgroundImage";

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
/** JSON-encoded arbitrary color stops (`[{c,p?},…]`) for literal gradients. */
export const GRADIENT_STOPS_PROP = "--nw-gradient-stops-json";
/** Requested CSS interpolation space, retained instead of silently discarded. */
export const GRADIENT_INTERPOLATION_PROP = "--nw-gradient-interpolation";

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
  GRADIENT_STOPS_PROP,
  GRADIENT_INTERPOLATION_PROP,
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

/** CSS gradient function → the native gradient type. */
const gradientTypeFromImage = (
  value: string,
): "linear" | "radial" | "conic" | undefined => {
  if (/\blinear-gradient\(/i.test(value)) return "linear";
  if (/\bradial-gradient\(/i.test(value)) return "radial";
  if (/\bconic-gradient\(/i.test(value)) return "conic";
  return undefined;
};

// The compiler appends a color-interpolation method (`in oklab`, `in oklch`, …) to
// the gradient position under an `@supports` guard. RN interpolates in its own
// space, so strip it — otherwise the position keyword is unparseable.
const INTERPOLATION_RE =
  /\bin\s+(?:oklab|oklch|srgb(?:-linear)?|lab|lch|hsl|hwb|xyz(?:-d50|-d65)?|longer|shorter|increasing|decreasing|hue)\b/gi;

const stripInterpolation = (value: string): string =>
  value.replace(INTERPOLATION_RE, "").trim();

const interpolationFrom = (value: string): string | undefined =>
  /\bin\s+(oklab|oklch|srgb(?:-linear)?|lab|lch|hsl|hwb|xyz(?:-d50|-d65)?)/i.exec(
    value,
  )?.[1]?.toLowerCase();

/** Split on a delimiter only when outside nested CSS functions. */
function splitTopLevel(value: string, delimiter: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = "";
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]!;
    if (quote) {
      if (ch === quote && value[i - 1] !== "\\") quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === delimiter && depth === 0) {
      parts.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts.filter(Boolean);
}

/** Extract Tailwind's `var(--tw-gradient-stops, <fallback>)` payload. */
function gradientStopsFallback(value: string): string | undefined {
  const needle = "var(--tw-gradient-stops";
  const start = value.indexOf(needle);
  if (start === -1) return undefined;
  const open = value.indexOf("(", start);
  if (open === -1) return undefined;
  let depth = 0;
  let comma = -1;
  for (let index = open; index < value.length; index++) {
    const char = value[index]!;
    if (char === "(") depth++;
    else if (char === ")") {
      depth--;
      if (depth === 0) {
        return comma === -1
          ? undefined
          : value.slice(comma + 1, index).trim() || undefined;
      }
    } else if (char === "," && depth === 1 && comma === -1) {
      comma = index;
    }
  }
  return undefined;
}

interface LiteralStop {
  c: string;
  p?: string;
}

function parseLiteralStops(raw: string): LiteralStop[] | undefined {
  // Tailwind's documented stop positions are percentages. Keep unitless
  // fractions too for parity with the existing descriptor parser. Lightning
  // CSS compacts adjacent equal-color stops into CSS's double-position form
  // (`black 25% 75%`), which represents two stops and must be expanded again
  // for the native gradient descriptor.
  const match = /^(.+?)\s+(-?\d*\.?\d+%?)(?:\s+(-?\d*\.?\d+%?))?$/.exec(
    raw.trim(),
  );
  const color = lowerColorLiteral((match?.[1] ?? raw).trim());
  if (!color || (!color.includes("var(") && !parseColor(color))) return undefined;
  if (!match) return [{ c: color }];
  return match[3]
    ? [{ c: color, p: match[2] }, { c: color, p: match[3] }]
    : [{ c: color, p: match[2] }];
}

function parseLiteralGradient(value: string):
  | {
      type: "linear" | "radial" | "conic";
      position?: string;
      interpolation?: string;
      stops: LiteralStop[];
    }
  | undefined {
  const match = /^\s*(linear|radial|conic)-gradient\(([\s\S]*)\)\s*$/i.exec(
    value,
  );
  if (!match) return undefined;
  const type = match[1]!.toLowerCase() as "linear" | "radial" | "conic";
  const args = splitTopLevel(match[2]!, ",");
  if (args.length < 2) return undefined;

  const first = args[0]!;
  const withoutInterpolation = stripInterpolation(first);
  const firstIsGeometry =
    type === "linear"
      ? /^to\s+/i.test(withoutInterpolation) ||
        parseCssAngle(withoutInterpolation) !== undefined ||
        /^in\s+/i.test(first)
      : type === "conic"
        ? /^(?:from|at|in)\b/i.test(first)
        : !parseColor(withoutInterpolation);
  const stopArgs = firstIsGeometry ? args.slice(1) : args;
  const parsedStops = stopArgs.map(parseLiteralStops);
  if (parsedStops.some((stop) => stop === undefined)) {
    return undefined;
  }
  const stops = parsedStops.flat() as LiteralStop[];
  if (stops.length < 2) return undefined;
  return {
    type,
    position: firstIsGeometry ? withoutInterpolation : undefined,
    interpolation: interpolationFrom(first),
    stops: stops as LiteralStop[],
  };
}

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
        if (d.value.trim().toLowerCase() === "none") {
          out[GRADIENT_TYPE_PROP] = "none";
          break;
        }
        const type = gradientTypeFromImage(d.value);
        if (type) {
          out[GRADIENT_TYPE_PROP] = type;
          const fallback = gradientStopsFallback(d.value);
          const literal = fallback
            ? parseLiteralGradient(`${type}-gradient(${fallback})`)
            : d.value.includes("--tw-gradient-stops")
              ? undefined
              : parseLiteralGradient(d.value);
          if (literal) {
            if (literal.position) {
              out[GRADIENT_POSITION_PROP] = literal.position;
            }
            if (literal.interpolation) {
              out[GRADIENT_INTERPOLATION_PROP] = literal.interpolation;
            }
            out[GRADIENT_STOPS_PROP] = JSON.stringify(literal.stops);
          } else if (fallback) {
            // A custom-property fallback resolves at runtime. Once it becomes
            // a comma-separated stop list, foldGradient parses it through the
            // same literal-gradient path as an arbitrary value.
            out[GRADIENT_POSITION_PROP] = fallback;
          }
        } else if (d.value.includes("var(")) {
          out[BACKGROUND_IMAGE_RAW_PROP] = d.value;
          out[GRADIENT_TYPE_PROP] = "none";
        } else {
          // A raster/none background declared later must clear stale gradient
          // markers from an earlier utility in the same class set.
          out[GRADIENT_TYPE_PROP] = "none";
        }
        break;
      }
      case "--tw-gradient-position": {
        const interpolation = interpolationFrom(d.value);
        if (interpolation) out[GRADIENT_INTERPOLATION_PROP] = interpolation;
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

const formatNativeColor = (value: ReturnType<typeof parseColor>): string =>
  value && (value.alpha ?? 1) < 1 ? formatHex8(value) : formatHex(value!);

/**
 * Native gradient APIs interpolate in platform RGB spaces. Tailwind requests
 * OKLab by default, so approximate that curve with eight native sub-stops per
 * CSS stop interval. The same math/sample count is mirrored in C++.
 */
function sampleInterpolation(
  colors: string[],
  locations: number[],
  interpolation: string | undefined,
): { colors: string[]; locations: number[] } {
  if (interpolation !== "oklab" || colors.length < 2) {
    return { colors, locations };
  }
  const sampledColors: string[] = [];
  const sampledLocations: number[] = [];
  const subdivisions = 8;
  for (let index = 0; index + 1 < colors.length; index++) {
    const from = parseColor(colors[index]!);
    const to = parseColor(colors[index + 1]!);
    if (!from || !to) return { colors, locations };
    const mix = interpolate([from, to], "oklab");
    for (let step = 0; step < subdivisions; step++) {
      const t = step / subdivisions;
      sampledColors.push(formatNativeColor(mix(t)));
      sampledLocations.push(
        locations[index]! +
          (locations[index + 1]! - locations[index]!) * t,
      );
    }
  }
  sampledColors.push(formatNativeColor(parseColor(colors.at(-1)!)!));
  sampledLocations.push(locations.at(-1)!);
  return { colors: sampledColors, locations: sampledLocations };
}

/**
 * The single resolved-style key carrying the folded gradient on native. The
 * value is a compact NUMERIC descriptor (no CSS-string parsing at paint time):
 * the engine's own Nitro `GradientView` consumes it verbatim, and the C++
 * mirror fold in `nitro-css/cpp/NitroCssEngine.cpp` emits the identical object
 * so native theme-swap commits match JS-resolved styles exactly.
 */
export const GRADIENT_DESCRIPTOR_PROP = "--nitrocss-gradient";

export interface GradientDescriptor {
  gradientType: "linear" | "radial" | "conic";
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
  /** CSS color interpolation space requested by Tailwind. */
  interpolation?: string;
  radialShape?: "circle" | "ellipse";
  radialExtent?:
    | "closest-side"
    | "farthest-side"
    | "closest-corner"
    | "farthest-corner";
}

/** Where the fold's output goes: native descriptor vs. web CSS string. */
export type GradientFoldTarget = "descriptor" | "css";

const clamp01 = (value: number): number =>
  value < 0 ? 0 : value > 1 ? 1 : value;

/**
 * Parse a CSS angle, including the simple `calc(<angle> * <number>)` form
 * emitted by Tailwind's negative gradient utilities. Returns `undefined` for
 * expressions that cannot be reduced without layout/runtime information.
 */
export function parseCssAngle(raw: string): number | undefined {
  const normalized = stripInterpolation(raw)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  if (!normalized) return undefined;

  const calc = /^calc\((.+)\)$/.exec(normalized);
  if (calc) {
    const expression = calc[1]!;
    const multiplication = /^(.+)\*(-?\d*\.?\d+)$/.exec(expression);
    if (multiplication) {
      const angle = parseCssAngle(multiplication[1]!);
      return angle === undefined
        ? undefined
        : angle * Number.parseFloat(multiplication[2]!);
    }
    const division = /^(.+)\/(-?\d*\.?\d+)$/.exec(expression);
    if (division) {
      const divisor = Number.parseFloat(division[2]!);
      const angle = parseCssAngle(division[1]!);
      return angle === undefined || divisor === 0 ? undefined : angle / divisor;
    }
    return parseCssAngle(expression);
  }

  const match = /^(-?\d*\.?\d+)(deg|grad|rad|turn)?$/.exec(normalized);
  if (!match) return undefined;
  const value = Number.parseFloat(match[1]!);
  switch (match[2] ?? "deg") {
    case "turn":
      return value * 360;
    case "grad":
      return value * 0.9;
    case "rad":
      return (value * 180) / Math.PI;
    default:
      return value;
  }
}

const normalizedAngle = (raw: string, fallback: number): number => {
  const parsed = parseCssAngle(raw);
  if (parsed === undefined || !Number.isFinite(parsed)) return fallback;
  const angle = parsed % 360;
  return angle < 0 ? angle + 360 : angle;
};

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
  return normalizedAngle(normalized, 180);
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

export function radialGeometryFromPosition(position: string | undefined): {
  x: number;
  y: number;
  shape: "circle" | "ellipse";
  extent:
    | "closest-side"
    | "farthest-side"
    | "closest-corner"
    | "farthest-corner";
} {
  const center = radialCenterFromPosition(position);
  const normalized = stripInterpolation(position ?? "").toLowerCase();
  const shape = /(?:^|\s)circle(?:\s|$)/.test(normalized)
    ? "circle"
    : "ellipse";
  const extent =
    /(?:^|\s)(closest-side|farthest-side|closest-corner|farthest-corner)(?:\s|$)/.exec(
      normalized,
    )?.[1] ?? "farthest-corner";
  return {
    ...center,
    shape,
    extent: extent as
      | "closest-side"
      | "farthest-side"
      | "closest-corner"
      | "farthest-corner",
  };
}

/** Parse `from <angle> at <position>` from a conic-gradient prelude. */
export function conicGeometryFromPosition(position: string | undefined): {
  angle: number;
  x: number;
  y: number;
} {
  const center = radialCenterFromPosition(position);
  if (!position) return { angle: 0, ...center };
  const match = /(?:^|\s)from\s+(.+?)(?=\s+at(?:\s|$)|$)/i.exec(
    stripInterpolation(position).trim(),
  );
  const angle = match ? normalizedAngle(match[1]!, 0) : 0;
  return { angle, ...center };
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
  let type = asString(style[GRADIENT_TYPE_PROP]);
  let position = asString(style[GRADIENT_POSITION_PROP]);
  const from = asString(style[GRADIENT_FROM_PROP]);
  const via = asString(style[GRADIENT_VIA_PROP]);
  const to = asString(style[GRADIENT_TO_PROP]);
  const fromPosition = asString(style[GRADIENT_FROM_POSITION_PROP]);
  const viaPosition = asString(style[GRADIENT_VIA_POSITION_PROP]);
  const toPosition = asString(style[GRADIENT_TO_POSITION_PROP]);
  let interpolation = asString(style[GRADIENT_INTERPOLATION_PROP]);
  let literalStops = asString(style[GRADIENT_STOPS_PROP]);
  const rawBackground = asString(style[BACKGROUND_IMAGE_RAW_PROP]);

  if (rawBackground) {
    const rawLiteral = parseLiteralGradient(rawBackground);
    if (rawLiteral) {
      type = rawLiteral.type;
      position = rawLiteral.position;
      interpolation = rawLiteral.interpolation;
      literalStops = JSON.stringify(rawLiteral.stops);
    }
  }
  if (
    !literalStops &&
    (type === "linear" || type === "radial" || type === "conic") &&
    position?.includes(",")
  ) {
    const positionLiteral = parseLiteralGradient(
      `${type}-gradient(${position})`,
    );
    if (positionLiteral) {
      position = positionLiteral.position;
      interpolation = positionLiteral.interpolation ?? interpolation;
      literalStops = JSON.stringify(positionLiteral.stops);
    }
  }

  for (const prop of GRADIENT_STYLE_PROPS) delete style[prop];

  if (type !== "linear" && type !== "radial" && type !== "conic") {
    delete style[GRADIENT_DESCRIPTOR_PROP];
    return;
  }

  let parsedLiteralStops: LiteralStop[] | undefined;
  if (literalStops) {
    try {
      const parsed = JSON.parse(literalStops) as LiteralStop[];
      if (Array.isArray(parsed) && parsed.length >= 2) parsedLiteralStops = parsed;
    } catch {
      // Invalid arbitrary gradients fail closed instead of reaching native.
    }
  }

  if (target === "css") {
    const stops = parsedLiteralStops
      ? parsedLiteralStops.map((entry) => stop(entry.c, entry.p))
      : [stop(from ?? "transparent", fromPosition ?? "0%")];
    if (!parsedLiteralStops) {
      if (via) stops.push(stop(via, viaPosition ?? "50%"));
      stops.push(stop(to ?? "transparent", toPosition ?? "100%"));
    }
    const prelude = [position, interpolation ? `in ${interpolation}` : undefined]
      .filter(Boolean)
      .join(" ");
    style.backgroundImage = `${type}-gradient(${prelude ? `${prelude}, ` : ""}${stops.join(", ")})`;
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
  if (parsedLiteralStops) {
    const count = parsedLiteralStops.length;
    parsedLiteralStops.forEach((entry, index) => {
      const fallback = count === 1 ? 0 : index / (count - 1);
      push(lowerColorLiteral(entry.c), parseStopLocation(entry.p, fallback));
    });
  } else {
    push(from ?? "transparent", parseStopLocation(fromPosition, 0));
    if (via) push(via, parseStopLocation(viaPosition, 0.5));
    push(to ?? "transparent", parseStopLocation(toPosition, 1));
  }

  const isRadial = type === "radial";
  const isConic = type === "conic";
  const conic = isConic ? conicGeometryFromPosition(position) : undefined;
  const radial = isRadial ? radialGeometryFromPosition(position) : undefined;
  const center = isRadial
    ? radial!
    : conic ?? { x: 0.5, y: 0.5 };

  const sampled = sampleInterpolation(colors, locations, interpolation);
  const descriptor: GradientDescriptor = {
    gradientType: type,
    angle: isRadial ? 0 : isConic ? conic!.angle : angleFromPosition(position),
    positionX: center.x,
    positionY: center.y,
    colors: sampled.colors,
    locations: sampled.locations,
    ...(interpolation ? { interpolation } : {}),
    ...(radial
      ? { radialShape: radial.shape, radialExtent: radial.extent }
      : {}),
  };
  style[GRADIENT_DESCRIPTOR_PROP] =
    descriptor as unknown as RNStyle[string];
}
