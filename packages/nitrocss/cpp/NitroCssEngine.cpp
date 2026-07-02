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
 * later in this file (`--nitrowind-shadow-color` into each `boxShadow`
 * layer's `color`, `--nw-gradient-from/via/to` into the gradient descriptor).
 */
bool isColorBearingProp(const folly::dynamic& key) {
  if (isNativeColorProp(key)) return true;
  if (!key.isString()) return false;
  const auto& prop = key.getString();
  return prop == "--nitrowind-shadow-color" || prop == "--nw-gradient-from" ||
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
 * theme-resolved `--nitrowind-shadow-color` marker into every layer's `color`
 * (the JS runtime performs the identical splice for web in
 * core/normalize.ts), and (2) lower each layer's hex color to the processed
 * int, so ShadowTree re-commits carry shadows stable RN parses without any
 * experimental feature flag. Raw CSS strings (the compiler's web-only
 * fallback for layers it cannot lower) are erased — natively they would
 * require `enableNativeCSSParsing`.
 */
void normalizeShadow(folly::dynamic& style) {
  if (!style.isObject()) return;
  auto* marker = style.get_ptr("--nitrowind-shadow-color");
  const bool hasMarker = marker != nullptr && marker->isString();
  const std::string color = hasMarker ? marker->getString() : "";
  style.erase("--nitrowind-shadow-color");
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
  // `45deg` / bare number, mirroring JS `/^(-?\d*\.?\d+)(deg)?$/`.
  std::string numeric = normalized;
  if (numeric.size() > 3 && numeric.compare(numeric.size() - 3, 3, "deg") == 0) {
    numeric = numeric.substr(0, numeric.size() - 3);
  }
  char* end = nullptr;
  const double num = std::strtod(numeric.c_str(), &end);
  if (end == nullptr || *end != '\0' || end == numeric.c_str()) return 180.0;
  double angle = std::fmod(num, 360.0);
  if (angle < 0.0) angle += 360.0;
  return angle;
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

/**
 * Assemble the merged `--nw-gradient-*` marker props into the compact numeric
 * gradient descriptor under `--nitrowind-gradient` and erase the markers.
 * Colors are already lowered to hex (literals at compile time, theme `var()`
 * substituted above). Mirrors the JS `foldGradient` (descriptor target) so a
 * native theme-swap commit matches a JS-resolved style exactly. The engine's
 * own Nitro `GradientView` consumes the descriptor verbatim — no CSS-string
 * parsing at paint time.
 */
void foldGradient(folly::dynamic& style) {
  if (!style.isObject()) return;

  auto get = [&](const char* key) -> std::string {
    auto* v = style.get_ptr(key);
    return (v != nullptr && v->isString()) ? v->getString() : std::string();
  };
  const std::string type = get("--nw-gradient-type");
  const std::string position = get("--nw-gradient-position");
  const std::string from = get("--nw-gradient-from");
  const std::string via = get("--nw-gradient-via");
  const std::string to = get("--nw-gradient-to");
  const std::string fromPos = get("--nw-gradient-from-position");
  const std::string viaPos = get("--nw-gradient-via-position");
  const std::string toPos = get("--nw-gradient-to-position");

  for (const char* key : kGradientProps) style.erase(key);

  if (type != "linear" && type != "radial") return;

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
  push(from.empty() ? "transparent" : from, parseStopLocation(fromPos, 0.0));
  if (!via.empty()) push(via, parseStopLocation(viaPos, 0.5));
  push(to.empty() ? "transparent" : to, parseStopLocation(toPos, 1.0));

  const bool isRadial = type == "radial";
  double centerX = 0.5;
  double centerY = 0.5;
  if (isRadial) radialCenterFromPosition(position, centerX, centerY);

  folly::dynamic descriptor = folly::dynamic::object();
  descriptor["gradientType"] = type;
  descriptor["angle"] = isRadial ? 0.0 : angleFromPosition(position);
  descriptor["positionX"] = centerX;
  descriptor["positionY"] = centerY;
  descriptor["colors"] = std::move(colors);
  descriptor["locations"] = std::move(locations);
  style["--nitrowind-gradient"] = std::move(descriptor);
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

  for (const auto& token : tokens) {
    auto it = classes_.find(token);
    if (it == classes_.end()) continue;

    for (const auto& bucket : it->second) {
      if (!platformApplies(bucket.platform)) continue;
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
  }

  foldTransform(style);
  foldGradient(style);
  normalizeShadow(style);
  // `backdrop-filter` compiles to this marker (src/compiler/parsers/filter.ts)
  // so it never pollutes RN's `filter` prop. The JS side consumes it: `View`
  // reads it from the JS-resolved styles and renders the native BackdropView
  // layer. Committed RN props must never carry it, so the engine still erases
  // it here at the resolve() tail.
  style.erase("--nitrowind-backdrop-filter");
  return style;
}

} // namespace nitrocss
