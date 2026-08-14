#include "NitroCssEngine.hpp"
#include "css/CssColor.hpp"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdlib>
#include <folly/json.h>
#include <regex>
#include <sstream>

#if defined(__APPLE__)
#include <TargetConditionals.h>
#endif

namespace nitrocss {

namespace {

std::vector<std::string> splitTokens(const std::string& className) {
  std::vector<std::string> tokens;
  std::istringstream stream(className);
  std::string token;
  while (stream >> token) {
    if (!token.empty()) tokens.push_back(token);
  }
  return tokens;
}

const std::regex kVarPattern(R"(var\(\s*(--[A-Za-z0-9-_]+)\s*(?:,\s*([^)]*))?\))");

std::string resolveVarsInString(const std::string& value, const folly::dynamic& vars) {
  std::string result;
  auto begin = std::sregex_iterator(value.begin(), value.end(), kVarPattern);
  auto end = std::sregex_iterator();
  std::size_t lastPos = 0;
  for (auto it = begin; it != end; ++it) {
    const std::smatch& match = *it;
    result.append(value, lastPos, match.position() - lastPos);
    const std::string name = match[1].str();
    std::string replacement;
    if (vars.isObject()) {
      auto found = vars.find(name);
      if (found != vars.items().end() && found->second.isString()) {
        replacement = found->second.getString();
      }
    }
    if (replacement.empty() && match[2].matched) {
      replacement = match[2].str();
    }
    result.append(replacement);
    lastPos = match.position() + match.length();
  }
  result.append(value, lastPos, value.size() - lastPos);
  return result;
}

/**
 * Resolve a dynamic safe-area inset descriptor (`{ "$inset": side, add, floor }`)
 * against the live insets in the context: `max(inset[side] + add, floor)`.
 * Returns false if the value is not an inset descriptor.
 */
bool resolveInsetValue(const folly::dynamic& value,
                       const ResolveContext& ctx,
                       double& out) {
  if (!value.isObject()) return false;
  auto* side = value.get_ptr("$inset");
  if (side == nullptr || !side->isString()) return false;

  const std::string s = side->getString();
  double base = 0.0;
  if (s == "top") base = ctx.insetTop;
  else if (s == "right") base = ctx.insetRight;
  else if (s == "bottom") base = ctx.insetBottom;
  else if (s == "left") base = ctx.insetLeft;
  else return false;

  double add = 0.0;
  if (auto* a = value.get_ptr("add"); a && a->isNumber()) add = a->asDouble();
  double floor = 0.0;
  if (auto* f = value.get_ptr("floor"); f && f->isNumber()) floor = f->asDouble();

  out = std::max(base + add, floor);
  return true;
}

// Canonical RN transform order; must match TRANSFORM_AXES in
// src/compiler/parsers/transform.ts and foldTransform in src/core/normalize.ts.
constexpr const char* kTransformAxes[] = {
    "perspective", "translateX", "translateY", "rotate", "rotateX", "rotateY",
    "rotateZ",     "skewX",      "skewY",      "scaleX", "scaleY",
};

/**
 * Collapse the per-axis transform props the compiler emits (translateX, rotate,
 * scaleX, …) into RN's ordered `transform` array of single-key objects. Mirrors
 * the JS fold so the native commit matches a JS-resolved style exactly.
 */
void foldTransform(folly::dynamic& style) {
  if (!style.isObject()) return;
  folly::dynamic transforms = folly::dynamic::array;
  for (const char* axis : kTransformAxes) {
    auto* value = style.get_ptr(axis);
    if (value == nullptr) continue;
    folly::dynamic entry = folly::dynamic::object();
    entry[axis] = *value;
    transforms.push_back(std::move(entry));
    style.erase(axis);
  }
  if (!transforms.empty()) {
    style["transform"] = std::move(transforms);
  }
}

bool isNativeColorProp(const folly::dynamic& key) {
  if (!key.isString()) return false;
  const auto& prop = key.getString();
  return prop == "color" || prop == "backgroundColor" ||
      prop == "borderColor" || prop == "borderTopColor" ||
      prop == "borderRightColor" || prop == "borderBottomColor" ||
      prop == "borderLeftColor" || prop == "borderStartColor" ||
      prop == "borderEndColor" || prop == "shadowColor" ||
      prop == "textShadowColor" || prop == "tintColor" ||
      prop == "textDecorationColor" || prop == "placeholderTextColor" ||
      prop == "cursorColor" || prop == "selectionColor" ||
      prop == "selectionHandleColor" || prop == "underlineColorAndroid" ||
      prop == "overlayColor" || prop == "accentColor" || prop == "fill" ||
      prop == "stroke" || prop == "thumbColor" ||
      prop == "trackColorFalse" || prop == "trackColorTrue";
}

bool isUnsupportedNativeColorValue(const folly::dynamic& key,
                                   const std::string& value) {
#if defined(__ANDROID__)
  return isNativeColorProp(key) && value.rfind("color-mix(", 0) == 0;
#else
  (void)key;
  (void)value;
  return false;
#endif
}

/**
 * True for props whose (whole-string) value is a color: RN's native color
 * props plus the marker props whose values get spliced into composite values
 * later in this file (`--nitrocss-shadow-color` into each `boxShadow`
 * layer's `color`, `--nw-gradient-from/via/to` into the gradient descriptor).
 */
bool isColorBearingProp(const folly::dynamic& key) {
  if (isNativeColorProp(key)) return true;
  if (!key.isString()) return false;
  const auto& prop = key.getString();
  return prop == "--nitrocss-shadow-color" || prop == "--nw-gradient-from" ||
      prop == "--nw-gradient-via" || prop == "--nw-gradient-to";
}

/**
 * Additive commit-time color lowering. If a color-bearing value still looks
 * like a CSS color FUNCTION after var() substitution (rgb/hsl/hwb/oklch/
 * oklab/lab/lch/color), lower it to hex with the culori-parity parser in
 * cpp/css/ so native commits never carry the modern color functions RN's own
 * parser drops (CSSColorFunction.h TODO T213000437). Hex and named colors are
 * returned untouched — they already pass through natively — so first-paint /
 * commit byte parity with the JS compiler's culori pre-lowering is preserved.
 * Theme values are normally pre-lowered to hex at compile time (themes.ts
 * normalizeThemeValue), which makes this a safety net for themes injected at
 * runtime with raw modern colors, and the enabling step for the later
 * "JS emits raw CSS" flip. Unparseable functions (color-mix, out-of-scope
 * spaces) fall through unchanged to the existing platform handling.
 */
std::string lowerColorFunctionValue(const folly::dynamic& key,
                                    const std::string& value) {
  if (!isColorBearingProp(key)) return value;
  if (!css::looksLikeColorFunction(value)) return value;
  if (auto hex = css::parseColorToHex(value)) return *hex;
  return value;
}

/**
 * The compiler emits `boxShadow` as RN's *processed* `BoxShadowValue[]`
 * (src/compiler/parsers/boxShadow.ts). With `enableNativeCSSParsing` off
 * (RN's stable default), native parsing (BoxShadowPropsConversions.h
 * `parseProcessedBoxShadow`) accepts only that form: numeric px lengths,
 * boolean `inset`, and a `color` that `fromRawValue(SharedColor)` can read —
 * an already-processed ARGB int, NOT a CSS string. So here we (1) splice the
 * theme-resolved `--nitrocss-shadow-color` marker into every layer's `color`
 * (the JS runtime performs the identical splice for web in
 * core/normalize.ts), and (2) lower each layer's hex color to the processed
 * int, so ShadowTree re-commits carry shadows stable RN parses without any
 * experimental feature flag. Raw CSS strings (the compiler's web-only
 * fallback for layers it cannot lower) are erased — natively they would
 * require `enableNativeCSSParsing`.
 */
void normalizeShadow(folly::dynamic& style) {
  if (!style.isObject()) return;
  auto* marker = style.get_ptr("--nitrocss-shadow-color");
  const bool hasMarker = marker != nullptr && marker->isString();
  const std::string color = hasMarker ? marker->getString() : "";
  style.erase("--nitrocss-shadow-color");
#if defined(__ANDROID__)
  // Android paints shadows via the compiler's `elevation` fallback. RN 0.76+
  // Android does parse the processed array form too, but committing it
  // alongside `elevation` would double-draw — keep stripping (mirrors the JS
  // runtime, which strips `boxShadow` on every native platform).
  style.erase("boxShadow");
  return;
#else
  auto* boxShadow = style.get_ptr("boxShadow");
  if (boxShadow == nullptr) return;
  if (!boxShadow->isArray()) {
    style.erase("boxShadow");
    return;
  }
  for (auto& layer : *boxShadow) {
    if (!layer.isObject()) continue;
    if (hasMarker) layer["color"] = color;
    auto* layerColor = layer.get_ptr("color");
    if (layerColor == nullptr || !layerColor->isString()) continue;
    if (auto rgba = css::parseColor(layerColor->getString())) {
      const uint32_t argb = (static_cast<uint32_t>(rgba->a) << 24) |
          (static_cast<uint32_t>(rgba->r) << 16) |
          (static_cast<uint32_t>(rgba->g) << 8) |
          static_cast<uint32_t>(rgba->b);
      layer["color"] = static_cast<int64_t>(argb);
    }
  }
#endif
}

// Gradient marker props emitted by the parser; must match
// src/compiler/parsers/gradient.ts and foldGradient in src/core/normalize.ts.
constexpr const char* kGradientProps[] = {
    "--nw-gradient-type",          "--nw-gradient-position",
    "--nw-gradient-from",          "--nw-gradient-via",
    "--nw-gradient-to",            "--nw-gradient-from-position",
    "--nw-gradient-via-position",  "--nw-gradient-to-position",
    "--nw-gradient-stops-json",    "--nw-gradient-interpolation",
};

double clamp01(double value) {
  return value < 0.0 ? 0.0 : (value > 1.0 ? 1.0 : value);
}

/** Collapse runs of whitespace to single spaces, trim, and lowercase. */
std::string normalizeKeywordString(const std::string& raw) {
  std::string out;
  out.reserve(raw.size());
  bool pendingSpace = false;
  for (char ch : raw) {
    if (ch == ' ' || ch == '\t' || ch == '\n' || ch == '\r') {
      if (!out.empty()) pendingSpace = true;
      continue;
    }
    if (pendingSpace) {
      out += ' ';
      pendingSpace = false;
    }
    out += static_cast<char>(std::tolower(static_cast<unsigned char>(ch)));
  }
  return out;
}

std::vector<std::string> splitTopLevelCommas(const std::string& value) {
  std::vector<std::string> parts;
  int depth = 0;
  char quote = 0;
  size_t start = 0;
  auto trim = [](std::string part) {
    const size_t first = part.find_first_not_of(" \t\n\r");
    if (first == std::string::npos) return std::string();
    const size_t last = part.find_last_not_of(" \t\n\r");
    return part.substr(first, last - first + 1);
  };
  for (size_t index = 0; index < value.size(); index++) {
    const char ch = value[index];
    if (quote != 0) {
      if (ch == quote && (index == 0 || value[index - 1] != '\\')) quote = 0;
      continue;
    }
    if (ch == '\'' || ch == '"') quote = ch;
    else if (ch == '(') depth++;
    else if (ch == ')') depth = std::max(0, depth - 1);
    else if (ch == ',' && depth == 0) {
      parts.push_back(trim(value.substr(start, index - start)));
      start = index + 1;
    }
  }
  parts.push_back(trim(value.substr(start)));
  return parts;
}

struct LiteralGradient {
  std::string type;
  std::string position;
  std::string interpolation;
  folly::dynamic stops = folly::dynamic::array;
};

bool parseCssAngle(const std::string& raw, double& out);

bool parseLiteralGradient(const std::string& raw, LiteralGradient& out) {
  static const std::regex wrapper(
      R"(^\s*(linear|radial|conic)-gradient\(([\s\S]*)\)\s*$)",
      std::regex::icase);
  std::smatch match;
  if (!std::regex_match(raw, match, wrapper)) return false;
  out.type = normalizeKeywordString(match[1].str());
  auto args = splitTopLevelCommas(match[2].str());
  if (args.size() < 2) return false;

  std::string first = args.front();
  static const std::regex interpolationPattern(
      R"(\bin\s+(oklab|oklch|srgb(?:-linear)?|lab|lch|hsl|hwb|xyz(?:-d50|-d65)?)\b)",
      std::regex::icase);
  std::smatch interpolationMatch;
  if (std::regex_search(first, interpolationMatch, interpolationPattern)) {
    out.interpolation = normalizeKeywordString(interpolationMatch[1].str());
    first = std::regex_replace(first, interpolationPattern, "");
    first = normalizeKeywordString(first);
  }

  double parsedAngle = 0.0;
  const bool firstIsGeometry = out.type == "linear"
      ? first.rfind("to ", 0) == 0 || parseCssAngle(first, parsedAngle) ||
          normalizeKeywordString(args.front()).rfind("in ", 0) == 0
      : out.type == "conic"
          ? first.rfind("from ", 0) == 0 || first.rfind("at ", 0) == 0 ||
              normalizeKeywordString(args.front()).rfind("in ", 0) == 0
          : !css::parseColor(first).has_value();
  size_t stopStart = 0;
  if (firstIsGeometry) {
    out.position = first;
    stopStart = 1;
  }

  static const std::regex stopWithPosition(
      R"(^(.*\S)\s+(-?\d*\.?\d+%?)$)");
  for (size_t index = stopStart; index < args.size(); index++) {
    std::string color = args[index];
    std::string position;
    std::smatch stopMatch;
    if (std::regex_match(color, stopMatch, stopWithPosition)) {
      color = stopMatch[1].str();
      position = stopMatch[2].str();
    }
    auto parsedColor = css::parseColor(color);
    if (!parsedColor) return false;
    folly::dynamic stop = folly::dynamic::object("c", css::toHexString(*parsedColor));
    if (!position.empty()) stop["p"] = position;
    out.stops.push_back(std::move(stop));
  }
  return out.stops.size() >= 2;
}

/**
 * `"40%"` → `0.4`; bare numbers pass through (`"0.4"` → `0.4`). Mirrors the JS
 * `parseStopLocation` in `src/compiler/parsers/gradient.ts` byte-for-byte.
 */
double parseStopLocation(const std::string& raw, double fallback) {
  if (raw.empty()) return fallback;
  const std::string trimmed = normalizeKeywordString(raw);
  if (trimmed.empty()) return fallback;
  const bool isPercent = trimmed.back() == '%';
  char* end = nullptr;
  const double num = std::strtod(trimmed.c_str(), &end);
  if (end == trimmed.c_str()) return fallback;
  return clamp01(isPercent ? num / 100.0 : num);
}

/** CSS angle parser mirrored by `parseCssAngle` in gradient.ts. */
bool parseCssAngle(const std::string& raw, double& out) {
  std::string value;
  value.reserve(raw.size());
  for (char ch : normalizeKeywordString(raw)) {
    if (!std::isspace(static_cast<unsigned char>(ch))) value.push_back(ch);
  }
  if (value.empty()) return false;

  if (value.size() > 6 && value.rfind("calc(", 0) == 0 && value.back() == ')') {
    const std::string expression = value.substr(5, value.size() - 6);
    const size_t multiply = expression.rfind('*');
    const size_t divide = expression.rfind('/');
    if (multiply != std::string::npos || divide != std::string::npos) {
      const bool isMultiply = multiply != std::string::npos;
      const size_t op = isMultiply ? multiply : divide;
      double angle = 0.0;
      if (!parseCssAngle(expression.substr(0, op), angle)) return false;
      const std::string scalarRaw = expression.substr(op + 1);
      char* end = nullptr;
      const double scalar = std::strtod(scalarRaw.c_str(), &end);
      if (end == scalarRaw.c_str() || *end != '\0' || (!isMultiply && scalar == 0.0)) {
        return false;
      }
      out = isMultiply ? angle * scalar : angle / scalar;
      return true;
    }
    return parseCssAngle(expression, out);
  }

  double multiplier = 1.0;
  size_t unitLength = 0;
  if (value.size() >= 4 && value.compare(value.size() - 4, 4, "turn") == 0) {
    multiplier = 360.0;
    unitLength = 4;
  } else if (value.size() >= 4 && value.compare(value.size() - 4, 4, "grad") == 0) {
    multiplier = 0.9;
    unitLength = 4;
  } else if (value.size() >= 3 && value.compare(value.size() - 3, 3, "rad") == 0) {
    multiplier = 180.0 / std::acos(-1.0);
    unitLength = 3;
  } else if (value.size() >= 3 && value.compare(value.size() - 3, 3, "deg") == 0) {
    unitLength = 3;
  }
  const std::string numeric = value.substr(0, value.size() - unitLength);
  char* end = nullptr;
  const double number = std::strtod(numeric.c_str(), &end);
  if (end == numeric.c_str() || *end != '\0') return false;
  out = number * multiplier;
  return true;
}

double normalizeAngle(const std::string& raw, double fallback) {
  double parsed = 0.0;
  if (!parseCssAngle(raw, parsed) || !std::isfinite(parsed)) return fallback;
  double angle = std::fmod(parsed, 360.0);
  return angle < 0.0 ? angle + 360.0 : angle;
}

/**
 * `--tw-gradient-position` → CSS angle in degrees for a LINEAR gradient.
 * Keyword corners use the fixed 45°-diagonal table. Mirrors the JS
 * `angleFromPosition` byte-for-byte.
 */
double angleFromPosition(const std::string& position) {
  if (position.empty()) return 180.0;
  const std::string normalized = normalizeKeywordString(position);
  if (normalized == "to top") return 0.0;
  if (normalized == "to top right" || normalized == "to right top") return 45.0;
  if (normalized == "to right") return 90.0;
  if (normalized == "to bottom right" || normalized == "to right bottom") return 135.0;
  if (normalized == "to bottom") return 180.0;
  if (normalized == "to bottom left" || normalized == "to left bottom") return 225.0;
  if (normalized == "to left") return 270.0;
  if (normalized == "to top left" || normalized == "to left top") return 315.0;
  return normalizeAngle(normalized, 180.0);
}

/**
 * RADIAL `at <position>` clause → fractional center. Shape/size keywords are
 * ignored (v1 renders `ellipse farthest-corner`). Mirrors the JS
 * `radialCenterFromPosition` byte-for-byte.
 */
void radialCenterFromPosition(const std::string& position,
                              double& outX,
                              double& outY) {
  outX = 0.5;
  outY = 0.5;
  if (position.empty()) return;
  const std::string normalized = normalizeKeywordString(position);
  const size_t at = normalized.find("at ");
  if (at == std::string::npos) return;
  std::string rest = normalized.substr(at + 3);
  size_t index = 0;
  size_t start = 0;
  while (start <= rest.size() && index < 2) {
    size_t space = rest.find(' ', start);
    if (space == std::string::npos) space = rest.size();
    const std::string token = rest.substr(start, space - start);
    start = space + 1;
    if (token.empty()) continue;
    if (token == "left") outX = 0.0;
    else if (token == "right") outX = 1.0;
    else if (token == "top") outY = 0.0;
    else if (token == "bottom") outY = 1.0;
    else if (token == "center") { /* already 0.5 */ }
    else if (token.back() == '%') {
      char* end = nullptr;
      const double num = std::strtod(token.c_str(), &end);
      if (end != token.c_str()) {
        if (index == 0) outX = clamp01(num / 100.0);
        else outY = clamp01(num / 100.0);
      }
    }
    index++;
  }
}

/** CONIC `from <angle> at <position>` geometry. Mirrors the JS helper. */
double conicAngleFromPosition(const std::string& position) {
  if (position.empty()) return 0.0;
  const std::string normalized = normalizeKeywordString(position);
  static const std::regex pattern(
      R"((?:^|\s)from\s+(.+?)(?=\s+at(?:\s|$)|$))",
      std::regex::icase);
  std::smatch match;
  if (!std::regex_search(normalized, match, pattern)) return 0.0;
  return normalizeAngle(match[1].str(), 0.0);
}

struct OklabColor {
  double l;
  double a;
  double b;
  double alpha;
};

double srgbToLinear(double value) {
  return value <= 0.04045
      ? value / 12.92
      : std::pow((value + 0.055) / 1.055, 2.4);
}

double linearToSrgb(double value) {
  return value <= 0.0031308
      ? value * 12.92
      : 1.055 * std::pow(value, 1.0 / 2.4) - 0.055;
}

OklabColor rgbaToOklab(const css::Rgba& color) {
  const double r = srgbToLinear(color.r / 255.0);
  const double g = srgbToLinear(color.g / 255.0);
  const double b = srgbToLinear(color.b / 255.0);
  const double l = std::cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const double m = std::cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const double s = std::cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
      0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
      color.a / 255.0,
  };
}

uint8_t byteFromUnit(double value) {
  value = std::max(0.0, std::min(1.0, value));
  return static_cast<uint8_t>(std::round(value * 255.0));
}

css::Rgba oklabToRgba(const OklabColor& color) {
  const double l_ = color.l + 0.3963377774 * color.a + 0.2158037573 * color.b;
  const double m_ = color.l - 0.1055613458 * color.a - 0.0638541728 * color.b;
  const double s_ = color.l - 0.0894841775 * color.a - 1.2914855480 * color.b;
  const double l = l_ * l_ * l_;
  const double m = m_ * m_ * m_;
  const double s = s_ * s_ * s_;
  return {
      byteFromUnit(linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
      byteFromUnit(linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
      byteFromUnit(linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)),
      byteFromUnit(color.alpha),
  };
}

/** Expand OKLab intervals into painter-ready native RGB stops. */
void sampleOklabStops(folly::dynamic& colors, folly::dynamic& locations) {
  if (!colors.isArray() || !locations.isArray() || colors.size() < 2 ||
      colors.size() != locations.size()) {
    return;
  }
  folly::dynamic sampledColors = folly::dynamic::array;
  folly::dynamic sampledLocations = folly::dynamic::array;
  constexpr int subdivisions = 8;
  for (size_t index = 0; index + 1 < colors.size(); index++) {
    if (!colors[index].isString() || !colors[index + 1].isString() ||
        !locations[index].isNumber() || !locations[index + 1].isNumber()) {
      return;
    }
    auto fromRgba = css::parseColor(colors[index].getString());
    auto toRgba = css::parseColor(colors[index + 1].getString());
    if (!fromRgba || !toRgba) return;
    const OklabColor from = rgbaToOklab(*fromRgba);
    const OklabColor to = rgbaToOklab(*toRgba);
    const double fromLocation = locations[index].asDouble();
    const double toLocation = locations[index + 1].asDouble();
    for (int step = 0; step < subdivisions; step++) {
      const double t = static_cast<double>(step) / subdivisions;
      const OklabColor mixed = {
          from.l + (to.l - from.l) * t,
          from.a + (to.a - from.a) * t,
          from.b + (to.b - from.b) * t,
          from.alpha + (to.alpha - from.alpha) * t,
      };
      sampledColors.push_back(css::toHexString(oklabToRgba(mixed)));
      sampledLocations.push_back(fromLocation + (toLocation - fromLocation) * t);
    }
  }
  sampledColors.push_back(colors[colors.size() - 1]);
  sampledLocations.push_back(locations[locations.size() - 1]);
  colors = std::move(sampledColors);
  locations = std::move(sampledLocations);
}

/**
 * Assemble the merged `--nw-gradient-*` marker props into the compact numeric
 * gradient descriptor under `--nitrocss-gradient` and erase the markers.
 * Colors are already lowered to hex (literals at compile time, theme `var()`
 * substituted above). Mirrors the JS `foldGradient` (descriptor target) so a
 * native theme-swap commit matches a JS-resolved style exactly. The engine
 * routes the descriptor to the platform gradient applier, which paints it as a
 * layer on the view's own backing layer — no CSS-string parsing at paint time.
 */
void foldGradient(folly::dynamic& style) {
  if (!style.isObject()) return;

  auto get = [&](const char* key) -> std::string {
    auto* v = style.get_ptr(key);
    return (v != nullptr && v->isString()) ? v->getString() : std::string();
  };
  std::string type = get("--nw-gradient-type");
  std::string position = get("--nw-gradient-position");
  const std::string from = get("--nw-gradient-from");
  const std::string via = get("--nw-gradient-via");
  const std::string to = get("--nw-gradient-to");
  const std::string fromPos = get("--nw-gradient-from-position");
  const std::string viaPos = get("--nw-gradient-via-position");
  const std::string toPos = get("--nw-gradient-to-position");
  const std::string literalStopsJson = get("--nw-gradient-stops-json");
  std::string interpolation = get("--nw-gradient-interpolation");
  const std::string rawBackground = get("--nw-background-image-raw");

  folly::dynamic literalStops = nullptr;
  if (!rawBackground.empty()) {
    LiteralGradient rawLiteral;
    if (parseLiteralGradient(rawBackground, rawLiteral)) {
      type = rawLiteral.type;
      position = rawLiteral.position;
      interpolation = rawLiteral.interpolation;
      literalStops = std::move(rawLiteral.stops);
    }
  }
  if (literalStopsJson.empty() && !literalStops.isArray() &&
      (type == "linear" || type == "radial" || type == "conic") &&
      position.find(',') != std::string::npos) {
    LiteralGradient positionLiteral;
    if (parseLiteralGradient(
            type + "-gradient(" + position + ")", positionLiteral)) {
      position = positionLiteral.position;
      if (!positionLiteral.interpolation.empty()) {
        interpolation = positionLiteral.interpolation;
      }
      literalStops = std::move(positionLiteral.stops);
    }
  }

  for (const char* key : kGradientProps) style.erase(key);

  if (type != "linear" && type != "radial" && type != "conic") return;

  if (!literalStops.isArray() && !literalStopsJson.empty()) {
    try {
      auto parsed = folly::parseJson(literalStopsJson);
      if (parsed.isArray() && parsed.size() >= 2) literalStops = std::move(parsed);
    } catch (const std::exception&) {
      // Invalid arbitrary values fail closed and fall back to utility stops.
    }
  }

  folly::dynamic colors = folly::dynamic::array;
  folly::dynamic locations = folly::dynamic::array;
  double previousLocation = 0.0;
  auto push = [&](const std::string& color, double location) {
    // CSS color-stop fixup: positions are monotonic non-decreasing.
    if (location < previousLocation) location = previousLocation;
    previousLocation = location;
    colors.push_back(color);
    locations.push_back(location);
  };
  auto lowerStopColor = [](const std::string& value) {
    if (css::looksLikeColorFunction(value)) {
      if (auto hex = css::parseColorToHex(value)) return *hex;
    }
    return value;
  };
  if (literalStops.isArray()) {
    const size_t count = literalStops.size();
    for (size_t index = 0; index < count; index++) {
      const auto& entry = literalStops[index];
      if (!entry.isObject()) continue;
      auto* color = entry.get_ptr("c");
      if (color == nullptr || !color->isString()) continue;
      auto* positionValue = entry.get_ptr("p");
      const std::string stopPosition =
          positionValue != nullptr && positionValue->isString()
          ? positionValue->getString()
          : std::string();
      const double fallback = count <= 1
          ? 0.0
          : static_cast<double>(index) / static_cast<double>(count - 1);
      push(lowerStopColor(color->getString()),
           parseStopLocation(stopPosition, fallback));
    }
  } else {
    push(from.empty() ? "transparent" : from, parseStopLocation(fromPos, 0.0));
    if (!via.empty()) push(via, parseStopLocation(viaPos, 0.5));
    push(to.empty() ? "transparent" : to, parseStopLocation(toPos, 1.0));
  }
  if (interpolation == "oklab") sampleOklabStops(colors, locations);

  const bool isRadial = type == "radial";
  const bool isConic = type == "conic";
  double centerX = 0.5;
  double centerY = 0.5;
  if (isRadial || isConic) {
    radialCenterFromPosition(position, centerX, centerY);
  }

  folly::dynamic descriptor = folly::dynamic::object();
  descriptor["gradientType"] = type;
  descriptor["angle"] = isRadial
      ? 0.0
      : isConic ? conicAngleFromPosition(position)
                : angleFromPosition(position);
  descriptor["positionX"] = centerX;
  descriptor["positionY"] = centerY;
  descriptor["colors"] = std::move(colors);
  descriptor["locations"] = std::move(locations);
  if (!interpolation.empty()) descriptor["interpolation"] = interpolation;
  if (isRadial) {
    const std::string normalized = normalizeKeywordString(position);
    const bool circle = std::regex_search(
        normalized, std::regex(R"((?:^|\s)circle(?:\s|$))"));
    descriptor["radialShape"] = circle ? "circle" : "ellipse";
    std::string extent = "farthest-corner";
    for (const char* candidate : {
             "closest-side", "farthest-side",
             "closest-corner", "farthest-corner"}) {
      if (normalized.find(candidate) != std::string::npos) {
        extent = candidate;
        break;
      }
    }
    descriptor["radialExtent"] = extent;
  }
  style["--nitrocss-gradient"] = std::move(descriptor);
}

void foldBackgroundImage(folly::dynamic& style) {
  if (!style.isObject()) return;
  auto get = [&](const char* key) -> std::string {
    auto* value = style.get_ptr(key);
    return value != nullptr && value->isString()
        ? value->getString()
        : std::string();
  };
  const std::string raw = get("--nw-background-image-raw");
  const std::string size = get("--nw-background-image-size");
  const std::string repeat = get("--nw-background-image-repeat");
  const std::string position = get("--nw-background-image-position");
  style.erase("--nw-background-image-raw");
  style.erase("--nw-background-image-size");
  style.erase("--nw-background-image-repeat");
  style.erase("--nw-background-image-position");
  if (raw.empty()) return;

  static const std::regex urlPattern(
      R"(^\s*url\(\s*(['"]?)([^'")]*)\1\s*\)\s*$)",
      std::regex::icase);
  std::smatch match;
  if (!std::regex_match(raw, match, urlPattern)) return;

  auto axis = [](const std::string& token, double fallback) {
    if (token == "left" || token == "top") return 0.0;
    if (token == "right" || token == "bottom") return 1.0;
    if (token == "center") return 0.5;
    if (!token.empty() && token.back() == '%') {
      char* end = nullptr;
      const double value = std::strtod(token.c_str(), &end);
      if (end != token.c_str()) return clamp01(value / 100.0);
    }
    return fallback;
  };
  std::istringstream positionStream(normalizeKeywordString(position));
  std::string xToken;
  std::string yToken;
  positionStream >> xToken >> yToken;

  folly::dynamic descriptor = folly::dynamic::object();
  descriptor["url"] = match[2].str();
  descriptor["size"] =
      size == "cover" || size == "contain" || size == "stretch"
      ? size
      : "auto";
  descriptor["repeat"] =
      repeat == "repeat" || repeat == "repeat-x" || repeat == "repeat-y"
      ? repeat
      : "no-repeat";
  descriptor["positionX"] = axis(xToken, 0.5);
  descriptor["positionY"] = axis(yToken, 0.5);
  style["--nitrocss-background-image"] = std::move(descriptor);
}

void foldMask(folly::dynamic& style) {
  if (!style.isObject()) return;
  auto* source = style.get_ptr("--nw-mask-source");
  folly::dynamic sourceCopy =
      source != nullptr && source->isObject() ? *source : folly::dynamic(nullptr);
  auto get = [&](const char* key) -> std::string {
    auto* value = style.get_ptr(key);
    return value != nullptr && value->isString() ? value->getString() : std::string();
  };
  const std::string mode = get("--nw-mask-mode");
  const std::string size = get("--nw-mask-size");
  const std::string repeat = get("--nw-mask-repeat");
  const std::string position = normalizeKeywordString(get("--nw-mask-position"));
  style.erase("--nw-mask-source");
  style.erase("--nw-mask-mode");
  style.erase("--nw-mask-size");
  style.erase("--nw-mask-repeat");
  style.erase("--nw-mask-position");
  if (!sourceCopy.isObject()) return;

  double x = 0.0;
  double y = 0.0;
  std::vector<std::string> positionTokens;
  std::istringstream tokens(position);
  std::string token;
  int freeAxis = 0;
  while (tokens >> token) {
    positionTokens.push_back(token);
    if (token == "left") x = 0.0;
    else if (token == "right") x = 1.0;
    else if (token == "top") y = 0.0;
    else if (token == "bottom") y = 1.0;
    else if (token == "center") {
      if (freeAxis++ == 0) x = 0.5;
      else y = 0.5;
    } else if (!token.empty() && token.back() == '%') {
      char* end = nullptr;
      const double value = std::strtod(token.c_str(), &end);
      if (end != token.c_str()) {
        if (freeAxis++ == 0) x = clamp01(value / 100.0);
        else y = clamp01(value / 100.0);
      }
    }
  }
  if (positionTokens.size() == 1) {
    const auto& only = positionTokens.front();
    if (only == "center") x = y = 0.5;
    else if (only == "left" || only == "right") y = 0.5;
    else if (only == "top" || only == "bottom") x = 0.5;
    else y = 0.5;
  }
  folly::dynamic descriptor = folly::dynamic::object();
  descriptor["source"] = std::move(sourceCopy);
  descriptor["mode"] = mode == "alpha" || mode == "luminance" ? mode : "match-source";
  descriptor["size"] = size == "cover" || size == "contain"
      ? size
      : size == "100% 100%" ? "stretch" : "auto";
  descriptor["repeat"] = repeat == "repeat" || repeat == "repeat-x" || repeat == "repeat-y"
      ? repeat
      : "no-repeat";
  descriptor["positionX"] = x;
  descriptor["positionY"] = y;
  style["--nitrocss-mask"] = std::move(descriptor);
}

/** Parse a compiled `container` descriptor (`{ axis, op, value, name? }`). */
void parseContainerCondition(const folly::dynamic& obj, ContainerCondition& out) {
  if (!obj.isObject()) return;
  out.present = true;
  if (auto* axis = obj.get_ptr("axis"); axis && axis->isString()) {
    out.axis = axis->getString() == "height" ? ContainerAxis::Height
                                             : ContainerAxis::Width;
  }
  if (auto* op = obj.get_ptr("op"); op && op->isString()) {
    const std::string s = op->getString();
    if (s == ">") out.op = ContainerOp::Gt;
    else if (s == "<") out.op = ContainerOp::Lt;
    else if (s == ">=") out.op = ContainerOp::Ge;
    else if (s == "<=") out.op = ContainerOp::Le;
  }
  if (auto* value = obj.get_ptr("value"); value && value->isNumber()) {
    out.value = value->asDouble();
  }
  if (auto* name = obj.get_ptr("name"); name && name->isString()) {
    out.name = name->getString();
  }
}

} // namespace

void NitroCssEngine::setCompiledStyles(const std::string& json) {
  folly::dynamic root = folly::parseJson(json);
  std::lock_guard<std::mutex> lock(mutex_);

  classes_.clear();
  themes_.clear();
  themeNames_.clear();

  if (root.isObject()) {
    if (auto* classes = root.get_ptr("classes"); classes && classes->isObject()) {
      for (const auto& entry : classes->items()) {
        std::vector<CompiledBucket> buckets;
        if (entry.second.isArray()) {
          for (const auto& raw : entry.second) {
            CompiledBucket bucket;
            if (auto* order = raw.get_ptr("order"); order && order->isInt()) {
              bucket.order = static_cast<uint64_t>(order->getInt());
            }
            if (auto* style = raw.get_ptr("style")) bucket.style = *style;
            if (auto* deps = raw.get_ptr("dependencies"); deps && deps->isInt()) {
              bucket.dependencies = static_cast<uint32_t>(deps->getInt());
            }
            if (auto* variant = raw.get_ptr("variant"); variant && variant->isString()) {
              bucket.variant = variant->getString();
            }
            if (auto* platform = raw.get_ptr("platform"); platform && platform->isString()) {
              bucket.platform = platform->getString();
            }
            if (auto* media = raw.get_ptr("media"); media && media->isObject()) {
              if (auto* minWidth = media->get_ptr("minWidth"); minWidth && minWidth->isNumber()) {
                bucket.hasMinWidth = true;
                bucket.minWidth = minWidth->asDouble();
              }
              if (auto* maxWidth = media->get_ptr("maxWidth"); maxWidth && maxWidth->isNumber()) {
                bucket.hasMaxWidth = true;
                bucket.maxWidth = maxWidth->asDouble();
              }
              if (auto* orientation = media->get_ptr("orientation"); orientation && orientation->isString()) {
                bucket.mediaOrientation = orientation->getString() == "landscape" ? 1 : 0;
              }
            }
            if (auto* container = raw.get_ptr("container");
                container && container->isObject()) {
              parseContainerCondition(*container, bucket.container);
            }
            if (auto* marker = raw.get_ptr("containerMarker");
                marker && marker->isObject()) {
              bucket.isContainerMarker = true;
              if (auto* name = marker->get_ptr("name");
                  name && name->isString()) {
                bucket.containerName = name->getString();
              }
            }
            buckets.push_back(std::move(bucket));
          }
        }
        classes_.emplace(entry.first.getString(), std::move(buckets));
      }
    }

    if (auto* themes = root.get_ptr("themes"); themes && themes->isObject()) {
      for (const auto& entry : themes->items()) {
        themes_.emplace(entry.first.getString(), entry.second);
      }
    }

    if (auto* names = root.get_ptr("themeNames"); names && names->isArray()) {
      for (const auto& name : *names) {
        if (name.isString()) themeNames_.push_back(name.getString());
      }
    }

    if (auto* rem = root.get_ptr("rem"); rem && rem->isNumber()) {
      rem_ = rem->asDouble();
    }
  }

  if (currentTheme_.empty() && !themeNames_.empty()) {
    currentTheme_ = themeNames_.front();
  }
}

void NitroCssEngine::registerThemes(const std::vector<std::string>& names) {
  std::lock_guard<std::mutex> lock(mutex_);
  themeNames_ = names;
  if (currentTheme_.empty() && !themeNames_.empty()) {
    currentTheme_ = themeNames_.front();
  }
}

void NitroCssEngine::setTheme(const std::string& name) {
  std::lock_guard<std::mutex> lock(mutex_);
  currentTheme_ = name;
}

std::string NitroCssEngine::currentTheme() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return currentTheme_;
}

bool NitroCssEngine::hasTheme(const std::string& name) const {
  std::lock_guard<std::mutex> lock(mutex_);
  return themes_.find(name) != themes_.end();
}

double NitroCssEngine::rem() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return rem_;
}

uint32_t NitroCssEngine::dependencyMask(const std::string& className) const {
  std::lock_guard<std::mutex> lock(mutex_);
  uint32_t mask = 0;
  for (const auto& token : splitTokens(className)) {
    auto it = classes_.find(token);
    if (it == classes_.end()) continue;
    for (const auto& bucket : it->second) {
      if (!platformApplies(bucket.platform)) continue;
      mask |= bucket.dependencies;
    }
  }
  return mask;
}

bool NitroCssEngine::resolveContainerMarker(const std::string& className,
                                         std::string& outName) const {
  std::lock_guard<std::mutex> lock(mutex_);
  for (const auto& token : splitTokens(className)) {
    auto it = classes_.find(token);
    if (it == classes_.end()) continue;
    for (const auto& bucket : it->second) {
      if (bucket.isContainerMarker) {
        outName = bucket.containerName;
        return true;
      }
    }
  }
  return false;
}

bool NitroCssEngine::resolveGroupMarker(const std::string& className,
                                     std::string& outName) const {
  for (const auto& token : splitTokens(className)) {
    if (token == "group") {
      outName.clear();
      return true;
    }
    constexpr const char* prefix = "group/";
    if (token.rfind(prefix, 0) == 0 && token.size() > std::char_traits<char>::length(prefix)) {
      outName = token.substr(std::char_traits<char>::length(prefix));
      return true;
    }
  }
  return false;
}

bool NitroCssEngine::variantApplies(const std::string& variant, const ResolveContext& ctx) {
  if (variant == "base" || variant == "responsive") return true;
  if (variant == "dark") return ctx.colorScheme == 1;
  if (variant == "light") return ctx.colorScheme == 0;
  if (variant == "hover") return ctx.isHovered;
  if (variant == "focus" || variant == "focus-visible" || variant == "focus-within") {
    return ctx.isFocused;
  }
  if (variant == "active") return ctx.isActive;
  if (variant == "disabled") return ctx.isDisabled;
  if (variant == "enabled") return !ctx.isDisabled;
  if (variant == "first") return ctx.isFirstChild;
  if (variant == "last") return ctx.isLastChild;
  if (variant == "group-hover") return ctx.isGroupHovered;
  if (variant == "group-focus" || variant == "group-focus-visible" ||
      variant == "group-focus-within") {
    return ctx.isGroupFocused;
  }
  if (variant == "group-active") return ctx.isGroupActive;
  if (variant == "group-disabled") return ctx.isGroupDisabled;
  if (variant == "group-enabled") return !ctx.isGroupDisabled;
  if (variant == "before" || variant == "after" || variant == "unsupported-pseudo") {
    return false;
  }
  return true;
}

bool NitroCssEngine::platformApplies(const std::string& platform) {
  if (platform.empty()) return true;
#if defined(__ANDROID__)
  constexpr const char* kOS = "android";
#elif defined(__APPLE__) && TARGET_OS_TV
  constexpr const char* kOS = "tvos";
#elif defined(__APPLE__) && TARGET_OS_OSX
  constexpr const char* kOS = "macos";
#elif defined(__APPLE__)
  constexpr const char* kOS = "ios";
#else
  constexpr const char* kOS = "native";
#endif
  // The native engine never runs on web; `native` matches every device build.
  if (platform == "web") return false;
  if (platform == "native") return true;
  return platform == kOS;
}

bool NitroCssEngine::mediaApplies(const CompiledBucket& bucket,
                                  const ResolveContext& ctx) {
  if (bucket.hasMinWidth && ctx.screenWidth < bucket.minWidth) return false;
  if (bucket.hasMaxWidth && ctx.screenWidth > bucket.maxWidth) return false;
  if (bucket.mediaOrientation >= 0 && ctx.orientation != bucket.mediaOrientation) {
    return false;
  }
  return true;
}

bool NitroCssEngine::containerMatches(const ContainerCondition& condition,
                                   const ResolveContext& ctx) {
  double width = ctx.containerWidth;
  double height = ctx.containerHeight;
  if (!condition.name.empty()) {
    auto it = ctx.namedContainerSizes.find(condition.name);
    if (it == ctx.namedContainerSizes.end()) return false;
    width = it->second.first;
    height = it->second.second;
  } else if (!ctx.hasContainer) {
    // The nearest container hasn't been measured yet — defer until layout.
    return false;
  }
  const double v = condition.axis == ContainerAxis::Width ? width : height;
  switch (condition.op) {
    case ContainerOp::Gt: return v > condition.value;
    case ContainerOp::Lt: return v < condition.value;
    case ContainerOp::Ge: return v >= condition.value;
    case ContainerOp::Le: return v <= condition.value;
  }
  return false;
}

folly::dynamic NitroCssEngine::effectiveVars(const ResolveContext& ctx) const {
  folly::dynamic result = folly::dynamic::object();

  if (!themeNames_.empty()) {
    auto defaults = themes_.find(themeNames_.front());
    if (defaults != themes_.end() && defaults->second.isObject()) {
      mergeFolly(result, defaults->second);
    }
  }

  auto active = themes_.find(ctx.themeName);
  if (active != themes_.end() && active->second.isObject()) {
    mergeFolly(result, active->second);
  }

  if (ctx.themeName != "light" && ctx.themeName != "dark") {
    return result;
  }

  const std::string schemeTheme = ctx.colorScheme == 1 ? "dark" : "light";
  auto overlay = themes_.find(schemeTheme);
  if (overlay != themes_.end() && overlay->second.isObject()) {
    mergeFolly(result, overlay->second);
  }

  return result;
}

folly::dynamic NitroCssEngine::resolve(const std::string& className,
                                    const ResolveContext& ctx,
                                    uint32_t& outMask) const {
  std::lock_guard<std::mutex> lock(mutex_);

  folly::dynamic style = folly::dynamic::object();
  outMask = 0;

  const auto tokens = splitTokens(className);
  if (tokens.empty()) return style;

  const folly::dynamic vars = effectiveVars(ctx);

  std::vector<const CompiledBucket*> orderedBuckets;
  for (const auto& token : tokens) {
    auto it = classes_.find(token);
    if (it == classes_.end()) continue;
    for (const auto& bucket : it->second) orderedBuckets.push_back(&bucket);
  }
  std::stable_sort(
      orderedBuckets.begin(), orderedBuckets.end(),
      [](const CompiledBucket* a, const CompiledBucket* b) {
        return a->order < b->order;
      });

  for (const CompiledBucket* bucketPtr : orderedBuckets) {
      const auto& bucket = *bucketPtr;
      if (!platformApplies(bucket.platform)) continue;
      if (!mediaApplies(bucket, ctx)) continue;
      outMask |= bucket.dependencies;
      if (!variantApplies(bucket.variant, ctx)) continue;
      if (bucket.container.present && !containerMatches(bucket.container, ctx)) {
        continue;
      }
      if (!bucket.style.isObject()) continue;

      for (const auto& pair : bucket.style.items()) {
        const folly::dynamic& value = pair.second;
        double insetPx = 0.0;
        if (resolveInsetValue(value, ctx, insetPx)) {
          style[pair.first] = insetPx;
          continue;
        }
        if (value.isString()) {
          const std::string str = value.getString();
          if (str.find("var(") != std::string::npos) {
            const std::string resolved = lowerColorFunctionValue(
                pair.first, resolveVarsInString(str, vars));
            if (isUnsupportedNativeColorValue(pair.first, resolved)) continue;
            style[pair.first] = resolved;
            continue;
          }
          if (isUnsupportedNativeColorValue(pair.first, str)) continue;
          const std::string lowered = lowerColorFunctionValue(pair.first, str);
          if (lowered != str) {
            style[pair.first] = lowered;
            continue;
          }
        }
        style[pair.first] = value;
      }
  }

  foldTransform(style);
  foldGradient(style);
  foldBackgroundImage(style);
  foldMask(style);
  normalizeShadow(style);
  // `backdrop-filter` compiles to this marker (src/compiler/parsers/filter.ts)
  // so it never pollutes RN's `filter` prop. The JS side consumes it: `View`
  // reads it from the JS-resolved styles and renders the native BackdropView
  // layer. Committed RN props must never carry it, so the engine still erases
  // it here at the resolve() tail.
  style.erase("--nitrocss-backdrop-filter");
  return style;
}

} // namespace nitrocss
