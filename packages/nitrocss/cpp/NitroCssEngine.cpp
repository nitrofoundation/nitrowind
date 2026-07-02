#include "NitroCssEngine.hpp"

#include <algorithm>
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

const std::regex kBoxShadowColorPattern(
    R"(#(?:[0-9a-fA-F]{3,8})\b|rgba?\([^)]*\)|hsla?\([^)]*\)|oklch\([^)]*\)|oklab\([^)]*\)|lab\([^)]*\)|lch\([^)]*\)|color\([^)]*\))");

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

void normalizeShadow(folly::dynamic& style) {
  if (!style.isObject()) return;
  auto* marker = style.get_ptr("--nitrowind-shadow-color");
  const bool hasMarker = marker != nullptr && marker->isString();
  const std::string color = hasMarker ? marker->getString() : "";
  style.erase("--nitrowind-shadow-color");
#if defined(__ANDROID__)
  style.erase("boxShadow");
  return;
#endif
  if (!hasMarker) return;
  auto* boxShadow = style.get_ptr("boxShadow");
  if (boxShadow == nullptr || !boxShadow->isString()) return;
  style["boxShadow"] = std::regex_replace(
      boxShadow->getString(), kBoxShadowColorPattern, color);
}

// Gradient marker props emitted by the parser; must match
// src/compiler/parsers/gradient.ts and foldGradient in src/core/normalize.ts.
constexpr const char* kGradientProps[] = {
    "--nw-gradient-type",          "--nw-gradient-position",
    "--nw-gradient-from",          "--nw-gradient-via",
    "--nw-gradient-to",            "--nw-gradient-from-position",
    "--nw-gradient-via-position",  "--nw-gradient-to-position",
};

/**
 * Assemble the merged `--nw-gradient-*` marker props into RN's native
 * `experimental_backgroundImage` string and erase the markers. Colors are
 * already lowered to hex (literals at compile time, theme `var()` substituted
 * above), so this is pure string composition. Mirrors the JS `foldGradient` so
 * a native theme-swap commit matches a JS-resolved style exactly.
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

  auto stop = [](const std::string& color, const std::string& fallbackColor,
                 const std::string& pos, const std::string& fallbackPos) {
    const std::string c = color.empty() ? fallbackColor : color;
    const std::string p = pos.empty() ? fallbackPos : pos;
    return p.empty() ? c : c + " " + p;
  };

  std::string stops = stop(from, "transparent", fromPos, "0%");
  if (!via.empty()) stops += ", " + stop(via, via, viaPos, "50%");
  stops += ", " + stop(to, "transparent", toPos, "100%");

  const std::string prelude = position.empty() ? "" : position + ", ";
  style["experimental_backgroundImage"] =
      type + "-gradient(" + prelude + stops + ")";
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
            const std::string resolved = resolveVarsInString(str, vars);
            if (isUnsupportedNativeColorValue(pair.first, resolved)) continue;
            style[pair.first] = resolved;
            continue;
          }
          if (isUnsupportedNativeColorValue(pair.first, str)) continue;
        }
        style[pair.first] = value;
      }
    }
  }

  foldTransform(style);
  foldGradient(style);
  normalizeShadow(style);
  return style;
}

} // namespace nitrocss
