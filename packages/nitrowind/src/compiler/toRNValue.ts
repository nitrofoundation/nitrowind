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
const STRING_VALUED = new Set(["fontWeight", "flexBasis", "aspectRatio"]);

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

const LENGTH_RE = /^(-?\d*\.?\d+)(px|rem|em|pt)?$/;
const PERCENT_RE = /^-?\d*\.?\d+%$/;

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
  const value = rawValue.trim();

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
 * but not the modern CSS color functions Tailwind v4 emits (`oklch`, `oklab`,
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
