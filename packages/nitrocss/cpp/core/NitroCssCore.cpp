#include "NitroCssCore.hpp"

#include "../bgimage/BackgroundImageTargets.hpp"
#include "../clippath/ClipPathTargets.hpp"
#include "../css/CssColor.hpp"
#include "../fabric/LayoutObserver.hpp"
#include "../fabric/ShadowTreeMutator.hpp"
#include "../gradient/GradientAngleOverrides.hpp"
#include "../gradient/GradientTargets.hpp"
#include "../grid/GridLayoutEngine.hpp"
#include "../effects/EffectTargets.hpp"

#include <cstdint>
#include <cmath>
#include <chrono>
#include <cstring>
#include <functional>

namespace nitrocss {

using namespace facebook::react;

namespace {

std::size_t combineHash(std::size_t seed, std::size_t value) {
  return seed ^ (value + 0x9e3779b97f4a7c15ULL + (seed << 6) + (seed >> 2));
}

std::size_t hashDynamic(const folly::dynamic& value) {
  if (value.isNull()) return 0x11;
  if (value.isBool()) return combineHash(0x22, value.getBool() ? 1 : 0);
  if (value.isInt())
    return combineHash(0x33, std::hash<int64_t>{}(value.getInt()));
  if (value.isDouble()) {
    const double number = value.getDouble();
    uint64_t bits = 0;
    std::memcpy(&bits, &number, sizeof(bits));
    return combineHash(0x44, std::hash<uint64_t>{}(bits));
  }
  if (value.isString())
    return combineHash(0x55, std::hash<std::string>{}(value.getString()));
  if (value.isArray()) {
    std::size_t hash = 0x66;
    for (const auto& item : value) hash = combineHash(hash, hashDynamic(item));
    return hash;
  }
  if (value.isObject()) {
    std::size_t hash = 0x77;
    for (const auto& item : value.items()) {
      hash = combineHash(hash, hashDynamic(item.first));
      hash = combineHash(hash, hashDynamic(item.second));
    }
    return hash;
  }
  return 0x88;
}

bool isHexDigit(char c) {
  return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') ||
      (c >= 'A' && c <= 'F');
}

uint8_t hexValue(char c) {
  if (c >= '0' && c <= '9') return static_cast<uint8_t>(c - '0');
  if (c >= 'a' && c <= 'f') return static_cast<uint8_t>(10 + c - 'a');
  return static_cast<uint8_t>(10 + c - 'A');
}

bool parseHexColor(const std::string& value, int64_t& out) {
  if (value.empty() || value[0] != '#') return false;
  const std::size_t len = value.size() - 1;
  if (len != 3 && len != 4 && len != 6 && len != 8) return false;
  for (std::size_t i = 1; i < value.size(); ++i) {
    if (!isHexDigit(value[i])) return false;
  }

  auto nibble = [&](std::size_t i) { return hexValue(value[i]); };
  uint8_t r = 0;
  uint8_t g = 0;
  uint8_t b = 0;
  uint8_t a = 0xff;
  if (len == 3 || len == 4) {
    r = static_cast<uint8_t>((nibble(1) << 4) | nibble(1));
    g = static_cast<uint8_t>((nibble(2) << 4) | nibble(2));
    b = static_cast<uint8_t>((nibble(3) << 4) | nibble(3));
    if (len == 4) a = static_cast<uint8_t>((nibble(4) << 4) | nibble(4));
  } else {
    r = static_cast<uint8_t>((nibble(1) << 4) | nibble(2));
    g = static_cast<uint8_t>((nibble(3) << 4) | nibble(4));
    b = static_cast<uint8_t>((nibble(5) << 4) | nibble(6));
    if (len == 8) a = static_cast<uint8_t>((nibble(7) << 4) | nibble(8));
  }

  uint32_t processed =
      (static_cast<uint32_t>(a) << 24) |
      (static_cast<uint32_t>(r) << 16) |
      (static_cast<uint32_t>(g) << 8) |
      static_cast<uint32_t>(b);
#if defined(__ANDROID__)
  out = static_cast<int32_t>(processed);
#else
  out = static_cast<int64_t>(processed);
#endif
  return true;
}

bool hasStructuralPseudoToken(const std::string& className) {
  return className.find("first:") != std::string::npos ||
      className.find("last:") != std::string::npos;
}

bool isColorProp(const folly::dynamic& key) {
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

bool parseAngleDegrees(const std::string& value, double& out) {
  try {
    std::size_t parsed = 0;
    const double numeric = std::stod(value, &parsed);
    if (parsed == value.size() && numeric == 0.0) {
      out = 0.0;
      return true;
    }
    const std::string unit = value.substr(parsed);
    if (unit == "deg") {
      out = numeric;
      return true;
    }
    if (unit == "rad") {
      constexpr double radiansToDegrees = 180.0 / 3.14159265358979323846;
      out = numeric * radiansToDegrees;
      return true;
    }
  } catch (...) {
  }
  return false;
}

void processFilterColors(folly::dynamic& value) {
  if (!value.isArray()) return;
  for (auto& filter : value) {
    if (!filter.isObject()) continue;
    auto hueRotate = filter.find("hueRotate");
    if (hueRotate != filter.items().end() && hueRotate->second.isString()) {
      double degrees = 0.0;
      if (parseAngleDegrees(hueRotate->second.getString(), degrees)) {
        filter["hueRotate"] = degrees;
      }
    }
    auto dropShadow = filter.find("dropShadow");
    if (dropShadow == filter.items().end() || !dropShadow->second.isObject()) {
      continue;
    }
    auto color = dropShadow->second.find("color");
    if (color == dropShadow->second.items().end() || !color->second.isString()) {
      continue;
    }
    int64_t processed = 0;
    if (parseHexColor(color->second.getString(), processed)) {
      dropShadow->second["color"] = processed;
    }
  }
}

void processColorProps(folly::dynamic& style) {
  if (!style.isObject()) return;
  for (const auto& pair : style.items()) {
    if (pair.first.isString() && pair.first.getString() == "filter") {
      processFilterColors(style[pair.first]);
      continue;
    }
    if (!isColorProp(pair.first) || !pair.second.isString()) continue;
    std::string value = pair.second.getString();
    if (auto mixed = css::parseColorMixToHex(value)) value = *mixed;
    int64_t processed = 0;
    if (parseHexColor(value, processed)) {
      style[pair.first] = processed;
    }
  }
}

/**
 * react-native-svg's Fabric props model represents fill/stroke as a brush
 * object, not as React Native's processed color scalar. Sending the scalar
 * through a ShadowTree mutation is decoded on Android as the one-item brush
 * `[0]`, and RenderableView subsequently crashes while reading its color.
 *
 * The SVG wrappers identify themselves with the private `NitroSvg:` prefix so
 * this conversion remains scoped to react-native-svg hosts. This also keeps
 * native theme/state recomputes in the same shape as react-native-svg's JS
 * `extractBrush` first-paint path.
 */
folly::dynamic toSvgBrush(const folly::dynamic& value) {
  if (value.isNull()) return nullptr;
  if (value.isObject() && value.get_ptr("type") != nullptr) return value;

  if (value.isString()) {
    const auto& paint = value.getString();
    if (paint == "none") return nullptr;
    if (paint == "currentColor") return folly::dynamic::object("type", 2);
    if (paint == "context-fill") return folly::dynamic::object("type", 3);
    if (paint == "context-stroke") return folly::dynamic::object("type", 4);
    constexpr const char* urlPrefix = "url(#";
    if (paint.rfind(urlPrefix, 0) == 0 && paint.size() > 6 &&
        paint.back() == ')') {
      return folly::dynamic::object("type", 1)(
          "brushRef", paint.substr(5, paint.size() - 6));
    }
  }

  return folly::dynamic::object("type", 0)("payload", value);
}

void processSvgPaintProps(const std::string& componentName,
                          folly::dynamic& props) {
  if (componentName.rfind("NitroSvg:", 0) != 0 || !props.isObject()) return;
  for (const char* key : {"fill", "stroke"}) {
    if (auto* value = props.get_ptr(key); value != nullptr) {
      props[key] = toSvgBrush(*value);
    }
  }
}

// --- Grid config decode (mirrors the JS serializer in grid.tsx) -------------

double numberOr(const folly::dynamic& value, double fallback) {
  if (value.isDouble()) return value.getDouble();
  if (value.isInt()) return static_cast<double>(value.getInt());
  return fallback;
}

grid::Track parseGridTrack(const folly::dynamic& value, const grid::Track& fallback) {
  if (!value.isObject()) return fallback;
  grid::Track track = fallback;
  if (auto* type = value.get_ptr("type"); type != nullptr && type->isString()) {
    const auto& t = type->getString();
    if (t == "fr") track.type = grid::TrackType::Fr;
    else if (t == "px") track.type = grid::TrackType::Px;
    else if (t == "percent") track.type = grid::TrackType::Percent;
    else if (t == "auto") track.type = grid::TrackType::Auto;
  }
  if (auto* v = value.get_ptr("value"); v != nullptr) {
    track.value = numberOr(*v, track.value);
  }
  return track;
}

std::vector<grid::Track> parseGridTracks(const folly::dynamic& value) {
  std::vector<grid::Track> tracks;
  if (!value.isArray()) return tracks;
  tracks.reserve(value.size());
  for (const auto& entry : value) {
    tracks.push_back(parseGridTrack(entry, grid::Track{}));
  }
  return tracks;
}

int intOr(const folly::dynamic& value, const char* key, int fallback) {
  if (!value.isObject()) return fallback;
  if (auto* v = value.get_ptr(key); v != nullptr) {
    if (v->isInt()) return static_cast<int>(v->getInt());
    if (v->isDouble()) return static_cast<int>(v->getDouble());
  }
  return fallback;
}

grid::Alignment gridAlignmentOr(const folly::dynamic& value,
                                const char* key,
                                grid::Alignment fallback) {
  if (!value.isObject()) return fallback;
  auto* entry = value.get_ptr(key);
  if (entry == nullptr || !entry->isString()) return fallback;
  const auto& name = entry->getString();
  if (name == "start") return grid::Alignment::Start;
  if (name == "center") return grid::Alignment::Center;
  if (name == "end") return grid::Alignment::End;
  return grid::Alignment::Stretch;
}

grid::GridConfig parseGridConfig(const folly::dynamic& value) {
  grid::GridConfig config;
  if (!value.isObject()) return config;
  if (auto* columns = value.get_ptr("columns"); columns != nullptr) {
    config.columns = parseGridTracks(*columns);
  }
  if (auto* rows = value.get_ptr("rows"); rows != nullptr) {
    config.rows = parseGridTracks(*rows);
  }
  if (auto* autoRow = value.get_ptr("autoRow"); autoRow != nullptr) {
    config.autoRow = parseGridTrack(*autoRow, config.autoRow);
  }
  if (auto* columnGap = value.get_ptr("columnGap"); columnGap != nullptr) {
    config.columnGap = numberOr(*columnGap, 0.0);
  }
  if (auto* rowGap = value.get_ptr("rowGap"); rowGap != nullptr) {
    config.rowGap = numberOr(*rowGap, 0.0);
  }
  if (auto* dense = value.get_ptr("dense"); dense != nullptr && dense->isBool()) {
    config.dense = dense->getBool();
  }
  config.justifyItems = gridAlignmentOr(value, "justifyItems", config.justifyItems);
  config.alignItems = gridAlignmentOr(value, "alignItems", config.alignItems);
  if (auto* padding = value.get_ptr("paddingHorizontal"); padding != nullptr) {
    config.paddingHorizontal = numberOr(*padding, 0.0);
  }
  if (auto* padding = value.get_ptr("paddingTop"); padding != nullptr) {
    config.paddingTop = numberOr(*padding, 0.0);
  }
  if (auto* padding = value.get_ptr("paddingBottom"); padding != nullptr) {
    config.paddingBottom = numberOr(*padding, 0.0);
  }
  if (auto* items = value.get_ptr("items"); items != nullptr && items->isArray()) {
    config.items.reserve(items->size());
    for (const auto& item : *items) {
      grid::Placement placement;
      placement.columnStart = intOr(item, "columnStart", 0);
      placement.columnSpan = intOr(item, "columnSpan", 1);
      placement.rowStart = intOr(item, "rowStart", 0);
      placement.rowSpan = intOr(item, "rowSpan", 1);
      placement.justifySelf = gridAlignmentOr(item, "justifySelf", placement.justifySelf);
      placement.alignSelf = gridAlignmentOr(item, "alignSelf", placement.alignSelf);
      config.items.push_back(placement);
    }
  }
  return config;
}

} // namespace

NitroCssCore& NitroCssCore::shared() {
  static NitroCssCore instance;
  return instance;
}

// --- Runtime ---------------------------------------------------------------

RuntimeState NitroCssCore::runtimeState() const {
  std::lock_guard<std::mutex> lock(stateMutex_);
  return state_;
}

void NitroCssCore::setRuntimeState(const RuntimeState& next) {
  uint32_t changed;
  {
    std::lock_guard<std::mutex> lock(stateMutex_);
    changed = diffStates(state_, next);
    state_ = next;
  }
  if (changed != 0) {
    styleEngine_.setTheme(next.currentThemeName);
    recompute(changed);
    if ((changed & (depFlag(Dependency::Dimensions) |
                    depFlag(Dependency::Orientation) |
                    depFlag(Dependency::Insets))) != 0) {
      LayoutObserver::shared().remeasure();
    }
    notifyDependencyListeners(changed);
  }
}

void NitroCssCore::setTheme(const std::string& themeName) {
  styleEngine_.setTheme(themeName);
  {
    std::lock_guard<std::mutex> lock(stateMutex_);
    state_.currentThemeName = themeName;
  }
  const uint32_t changed = depFlag(Dependency::Theme);
  recompute(changed);
  notifyDependencyListeners(changed);
}

std::string NitroCssCore::currentTheme() const {
  return styleEngine_.currentTheme();
}

bool NitroCssCore::hasAdaptiveThemes() const {
  std::lock_guard<std::mutex> lock(stateMutex_);
  return state_.hasAdaptiveThemes;
}

// --- Registry --------------------------------------------------------------

void NitroCssCore::link(Tag tag,
                         ShadowNodeFamily::Shared family,
                         SurfaceId surfaceId,
                         std::string className,
                         std::string componentName,
                         uint32_t dependencyMask,
                         ResolveContext context,
                         SharedFolly inlineStyle,
                         std::vector<LinkedAccent> accents,
                         Tag containerTag,
                         bool initialNativeResolve) {
  // A virtualized list can reuse a Fabric tag before the previous cell's JS
  // cleanup callback runs. Replace every tag-owned registry entry atomically
  // from the core's point of view; the eventual stale unlink is family-guarded.
  unlink(tag);
  // Fabric tags are reused. Never let mutation-diff state from a previous
  // occupant suppress the first runtime update of the new node.
  forgetResolvedProps(tag);
  // A freshly-linked node must never inherit a stale animated-gradient-angle
  // override left on its Fabric tag by a previous occupant. Fabric frees tags on
  // unmount/reload and REUSES them for later mounts; an animated gradient whose
  // JS driver cleanup did not run (abrupt reload, or a screen kept mounted by
  // react-native-screens then destroyed) leaves a frozen angle in the registry.
  // Clearing on link guarantees this node starts from its own descriptor angle;
  // if it is itself an animated gradient, its JS driver re-sets the override
  // right after mount (useEffect runs post-link).
  GradientAngleOverrides::shared().clearAngle(tag);

  LinkedNode node;
  node.tag = tag;
  node.family = std::move(family);
  node.surfaceId = surfaceId;
  node.className = std::move(className);
  node.componentName = std::move(componentName);
  // Fold in the engine's own knowledge of the class's dependencies so callers
  // can't under-report and miss updates.
  node.dependencyMask = dependencyMask | styleEngine_.dependencyMask(node.className);
  node.context = std::move(context);
  node.inlineStyle = std::move(inlineStyle);
  // Native grid: the JS serializer (grid.tsx) stashes the parsed grid config on
  // the inline style under a reserved key. Extract it into the grid registry and
  // strip it so it never lands in the committed props.
  bool isGrid = false;
  grid::GridConfig gridConfig;
  if (node.inlineStyle && node.inlineStyle->isObject()) {
    if (auto* g = node.inlineStyle->get_ptr("__nitrocssGrid");
        g != nullptr && g->isObject()) {
      gridConfig = parseGridConfig(*g);
      isGrid = !gridConfig.columns.empty();
    }
    node.inlineStyle->erase("__nitrocssGrid");
  }
  node.accents = std::move(accents);
  for (const auto& accent : node.accents) {
    node.dependencyMask |= accent.dependencyMask |
        styleEngine_.dependencyMask(accent.className);
  }
  node.containerTag = containerTag;
  node.isContainer =
      styleEngine_.resolveContainerMarker(node.className, node.containerName);
  node.isGroupRoot = styleEngine_.resolveGroupMarker(node.className, node.groupName);
  const bool readsContainerSize =
      (node.dependencyMask & depFlag(Dependency::ContainerSize)) != 0;
  const bool readsGroupState =
      (node.dependencyMask & depFlag(Dependency::GroupState)) != 0;
  index_.add(node);

  // Track container markers so the layout observer knows which mounted nodes to
  // measure (and can skip the whole pass when no containers exist).
  if (node.isContainer) {
    {
      std::lock_guard<std::mutex> lock(containerMutex_);
      containerTags_[tag] = node.containerName;
    }
  }

  if (node.isGroupRoot) {
    std::lock_guard<std::mutex> lock(groupMutex_);
    groupTags_[tag] = node.groupName;
  }

  const bool readsStructuralPseudo = hasStructuralPseudoToken(node.className);
  if (readsStructuralPseudo) {
    std::lock_guard<std::mutex> lock(structuralMutex_);
    structuralPseudoTags_.insert(tag);
  }

  if (isGrid) {
    std::lock_guard<std::mutex> lock(gridMutex_);
    gridConfigs_[tag] = std::move(gridConfig);
    // Drop any cached width so the next measure pass always re-lays out (config
    // may have changed even when the container width did not).
    gridLastWidth_.erase(tag);
    gridLastMeasurementSignature_.erase(tag);
  }

  if (node.isContainer || readsContainerSize || node.isGroupRoot ||
      readsGroupState || readsStructuralPseudo || isGrid) {
    // `link` runs from a React ref callback, which fires *after* Fabric's
    // `shadowTreeDidMount` for the commit that mounted this node. Both sides can
    // arrive in either order: a container may be known before its query children,
    // or a query child may be known before its nearest container. Kick an
    // immediate measurement/association pass from both link paths so static
    // screens do not wait for an unrelated later commit.
    LayoutObserver::shared().remeasure();
  }

  // First-paint styles are already supplied by the React host components
  // (`View`, `Text`, and the component wrappers) as their regular `style`
  // props. Committing every new node again here turns a single React mount into
  // N extra Fabric transactions: a 1,000-card screen used to create roughly
  // 2,000 ShadowTree commits before the first frame could become idle.
  //
  // We still resolve once at link time so native-only paint descriptors
  // (gradient, clip-path, background image) are registered for their first
  // layout. From this point on the native registry owns dynamic updates and
  // batches them through `recompute`. Accents are the exception: they target a
  // prop outside the host style object (such as TextInput placeholder color),
  // so their initial value must still be committed natively.
  const ResolveContext initialContext = runtimeState().toContext();
  if (!initialNativeResolve && node.accents.empty()) {
    // React already committed the resolved first-paint props. Do not repeat the
    // full native resolution for ordinary runtime-dependent styles on mount.
  } else if (node.accents.empty()) {
    const auto initialProps = resolveForNode(node, initialContext);
    rememberResolvedProps(node, initialProps, hashDynamic(initialProps));
  } else {
    commitResolvedNode(node, initialContext);
  }
}

bool NitroCssCore::unlink(
    Tag tag,
    ShadowNodeFamily::Shared expectedFamily) {
  const bool removed = index_.remove(tag, expectedFamily);
  // A family mismatch proves this is a late cleanup for a recycled tag: none
  // of the tag-owned registries may be touched. Unguarded cleanup (used before
  // link) still clears orphaned paint/layout entries even if the index is empty.
  if (expectedFamily != nullptr && !removed) return false;
  forgetResolvedProps(tag);
  GradientTargets::shared().clearDescriptor(tag);
  ClipPathTargets::shared().clearDescriptor(tag);
  BackgroundImageTargets::shared().clearDescriptor(tag);
  EffectTargets::shared().clearDescriptor(tag);
  GradientAngleOverrides::shared().clearAngle(tag);
  {
    std::lock_guard<std::mutex> lock(containerMutex_);
    auto it = containerTags_.find(tag);
    if (it != containerTags_.end()) {
      if (!it->second.empty()) namedContainerSizes_.erase(it->second);
      containerTags_.erase(it);
    }
    containerSizes_.erase(tag);
  }
  {
    std::lock_guard<std::mutex> lock(groupMutex_);
    groupTags_.erase(tag);
    groupStates_.erase(tag);
  }
  {
    std::lock_guard<std::mutex> lock(structuralMutex_);
    structuralPseudoTags_.erase(tag);
  }
  {
    std::lock_guard<std::mutex> lock(gridMutex_);
    gridConfigs_.erase(tag);
    gridLastWidth_.erase(tag);
    gridLastMeasurementSignature_.erase(tag);
  }
  return removed;
}

bool NitroCssCore::isCurrentFamily(
    Tag tag,
    const ShadowNodeFamily::Shared& family) const {
  return index_.matchesFamily(tag, family);
}

void NitroCssCore::suspend(Tag tag) {
  index_.setSuspended(tag, true);
}

bool NitroCssCore::updateShadowTree(
    const std::unordered_map<Tag, SharedFolly>& mutations) {
  std::vector<NodeMutation> batch;
  batch.reserve(mutations.size());
  for (const auto& entry : mutations) {
    LinkedNode node;
    if (!index_.tryGet(entry.first, node) || node.family == nullptr) continue;
    folly::dynamic props = entry.second && entry.second->isObject()
                               ? *entry.second
                               : folly::dynamic::object();
    processColorProps(props);
    batch.push_back({node.family, node.surfaceId, std::move(props)});
  }
  if (batch.empty()) return false;
  const bool committed = ShadowTreeMutator::commit(batch);
  if (committed) {
    // This path accepts partial JS-owned native props, so it cannot replace the
    // cached complete class resolution. Force the next runtime recompute to
    // compare against a fresh baseline instead of suppressing a needed update.
    for (const auto& entry : mutations) forgetResolvedProps(entry.first);
  }
  return committed;
}

folly::dynamic NitroCssCore::resolveAccent(const LinkedAccent& accent,
                                            const ResolveContext& ctx) {
  uint32_t mask = 0;
  folly::dynamic style = styleEngine_.resolve(accent.className, ctx, mask);
  processColorProps(style);

  folly::dynamic props = folly::dynamic::object();
  auto copyValue = [&](const std::string& key) -> bool {
    if (auto* value = style.get_ptr(key); value != nullptr) {
      props[accent.propName] = *value;
      return true;
    }
    return false;
  };

  if (!accent.sourceProperty.empty()) {
    if (accent.sourceProperty == "*") {
      props[accent.propName] = style;
      return props;
    }
    copyValue(accent.sourceProperty);
    return props;
  }

  copyValue("accentColor") || copyValue(accent.propName) || copyValue("color") ||
      copyValue("tintColor") || copyValue("fill") || copyValue("stroke") ||
      copyValue("backgroundColor") || copyValue("borderColor");
  return props;
}

// --- Container queries ------------------------------------------------------

void NitroCssCore::setContainerSize(Tag containerTag,
                                     const std::string& name,
                                     double width,
                                     double height) {
  bool changed = false;
  {
    std::lock_guard<std::mutex> lock(containerMutex_);
    auto& entry = containerSizes_[containerTag];
    if (std::isnan(width)) width = entry.first;
    if (std::isnan(height)) height = entry.second;
    if (entry.first != width || entry.second != height) {
      entry = {width, height};
      changed = true;
    }
    if (!name.empty()) {
      auto& named = namedContainerSizes_[name];
      if (std::isnan(width)) width = named.first;
      if (std::isnan(height)) height = named.second;
      if (named.first != width || named.second != height) {
        named = {width, height};
        changed = true;
      }
    }
  }
  // Container size feeds only container-query buckets; nothing to do otherwise.
  if (changed) {
    recompute(depFlag(Dependency::ContainerSize));
  }
}

void NitroCssCore::syncContainers(
    const std::vector<ContainerMeasurement>& measurements,
    const std::unordered_map<Tag, Tag>& nodeToContainer,
    bool forceRecompute) {
  bool changed = false;
  {
    std::lock_guard<std::mutex> lock(containerMutex_);
    for (const auto& m : measurements) {
      auto& entry = containerSizes_[m.tag];
      if (entry.first != m.width || entry.second != m.height) {
        entry = {m.width, m.height};
        changed = true;
      }
      if (!m.name.empty()) {
        auto& named = namedContainerSizes_[m.name];
        if (named.first != m.width || named.second != m.height) {
          named = {m.width, m.height};
          changed = true;
        }
      }
    }
  }
  // Bind each query node to its nearest enclosing container (discovered
  // structurally from the mounted tree, so no JS plumbing is needed).
  for (const auto& entry : nodeToContainer) {
    if (index_.setContainerTag(entry.first, entry.second)) changed = true;
  }
  if (changed || (forceRecompute && !nodeToContainer.empty())) {
    recompute(depFlag(Dependency::ContainerSize));
  }
}

void NitroCssCore::syncGroups(
    const std::unordered_map<Tag, Tag>& nodeToGroup,
    bool forceRecompute) {
  bool changed = false;
  for (const auto& entry : nodeToGroup) {
    if (index_.setGroupTag(entry.first, entry.second)) changed = true;
  }
  if (changed || (forceRecompute && !nodeToGroup.empty())) {
    recompute(depFlag(Dependency::GroupState));
  }
}

void NitroCssCore::syncStructuralPseudos(
    const std::unordered_map<Tag, StructuralPseudoState>& stateByTag,
    bool forceRecompute) {
  bool changed = false;
  for (const auto& entry : stateByTag) {
    LinkedNode node;
    if (!index_.tryGet(entry.first, node)) continue;
    ResolveContext ctx = node.context;
    ctx.isFirstChild = entry.second.first;
    ctx.isLastChild = entry.second.last;
    if (index_.updateContext(entry.first, ctx)) changed = true;
  }
  if (changed || (forceRecompute && !stateByTag.empty())) {
    for (const auto& entry : stateByTag) {
      LinkedNode node;
      if (!index_.tryGet(entry.first, node)) continue;
      commitResolvedNode(node, runtimeState().toContext());
    }
  }
}

void NitroCssCore::syncGrids(const std::vector<GridMeasurement>& measurements,
                             bool forceRecompute) {
  std::vector<NodeMutation> batch;
  for (const auto& m : measurements) {
    grid::GridConfig config;
    {
      std::lock_guard<std::mutex> lock(gridMutex_);
      auto it = gridConfigs_.find(m.tag);
      if (it == gridConfigs_.end()) continue;
      config = it->second;

      // Gate on measured-width change (like container queries) so our own
      // absolute-frame commit — which re-triggers Yoga + a fresh mount — does
      // not re-fire us forever. A missing cache entry counts as changed.
      std::size_t measurementSignature = m.childWidths.size();
      const auto combineMeasurement = [&](double value) {
        const auto quantized = static_cast<int64_t>(std::llround(value * 2.0));
        measurementSignature ^= std::hash<int64_t>{}(quantized) +
            0x9e3779b9 + (measurementSignature << 6) +
            (measurementSignature >> 2);
      };
      for (double value : m.childWidths) combineMeasurement(value);
      for (double value : m.childHeights) combineMeasurement(value);
      auto widthIt = gridLastWidth_.find(m.tag);
      auto signatureIt = gridLastMeasurementSignature_.find(m.tag);
      const bool widthChanged = widthIt == gridLastWidth_.end() ||
          std::abs(widthIt->second - m.width) >= 0.5;
      const bool intrinsicChanged =
          signatureIt == gridLastMeasurementSignature_.end() ||
          signatureIt->second != measurementSignature;
      if (!widthChanged && !intrinsicChanged && !forceRecompute) continue;
      gridLastWidth_[m.tag] = m.width;
      gridLastMeasurementSignature_[m.tag] = measurementSignature;
    }

    grid::GridInput input;
    input.width = std::max(0.0, m.width - config.paddingHorizontal);
    input.columns = config.columns;
    input.rows = config.rows;
    input.autoRow = config.autoRow;
    input.columnGap = config.columnGap;
    input.rowGap = config.rowGap;
    input.dense = config.dense;
    input.justifyItems = config.justifyItems;
    input.alignItems = config.alignItems;
    input.items = config.items;
    input.intrinsicWidths = m.childWidths;
    input.intrinsicHeights = m.childHeights;
    // Placements travel positionally with the measured child families; never lay
    // out more items than there are children to receive them.
    if (input.items.size() > m.childFamilies.size()) {
      input.items.resize(m.childFamilies.size());
    }

    const auto output = grid::GridLayoutEngine::layout(input);

    for (std::size_t i = 0;
         i < output.items.size() && i < m.childFamilies.size(); ++i) {
      if (m.childFamilies[i] == nullptr) continue;
      const auto& item = output.items[i];
      folly::dynamic props = folly::dynamic::object();
      props["position"] = "absolute";
      props["left"] = item.x;
      props["top"] = config.paddingTop + item.y;
      props["width"] = item.width;
      props["height"] = item.height;
      batch.push_back({m.childFamilies[i], m.surfaceId, std::move(props)});
    }

    // Grid items are out of flow, so the container would collapse to 0 height —
    // commit the engine's computed height onto the container itself.
    if (m.family != nullptr) {
      folly::dynamic containerProps = folly::dynamic::object();
      containerProps["height"] =
          config.paddingTop + output.height + config.paddingBottom;
      batch.push_back({m.family, m.surfaceId, std::move(containerProps)});
    }
  }

  if (!batch.empty()) {
    ShadowTreeMutator::commit(batch);
  }
}

void NitroCssCore::setGroupState(Tag groupTag, GroupState state) {
  bool changed = false;
  {
    std::lock_guard<std::mutex> lock(groupMutex_);
    auto& current = groupStates_[groupTag];
    changed = current.active != state.active ||
        current.focused != state.focused ||
        current.hovered != state.hovered ||
        current.disabled != state.disabled;
    current = state;
  }
  if (changed) recompute(depFlag(Dependency::GroupState));
}

void NitroCssCore::setComponentState(Tag tag, const ResolveContext& context) {
  if (!index_.updateContext(tag, context)) return;
  LinkedNode node;
  if (!index_.tryGet(tag, node)) return;
  commitResolvedNode(node, runtimeState().toContext());
}

std::unordered_map<Tag, std::string> NitroCssCore::containerTags() const {
  std::lock_guard<std::mutex> lock(containerMutex_);
  return containerTags_;
}

std::unordered_map<Tag, std::string> NitroCssCore::groupTags() const {
  std::lock_guard<std::mutex> lock(groupMutex_);
  return groupTags_;
}

std::unordered_set<Tag> NitroCssCore::containerQueryTags() const {
  return index_.tagsForBit(static_cast<uint32_t>(Dependency::ContainerSize));
}

std::unordered_set<Tag> NitroCssCore::groupDependentTags() const {
  return index_.tagsForBit(static_cast<uint32_t>(Dependency::GroupState));
}

std::unordered_set<Tag> NitroCssCore::linkedTags() const {
  return index_.activeTags();
}

std::unordered_set<Tag> NitroCssCore::structuralPseudoTags() const {
  std::lock_guard<std::mutex> lock(structuralMutex_);
  return structuralPseudoTags_;
}

std::unordered_set<Tag> NitroCssCore::gridTags() const {
  std::lock_guard<std::mutex> lock(gridMutex_);
  std::unordered_set<Tag> tags;
  tags.reserve(gridConfigs_.size());
  for (const auto& entry : gridConfigs_) tags.insert(entry.first);
  return tags;
}

void NitroCssCore::applyContainerSizes(ResolveContext& ctx,
                                        const LinkedNode& node) const {
  std::lock_guard<std::mutex> lock(containerMutex_);
  if (node.containerTag != 0) {
    auto it = containerSizes_.find(node.containerTag);
    if (it != containerSizes_.end()) {
      ctx.hasContainer = true;
      ctx.containerWidth = it->second.first;
      ctx.containerHeight = it->second.second;
    }
  }
  if (!namedContainerSizes_.empty()) {
    ctx.namedContainerSizes = namedContainerSizes_;
  }
}

void NitroCssCore::applyGroupState(ResolveContext& ctx,
                                    const LinkedNode& node) const {
  if (node.groupTag == 0) return;
  std::lock_guard<std::mutex> lock(groupMutex_);
  auto it = groupStates_.find(node.groupTag);
  if (it == groupStates_.end()) return;
  ctx.isGroupActive = it->second.active;
  ctx.isGroupFocused = it->second.focused;
  ctx.isGroupHovered = it->second.hovered;
  ctx.isGroupDisabled = it->second.disabled;
}

// --- Recompute -------------------------------------------------------------

folly::dynamic NitroCssCore::resolveForNode(const LinkedNode& node,
                                             const ResolveContext& ctx) {
  ResolveContext nodeCtx = ctx;
  nodeCtx.isFocused = node.context.isFocused;
  nodeCtx.isActive = node.context.isActive;
  nodeCtx.isDisabled = node.context.isDisabled;
  nodeCtx.isHovered = node.context.isHovered;
  nodeCtx.isFirstChild = node.context.isFirstChild;
  nodeCtx.isLastChild = node.context.isLastChild;
  applyContainerSizes(nodeCtx, node);
  applyGroupState(nodeCtx, node);
  uint32_t mask = 0;
  folly::dynamic style = styleEngine_.resolve(node.className, nodeCtx, mask);
  if (node.inlineStyle && node.inlineStyle->isObject()) {
    mergeFolly(style, *node.inlineStyle);
  }
  processColorProps(style);
  // Native gradient: the folded descriptor never rides on committed RN props —
  // it is routed to GradientTargets, and the platform applier paints it as a
  // CAGradientLayer on the target view's OWN layer (RN backgroundImage-style).
  // Registering here (resolve time) means first paint, theme/scheme recomputes
  // and state changes all refresh the registry through the same single path.
  if (auto* gradient = style.get_ptr("--nitrocss-gradient");
      gradient != nullptr && gradient->isObject()) {
    if (node.tag != 0) {
      double radius = 0.0;
      if (auto* r = style.get_ptr("borderRadius");
          r != nullptr && r->isNumber()) {
        radius = r->asDouble();
      }
      // Gradient-border descriptors (an `inner` fill painted over the
      // gradient's padding box) also need the resolved border width to size
      // the inset — the width can come from a different class than the
      // descriptor, so attach it here, after the buckets merged.
      if (gradient->get_ptr("inner") != nullptr) {
        folly::dynamic descriptor = *gradient;
        if (auto* bw = style.get_ptr("borderWidth");
            bw != nullptr && bw->isNumber()) {
          descriptor["bw"] = bw->asDouble();
        }
        GradientTargets::shared().setDescriptor(node.tag, descriptor, radius);
      } else {
        GradientTargets::shared().setDescriptor(node.tag, *gradient, radius);
      }
    }
    style.erase("--nitrocss-gradient");
  } else if (node.tag != 0) {
    // The class no longer folds a gradient (e.g. state/variant flip) — make
    // sure a previously registered paint is removed. No-op for the common case.
    GradientTargets::shared().clearDescriptor(node.tag);
  }
  // Native clip-path: same routing model as the gradient above — the folded
  // descriptor is a paint/mask instruction for the target view's own layer, not
  // an RN prop, so it is handed to ClipPathTargets and stripped from the style.
  if (auto* clipPath = style.get_ptr("--nitrocss-clip-path");
      clipPath != nullptr && clipPath->isObject()) {
    if (node.tag != 0) {
      ClipPathTargets::shared().setDescriptor(node.tag, *clipPath);
    }
    style.erase("--nitrocss-clip-path");
  } else if (node.tag != 0) {
    ClipPathTargets::shared().clearDescriptor(node.tag);
  }
  // Native background-image: url() — routed to its registry and painted as an
  // image layer on the view's own backing layer, mirroring the gradient path.
  if (auto* bgImage = style.get_ptr("--nitrocss-background-image");
      bgImage != nullptr && bgImage->isObject()) {
    if (node.tag != 0) {
      // Android paints the image as a Drawable above RN's background, so it
      // cannot infer the owner's corner geometry from that wrapped Drawable.
      // Carry the resolved uniform radius with the native-only descriptor.
      folly::dynamic descriptor = *bgImage;
      if (auto* radius = style.get_ptr("borderRadius");
          radius != nullptr && radius->isNumber()) {
        descriptor["br"] = radius->asDouble();
      }
      BackgroundImageTargets::shared().setDescriptor(node.tag, descriptor);
    }
    style.erase("--nitrocss-background-image");
  } else if (node.tag != 0) {
    BackgroundImageTargets::shared().clearDescriptor(node.tag);
  }
  // Animated gradient angle is a RUNTIME-ONLY track: the JS driver pushes each
  // frame's angle through GradientAngleOverrides via the JSI channel. The marker
  // must never reach RN or the native paint registry — strip it unconditionally.
  if (style.get_ptr("--nitrocss-gradient-angle") != nullptr) {
    style.erase("--nitrocss-gradient-angle");
  }
  if (auto* effects = style.get_ptr("--nitrocss-native-effects");
      effects != nullptr) {
    if (node.tag != 0 && effects->isObject()) {
      EffectTargets::shared().setDescriptor(node.tag, *effects);
    } else if (node.tag != 0) {
      EffectTargets::shared().clearDescriptor(node.tag);
    }
    style.erase("--nitrocss-native-effects");
  } else if (node.tag != 0) {
    EffectTargets::shared().clearDescriptor(node.tag);
  }
  processSvgPaintProps(node.componentName, style);
  return style;
}

void NitroCssCore::recompute(uint32_t changedMask) {
  const ResolveContext ctx = runtimeState().toContext();
  const auto nodes = index_.affectedNodes(changedMask);
  std::vector<NodeMutation> batch;
  std::vector<const LinkedNode*> changedNodes;
  std::vector<std::size_t> changedHashes;
  batch.reserve(nodes.size());
  changedNodes.reserve(nodes.size());
  changedHashes.reserve(nodes.size());
  std::size_t resolved = 0;
  std::size_t skipped = 0;
  const auto resolveStart = std::chrono::steady_clock::now();

  for (const auto& nodeSnapshot : nodes) {
    const auto& node = *nodeSnapshot;
    if (node.family == nullptr) continue;
    folly::dynamic props = resolveForNode(node, ctx);
    ++resolved;
    for (const auto& accent : node.accents) {
      const auto accentMask = accent.dependencyMask |
          styleEngine_.dependencyMask(accent.className);
      if ((changedMask & accentMask) == 0) continue;

      folly::dynamic accentProps = resolveAccent(accent, ctx);
      if (!accentProps.isObject()) continue;
      for (const auto& pair : accentProps.items()) {
        props[pair.first] = pair.second;
      }
    }
    processSvgPaintProps(node.componentName, props);
    const auto propsHash = hashDynamic(props);
    if (resolvedPropsUnchanged(node, props, propsHash)) {
      ++skipped;
      continue;
    }
    batch.push_back({node.family, node.surfaceId, std::move(props)});
    changedNodes.push_back(&node);
    changedHashes.push_back(propsHash);
  }
  const auto resolveEnd = std::chrono::steady_clock::now();

  bool committed = false;
  const auto commitStart = std::chrono::steady_clock::now();
  if (!batch.empty()) {
    committed = ShadowTreeMutator::commit(batch);
  }
  const auto commitEnd = std::chrono::steady_clock::now();
  if (committed) {
    for (std::size_t i = 0; i < batch.size(); ++i) {
      rememberResolvedProps(*changedNodes[i], batch[i].props, changedHashes[i]);
    }
  }
  recordDiagnostics(
      nodes.size(), resolved, skipped, committed ? batch.size() : 0,
      std::chrono::duration<double, std::milli>(resolveEnd - resolveStart).count(),
      std::chrono::duration<double, std::milli>(commitEnd - commitStart).count());
}

void NitroCssCore::recomputeAll() {
  const ResolveContext ctx = runtimeState().toContext();
  const auto nodes = index_.activeNodes();
  std::vector<NodeMutation> batch;
  std::vector<const LinkedNode*> changedNodes;
  std::vector<std::size_t> changedHashes;
  batch.reserve(nodes.size());
  changedNodes.reserve(nodes.size());
  changedHashes.reserve(nodes.size());
  std::size_t resolved = 0;
  std::size_t skipped = 0;
  const auto resolveStart = std::chrono::steady_clock::now();

  for (const auto& nodeSnapshot : nodes) {
    const auto& node = *nodeSnapshot;
    if (node.family == nullptr) continue;
    folly::dynamic props = resolveForNode(node, ctx);
    ++resolved;
    for (const auto& accent : node.accents) {
      folly::dynamic accentProps = resolveAccent(accent, ctx);
      if (!accentProps.isObject()) continue;
      for (const auto& pair : accentProps.items()) {
        props[pair.first] = pair.second;
      }
    }
    processSvgPaintProps(node.componentName, props);
    const auto propsHash = hashDynamic(props);
    if (resolvedPropsUnchanged(node, props, propsHash)) {
      ++skipped;
      continue;
    }
    batch.push_back({node.family, node.surfaceId, std::move(props)});
    changedNodes.push_back(&node);
    changedHashes.push_back(propsHash);
  }
  const auto resolveEnd = std::chrono::steady_clock::now();

  bool committed = false;
  const auto commitStart = std::chrono::steady_clock::now();
  if (!batch.empty()) {
    committed = ShadowTreeMutator::commit(batch);
  }
  const auto commitEnd = std::chrono::steady_clock::now();
  if (committed) {
    for (std::size_t i = 0; i < batch.size(); ++i) {
      rememberResolvedProps(*changedNodes[i], batch[i].props, changedHashes[i]);
    }
  }
  recordDiagnostics(
      nodes.size(), resolved, skipped, committed ? batch.size() : 0,
      std::chrono::duration<double, std::milli>(resolveEnd - resolveStart).count(),
      std::chrono::duration<double, std::milli>(commitEnd - commitStart).count());
}

void NitroCssCore::commitResolvedNode(const LinkedNode& node,
                                       const ResolveContext& ctx) {
  if (node.family == nullptr) return;
  const auto resolveStart = std::chrono::steady_clock::now();
  folly::dynamic props = resolveForNode(node, ctx);
  for (const auto& accent : node.accents) {
    folly::dynamic accentProps = resolveAccent(accent, ctx);
    if (!accentProps.isObject()) continue;
    for (const auto& pair : accentProps.items()) {
      props[pair.first] = pair.second;
    }
  }
  processSvgPaintProps(node.componentName, props);
  const auto resolveEnd = std::chrono::steady_clock::now();
  const auto propsHash = hashDynamic(props);
  if (resolvedPropsUnchanged(node, props, propsHash)) {
    recordDiagnostics(
        1, 1, 1, 0,
        std::chrono::duration<double, std::milli>(resolveEnd - resolveStart).count(),
        0.0);
    return;
  }
  const auto commitStart = std::chrono::steady_clock::now();
  const bool committed =
      ShadowTreeMutator::commit({{node.family, node.surfaceId, props}});
  const auto commitEnd = std::chrono::steady_clock::now();
  if (committed) rememberResolvedProps(node, props, propsHash);
  recordDiagnostics(
      1, 1, 0, committed ? 1 : 0,
      std::chrono::duration<double, std::milli>(resolveEnd - resolveStart).count(),
      std::chrono::duration<double, std::milli>(commitEnd - commitStart).count());
}

bool NitroCssCore::resolvedPropsUnchanged(const LinkedNode& node,
                                           const folly::dynamic& props,
                                           std::size_t propsHash) const {
  std::lock_guard<std::mutex> lock(resolvedPropsMutex_);
  const auto it = resolvedProps_.find(node.tag);
  return it != resolvedProps_.end() && it->second.family == node.family &&
      it->second.propsHash == propsHash && it->second.props == props;
}

void NitroCssCore::rememberResolvedProps(const LinkedNode& node,
                                          const folly::dynamic& props,
                                          std::size_t propsHash) {
  std::lock_guard<std::mutex> lock(resolvedPropsMutex_);
  resolvedProps_[node.tag] = {node.family, props, propsHash};
}

void NitroCssCore::forgetResolvedProps(Tag tag) {
  std::lock_guard<std::mutex> lock(resolvedPropsMutex_);
  resolvedProps_.erase(tag);
}

void NitroCssCore::recordDiagnostics(std::size_t affected,
                                     std::size_t resolved,
                                     std::size_t skipped,
                                     std::size_t committed,
                                     double resolveDurationMs,
                                     double commitDurationMs) {
  std::lock_guard<std::mutex> lock(diagnosticsMutex_);
  diagnostics_.affectedNodes += affected;
  diagnostics_.resolvedNodes += resolved;
  diagnostics_.skippedMutations += skipped;
  diagnostics_.committedMutations += committed;
  diagnostics_.lastResolveDurationMs = resolveDurationMs;
  diagnostics_.lastCommitDurationMs = commitDurationMs;
  diagnostics_.totalResolveDurationMs += resolveDurationMs;
  diagnostics_.totalCommitDurationMs += commitDurationMs;
}

NitroCssCore::DiagnosticsSnapshot NitroCssCore::diagnosticsSnapshot() const {
  DiagnosticsSnapshot snapshot;
  {
    std::lock_guard<std::mutex> lock(diagnosticsMutex_);
    snapshot = diagnostics_;
  }
  snapshot.linkedNodes = index_.size();
  return snapshot;
}

void NitroCssCore::resetDiagnostics() {
  std::lock_guard<std::mutex> lock(diagnosticsMutex_);
  diagnostics_ = {};
}

// --- Listeners -------------------------------------------------------------

int NitroCssCore::addDependencyListener(DependencyListener listener) {
  std::lock_guard<std::mutex> lock(listenerMutex_);
  const int id = nextListenerId_++;
  dependencyListeners_.emplace(id, std::move(listener));
  return id;
}

void NitroCssCore::removeDependencyListener(int id) {
  std::lock_guard<std::mutex> lock(listenerMutex_);
  dependencyListeners_.erase(id);
}

void NitroCssCore::setResolveListener(ResolveListener listener) {
  std::lock_guard<std::mutex> lock(listenerMutex_);
  resolveListener_ = std::move(listener);
}

void NitroCssCore::notifyDependencyListeners(uint32_t changedMask) {
  std::vector<DependencyListener> snapshot;
  {
    std::lock_guard<std::mutex> lock(listenerMutex_);
    snapshot.reserve(dependencyListeners_.size());
    for (const auto& entry : dependencyListeners_) snapshot.push_back(entry.second);
  }
  for (const auto& listener : snapshot) listener(changedMask);
}

} // namespace nitrocss
