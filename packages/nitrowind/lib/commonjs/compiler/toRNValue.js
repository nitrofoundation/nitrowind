"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.toRNValue = exports.toRNProperty = exports.toRNProperties = exports.normalizeColorValue = void 0;
var _culori = require("culori");
var _insetValue = require("./insetValue.js");
/**
 * CSS property -> RN style key. Most are a straight kebab→camel conversion;
 * the exceptions are listed explicitly.
 */
const PROPERTY_OVERRIDES = {
  "margin-inline-start": "marginStart",
  "margin-inline-end": "marginEnd",
  "padding-inline-start": "paddingStart",
  "padding-inline-end": "paddingEnd",
  "inset-inline-start": "start",
  "inset-inline-end": "end",
  "border-inline-start-width": "borderStartWidth",
  "border-inline-end-width": "borderEndWidth"
};
const PROPERTY_EXPANSIONS = {
  "border-inline-width": ["borderLeftWidth", "borderRightWidth"],
  "border-block-width": ["borderTopWidth", "borderBottomWidth"],
  "border-inline-color": ["borderLeftColor", "borderRightColor"],
  "border-block-color": ["borderTopColor", "borderBottomColor"],
  "padding-inline": ["paddingLeft", "paddingRight"],
  "padding-block": ["paddingTop", "paddingBottom"],
  "margin-inline": ["marginLeft", "marginRight"],
  "margin-block": ["marginTop", "marginBottom"],
  "inset-inline": ["left", "right"],
  "inset-block": ["top", "bottom"]
};
const kebabToCamel = s => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const toRNProperty = cssProperty => PROPERTY_OVERRIDES[cssProperty] ?? kebabToCamel(cssProperty);
exports.toRNProperty = toRNProperty;
const toRNProperties = cssProperty => PROPERTY_EXPANSIONS[cssProperty] ?? [toRNProperty(cssProperty)];

/** RN style props whose value must stay a string even when numeric-looking. */
exports.toRNProperties = toRNProperties;
const STRING_VALUED = new Set(["fontWeight", "flexBasis", "aspectRatio", "borderStyle"]);

/** RN style props that accept unitless numbers. */
const UNITLESS = new Set(["opacity", "zIndex", "flex", "flexGrow", "flexShrink", "lineHeight", "shadowOpacity"]);
const LENGTH_RE = /^(-?\d*\.?\d+)(px|rem|em|pt)?$/;
const PERCENT_RE = /^-?\d*\.?\d+%$/;
function matchingParen(value, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < value.length; index++) {
    const char = value[index];
    if (char === "(") depth++;else if (char === ")") {
      depth--;
      if (depth === 0) return index;
    }
  }
  return -1;
}
function splitVarBody(body) {
  let depth = 0;
  for (let index = 0; index < body.length; index++) {
    const char = body[index];
    if (char === "(") depth++;else if (char === ")") depth--;else if (char === "," && depth === 0) {
      return [body.slice(0, index).trim(), body.slice(index + 1).trim()];
    }
  }
  return [body.trim(), undefined];
}
function resolveVarsInValue(raw, resolveVar, depth = 0) {
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
/**
 * Coerce a single CSS value string into the RN representation for `rnProperty`.
 * Returns `undefined` if the value can't be represented in RN.
 */
const toRNValue = (rnProperty, rawValue, ctx) => {
  const raw = rawValue.trim();
  const value = ctx.resolveVar && !looksLikeColor(rnProperty, raw) ? resolveVarsInValue(raw, ctx.resolveVar).trim() : raw;

  // Colors: normalize anything culori understands to a hex form both JS and
  // Fabric-native RawProps parsing accept. This matters because the native
  // engine may merge the JS first-paint style back into later C++ commits.
  if (looksLikeColor(rnProperty, value)) {
    const parsed = (0, _culori.parse)(value);
    if (parsed) {
      return parsed.alpha !== undefined && parsed.alpha < 1 ? (0, _culori.formatHex8)(parsed) : (0, _culori.formatHex)(parsed);
    }
  }
  if (PERCENT_RE.test(value)) {
    return value;
  }
  if (!STRING_VALUED.has(rnProperty)) {
    const px = (0, _insetValue.lengthToPx)(value, ctx.resolveVar ?? (() => undefined), ctx.rem);
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
exports.toRNValue = toRNValue;
const COLOR_PROPERTIES = new Set(["color", "backgroundColor", "borderColor", "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor", "borderStartColor", "borderEndColor", "shadowColor", "textShadowColor", "tintColor", "textDecorationColor", "placeholderTextColor", "cursorColor", "selectionColor", "selectionHandleColor", "underlineColorAndroid", "fill", "stroke", "overlayColor", "accentColor"]);
const looksLikeColor = (rnProperty, value) => {
  if (COLOR_PROPERTIES.has(rnProperty)) return true;
  return /^#([0-9a-f]{3,8})$/i.test(value) || /^(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color)\(/i.test(value);
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
const normalizeColorValue = value => {
  const v = value.trim();
  if (!COLOR_FUNCTION_RE.test(v)) return value;
  const parsed = (0, _culori.parse)(v);
  if (!parsed) return value;
  return parsed.alpha !== undefined && parsed.alpha < 1 ? (0, _culori.formatHex8)(parsed) : (0, _culori.formatHex)(parsed);
};
exports.normalizeColorValue = normalizeColorValue;
//# sourceMappingURL=toRNValue.js.map