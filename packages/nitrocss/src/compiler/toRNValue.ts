import { formatHex, formatHex8, parse as parseColor } from "culori";
import { lengthToPx, type VarResolver } from "./insetValue";

/**
 * CSS property -> RN style key. Most are a straight kebab→camel conversion;
 * the exceptions are listed explicitly.
 */
const PROPERTY_OVERRIDES: Record<string, string> = {
  "margin-inline-start": "marginStart",
  "margin-inline-end": "marginEnd",
  "padding-inline-start": "paddingStart",
  "padding-inline-end": "paddingEnd",
  "inset-inline-start": "start",
  "inset-inline-end": "end",
  "border-inline-start-width": "borderStartWidth",
  "border-inline-end-width": "borderEndWidth",
};

const PROPERTY_EXPANSIONS: Record<string, string[]> = {
  "border-inline-width": ["borderLeftWidth", "borderRightWidth"],
  "border-block-width": ["borderTopWidth", "borderBottomWidth"],
  "border-inline-color": ["borderLeftColor", "borderRightColor"],
  "border-block-color": ["borderTopColor", "borderBottomColor"],
  "padding-inline": ["paddingLeft", "paddingRight"],
  "padding-block": ["paddingTop", "paddingBottom"],
  "margin-inline": ["marginLeft", "marginRight"],
  "margin-block": ["marginTop", "marginBottom"],
  "inset-inline": ["left", "right"],
  "inset-block": ["top", "bottom"],
};

const kebabToCamel = (s: string): string =>
  s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

export const toRNProperty = (cssProperty: string): string =>
  PROPERTY_OVERRIDES[cssProperty] ?? kebabToCamel(cssProperty);

export const toRNProperties = (cssProperty: string): string[] =>
  PROPERTY_EXPANSIONS[cssProperty] ?? [toRNProperty(cssProperty)];

/** RN style props whose value must stay a string even when numeric-looking. */
const STRING_VALUED = new Set([
  "fontWeight",
  "flexBasis",
  "aspectRatio",
  "borderStyle",
]);

/** RN style props that accept unitless numbers. */
const UNITLESS = new Set([
  "opacity",
  "zIndex",
  "flex",
  "flexGrow",
  "flexShrink",
  "lineHeight",
  "shadowOpacity",
]);

// Exponent support matters: Tailwind v4's `rounded-full` emits the CSS float
// max in scientific notation (`3.40282e38px` — its "infinite radius"). RN and
// the native gradient applier both clamp radii to half the box, so the huge
// number is safe to pass through as a plain number.
const LENGTH_RE = /^(-?\d*\.?\d+(?:e[+-]?\d+)?)(px|rem|em|pt)?$/i;
const PERCENT_RE = /^-?\d*\.?\d+%$/;

function matchingParen(value: string, openIndex: number): number {
  let depth = 0;
  for (let index = openIndex; index < value.length; index++) {
    const char = value[index];
    if (char === "(") depth++;
    else if (char === ")") {
      depth--;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function splitVarBody(body: string): [string, string | undefined] {
  let depth = 0;
  for (let index = 0; index < body.length; index++) {
    const char = body[index];
    if (char === "(") depth++;
    else if (char === ")") depth--;
    else if (char === "," && depth === 0) {
      return [body.slice(0, index).trim(), body.slice(index + 1).trim()];
    }
  }
  return [body.trim(), undefined];
}

export function resolveVarsInValue(
  raw: string,
  resolveVar: VarResolver,
  depth = 0,
): string {
  if (depth > 8) return raw;
  let output = "";
  let offset = 0;
  while (offset < raw.length) {
    const start = raw.indexOf("var(", offset);
    if (start < 0) {
      output += raw.slice(offset);
      break;
    }
    const bodyStart = start + "var".length;
    const end = matchingParen(raw, bodyStart);
    if (end < 0) {
      output += raw.slice(offset);
      break;
    }
    output += raw.slice(offset, start);
    const [name, fallback] = splitVarBody(raw.slice(bodyStart + 1, end));
    const resolved = resolveVar(name) ?? fallback ?? "0";
    output += resolveVarsInValue(resolved, resolveVar, depth + 1);
    offset = end + 1;
  }
  return output;
}

export interface ValueContext {
  /** Root rem value in px. */
  rem: number;
  /** Resolve CSS custom properties used inside length expressions. */
  resolveVar?: VarResolver;
}

/**
 * Coerce a single CSS value string into the RN representation for `rnProperty`.
 * Returns `undefined` if the value can't be represented in RN.
 */
export const toRNValue = (
  rnProperty: string,
  rawValue: string,
  ctx: ValueContext,
): string | number | undefined => {
  const raw = rawValue.trim();
  const value =
    ctx.resolveVar && !looksLikeColor(rnProperty, raw)
      ? resolveVarsInValue(raw, ctx.resolveVar).trim()
      : raw;

  // Colors: normalize anything culori understands to a hex form both JS and
  // Fabric-native RawProps parsing accept. This matters because the native
  // engine may merge the JS first-paint style back into later C++ commits.
  if (looksLikeColor(rnProperty, value)) {
    const parsed = parseColor(value);
    if (parsed) {
      return parsed.alpha !== undefined && parsed.alpha < 1
        ? formatHex8(parsed)
        : formatHex(parsed);
    }
  }

  if (PERCENT_RE.test(value)) {
    return value;
  }

  if (!STRING_VALUED.has(rnProperty)) {
    const px = lengthToPx(value, ctx.resolveVar ?? (() => undefined), ctx.rem);
    if (px !== undefined) return px;
  }

  const length = LENGTH_RE.exec(value);
  if (length) {
    const num = Number(length[1]);
    const unit = length[2];
    if (STRING_VALUED.has(rnProperty)) {
      return value;
    }
    if (unit === "rem" || unit === "em") {
      return num * ctx.rem;
    }
    // px, pt and unitless lengths collapse to the number.
    return num;
  }

  if (UNITLESS.has(rnProperty) && !Number.isNaN(Number(value))) {
    return Number(value);
  }

  // Everything else (keywords like `row`, `center`, font families) stays a string.
  return value;
};

const COLOR_PROPERTIES = new Set([
  "color",
  "backgroundColor",
  "borderColor",
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor",
  "borderStartColor",
  "borderEndColor",
  "shadowColor",
  "textShadowColor",
  "tintColor",
  "textDecorationColor",
  "placeholderTextColor",
  "cursorColor",
  "selectionColor",
  "selectionHandleColor",
  "underlineColorAndroid",
  "fill",
  "stroke",
  "overlayColor",
  "accentColor",
]);

const looksLikeColor = (rnProperty: string, value: string): boolean => {
  if (COLOR_PROPERTIES.has(rnProperty)) return true;
  return (
    /^#([0-9a-f]{3,8})$/i.test(value) ||
    /^(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color)\(/i.test(value)
  );
};

/** Function-form CSS colors that must be lowered to hex for native parsing. */
const COLOR_FUNCTION_RE = /^(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color)\(/i;

/**
 * Lower a CSS color to a hex string the *native* color parser understands.
 *
 * React Native's native (Fabric C++) color parser handles hex and named colors
 * but not the modern CSS color functions the utility compiler emits (`oklch`, `oklab`,
 * `lab`, `lch`, `color()`) — nor `rgb()/hsl()` function syntax in every path.
 * Theme variable values are substituted verbatim on the native side (they never
 * go through {@link toRNValue}), so any such value is dropped at commit time
 * unless it is pre-converted. Non-color values (lengths, keywords, font stacks)
 * and already-native forms (hex, named colors) are returned untouched.
 */
export const normalizeColorValue = (value: string): string => {
  const v = value.trim();
  if (!COLOR_FUNCTION_RE.test(v)) return value;
  const parsed = parseColor(v);
  if (!parsed) return value;
  return parsed.alpha !== undefined && parsed.alpha < 1
    ? formatHex8(parsed)
    : formatHex(parsed);
};
