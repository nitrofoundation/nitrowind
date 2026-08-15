#include "NitroCssCore.hpp"

#include "../bgimage/BackgroundImageTargets.hpp"
#include "../clippath/ClipPathTargets.hpp"
#include "../fabric/LayoutObserver.hpp"
#include "../fabric/ShadowTreeMutator.hpp"
#include "../fabric/CommitBatcher.hpp"
#include "../gradient/GradientAngleOverrides.hpp"
#include "../mask/MaskTransformOverrides.hpp"
#include "../gradient/GradientTargets.hpp"
#include "../mask/MaskTargets.hpp"
#include "../scroll/ScrollTimelineTargets.hpp"
#include "../grid/GridLayoutEngine.hpp"

#include <cstdint>
#include <cmath>

namespace nitrocss {

using namespace facebook::react;

namespace {

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

void foldFilterDescriptor(folly::dynamic& style) {
  auto* descriptor = style.get_ptr("--nitrocss-filter");
  if (descriptor == nullptr) return;
  folly::dynamic filters = folly::dynamic::array();
  static constexpr const char* names[] = {
      "blur", "brightness", "contrast", "grayscale", "hueRotate",
      "invert", "opacity", "saturate", "sepia"};
  if (descriptor->isArray()) {
    for (const auto& entry : *descriptor) {
      if (!entry.isArray() || entry.size() < 2 || !entry[0].isInt()) continue;
      const auto opcode = entry[0].getInt();
      if (opcode >= 0 && opcode <= 8 && entry[1].isNumber()) {
        filters.push_back(folly::dynamic::object(names[opcode], entry[1]));
      } else if (opcode == 9 && entry.size() >= 5) {
        filters.push_back(folly::dynamic::object(
            "dropShadow",
            folly::dynamic::object
                ("offsetX", entry[1])
                ("offsetY", entry[2])
                ("standardDeviation", entry[3])
                ("color", entry[4])));
      }
    }
  }
  style.erase("--nitrocss-filter");
  if (!filters.empty()) style["filter"] = std::move(filters);
}

void processColorProps(folly::dynamic& style) {
  if (!style.isObject()) return;
  foldFilterDescriptor(style);
  std::vector<folly::dynamic> unsupportedColorKeys;
  for (const auto& pair : style.items()) {
    if (pair.first.isString() && pair.first.getString() == "filter") {
      processFilterColors(style[pair.first]);
      continue;
    }
    if (!isColorProp(pair.first) || !pair.second.isString()) continue;
    const auto& value = pair.second.getString();
    if (value.rfind("color-mix(", 0) == 0) {
      unsupportedColorKeys.push_back(pair.first);
      continue;
    }
    int64_t processed = 0;
    if (parseHexColor(value, processed)) {
      style[pair.first] = processed;
    }
  }
  for (const auto& key : unsupportedColorKeys) {
    style.erase(key);
  }
}

/**
 * `position: sticky` is consumed by the NitroCSS ScrollView wrapper and mapped
 * to React Native's native sticky-header machinery. Fabric/Yoga do not accept
 * `sticky` as a position enum, and the wrapper owns its edge offset, so neither
 * the keyword nor physical offsets may be committed to the child ShadowNode.
 */
void consumeNativeStickyPosition(folly::dynamic& style) {
  auto* position = style.get_ptr("position");
  if (position == nullptr || !position->isString() ||
      position->getString() != "sticky") {
    return;
  }
  style.erase("position");
  style.erase("top");
  style.erase("right");
  style.erase("bottom");
  style.erase("left");
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
    else if (t == "auto") track.type = grid::TrackType::Auto;
    else if (t == "min-content") track.type = grid::TrackType::MinContent;
    else if (t == "max-content") track.type = grid::TrackType::MaxContent;
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
  if (auto* dense = value.get_ptr("dense"); dense != nullptr && dense->isBool()) {
    config.dense = dense->getBool();
  }
  if (auto* masonry = value.get_ptr("masonry");
      masonry != nullptr && masonry->isBool()) {
    config.masonry = masonry->getBool();
  }
  if (auto* columnGap = value.get_ptr("columnGap"); columnGap != nullptr) {
    config.columnGap = numberOr(*columnGap, 0.0);
  }
  if (auto* rowGap = value.get_ptr("rowGap"); rowGap != nullptr) {
    config.rowGap = numberOr(*rowGap, 0.0);
  }
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
                         Tag containerTag) {
  // A freshly-linked node must never inherit a stale animated-gradient-angle
  // override left on its Fabric tag by a previous occupant. Fabric frees tags on
  // unmount/reload and REUSES them for later mounts; an animated gradient whose
  // JS driver cleanup did not run (abrupt reload, or a screen kept mounted by
  // react-native-screens then destroyed) leaves a frozen angle in the registry.
  // Clearing on link guarantees this node starts from its own descriptor angle;
  // if it is itself an animated gradient, its JS driver re-sets the override
  // right after mount (useEffect runs post-link).
  GradientAngleOverrides::shared().clearAngle(tag);
  MaskTransformOverrides::shared().clearTransform(tag);

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
  if (node.accents.empty()) {
    (void)resolveForNode(node, initialContext);
  } else {
    commitResolvedNode(node, initialContext, true);
  }
}

void NitroCssCore::unlink(Tag tag, ShadowNodeFamily::Shared expectedFamily) {
  if (!index_.remove(tag, expectedFamily)) return;
  GradientTargets::shared().clearDescriptor(tag);
  ClipPathTargets::shared().clearDescriptor(tag);
  BackgroundImageTargets::shared().clearDescriptor(tag);
  MaskTargets::shared().clearDescriptor(tag);
  ScrollTimelineTargets::shared().clear(tag);
  GradientAngleOverrides::shared().clearAngle(tag);
  MaskTransformOverrides::shared().clearTransform(tag);
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
  }
}

void NitroCssCore::resetForNewInstance() {
  // The core is process-global, while every dev reload creates a fresh Fabric
  // tree. Families from the previous UIManager are invalid and Fabric may reuse
  // their numeric tags immediately, so discard the complete per-tree index.
  index_.clear();
  {
    std::lock_guard<std::mutex> lock(containerMutex_);
    containerSizes_.clear();
    namedContainerSizes_.clear();
    containerTags_.clear();
  }
  {
    std::lock_guard<std::mutex> lock(groupMutex_);
    groupTags_.clear();
    groupStates_.clear();
  }
  {
    std::lock_guard<std::mutex> lock(structuralMutex_);
    structuralPseudoTags_.clear();
  }
  {
    std::lock_guard<std::mutex> lock(gridMutex_);
    gridConfigs_.clear();
    gridLastWidth_.clear();
  }
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
  return ShadowTreeMutator::commit(batch);
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
      auto widthIt = gridLastWidth_.find(m.tag);
      const bool widthChanged = widthIt == gridLastWidth_.end() ||
          std::abs(widthIt->second - m.width) >= 0.5;
      if (!widthChanged && !forceRecompute) continue;
      gridLastWidth_[m.tag] = m.width;
    }

    grid::GridInput input;
    input.width = std::max(0.0, m.width - config.paddingHorizontal);
    input.columns = config.columns;
    input.rows = config.rows;
    input.autoRow = config.autoRow;
    input.dense = config.dense;
    input.masonry = config.masonry;
    input.columnGap = config.columnGap;
    input.rowGap = config.rowGap;
    input.items = config.items;
    // Placements travel positionally with the measured child families; never lay
    // out more items than there are children to receive them.
    if (input.items.size() > m.childFamilies.size()) {
      input.items.resize(m.childFamilies.size());
    }
    for (std::size_t i = 0; i < input.items.size(); ++i) {
      if (i < m.childWidths.size()) {
        input.items[i].intrinsicWidth = m.childWidths[i];
      }
      if (i < m.childHeights.size()) {
        input.items[i].intrinsicHeight = m.childHeights[i];
      }
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
    CommitBatcher::shared().enqueue(std::move(batch));
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
  consumeNativeStickyPosition(style);
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
    const auto* type = bgImage->get_ptr("type");
    const bool isNone = type != nullptr && type->isString() &&
        type->getString() == "none";
    if (node.tag != 0 && isNone) {
      BackgroundImageTargets::shared().clearDescriptor(node.tag);
    } else if (node.tag != 0) {
      BackgroundImageTargets::shared().setDescriptor(node.tag, *bgImage);
    }
    style.erase("--nitrocss-background-image");
  } else if (node.tag != 0) {
    BackgroundImageTargets::shared().clearDescriptor(node.tag);
  }
  if (auto* mask = style.get_ptr("--nitrocss-mask");
      mask != nullptr && mask->isObject()) {
    const auto* source = mask->get_ptr("source");
    const auto* type = source != nullptr && source->isObject()
        ? source->get_ptr("type")
        : nullptr;
    const bool isNone = type != nullptr && type->isString() && type->getString() == "none";
    if (node.tag != 0 && isNone) MaskTargets::shared().clearDescriptor(node.tag);
    else if (node.tag != 0) MaskTargets::shared().setDescriptor(node.tag, *mask);
    style.erase("--nitrocss-mask");
  } else if (node.tag != 0) {
    MaskTargets::shared().clearDescriptor(node.tag);
  }
  // Animated gradient angle is a RUNTIME-ONLY track: the JS driver pushes each
  // frame's angle through GradientAngleOverrides via the JSI channel. The marker
  // must never reach RN or the native paint registry — strip it unconditionally.
  if (style.get_ptr("--nitrocss-gradient-angle") != nullptr) {
    style.erase("--nitrocss-gradient-angle");
  }
  if (style.get_ptr("--nitrocss-mask-transform") != nullptr) {
    style.erase("--nitrocss-mask-transform");
  }
  if (auto* source = style.get_ptr("--nitrocss-scroll-timeline-source");
      source != nullptr && source->isObject()) {
    if (node.tag != 0) ScrollTimelineTargets::shared().setSource(node.tag, *source);
    style.erase("--nitrocss-scroll-timeline-source");
  } else if (node.tag != 0) {
    ScrollTimelineTargets::shared().clearSource(node.tag);
  }
  if (auto* animation = style.get_ptr("--nitrocss-scroll-timeline-animation");
      animation != nullptr && animation->isObject()) {
    if (node.tag != 0) ScrollTimelineTargets::shared().setAnimation(node.tag, *animation);
    style.erase("--nitrocss-scroll-timeline-animation");
  } else if (node.tag != 0) {
    ScrollTimelineTargets::shared().clearAnimation(node.tag);
  }
  return style;
}

void NitroCssCore::recompute(uint32_t changedMask) {
  const ResolveContext ctx = runtimeState().toContext();
  std::vector<NodeMutation> batch;

  index_.forEachAffected(changedMask, [&](const LinkedNode& node) {
    folly::dynamic props = resolveForNode(node, ctx);
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
    batch.push_back({node.family, node.surfaceId, std::move(props)});
  });

  if (!batch.empty()) {
    CommitBatcher::shared().enqueue(std::move(batch));
  }
}

void NitroCssCore::recomputeAll() {
  const ResolveContext ctx = runtimeState().toContext();
  std::vector<NodeMutation> batch;

  index_.forEachActive([&](const LinkedNode& node) {
    folly::dynamic props = resolveForNode(node, ctx);
    for (const auto& accent : node.accents) {
      folly::dynamic accentProps = resolveAccent(accent, ctx);
      if (!accentProps.isObject()) continue;
      for (const auto& pair : accentProps.items()) {
        props[pair.first] = pair.second;
      }
    }
    batch.push_back({node.family, node.surfaceId, std::move(props)});
  });

  if (!batch.empty()) {
    CommitBatcher::shared().enqueue(std::move(batch));
  }
}

void NitroCssCore::commitResolvedNode(const LinkedNode& node,
                                       const ResolveContext& ctx,
                                       bool immediate) {
  if (node.family == nullptr) return;
  folly::dynamic props = resolveForNode(node, ctx);
  for (const auto& accent : node.accents) {
    folly::dynamic accentProps = resolveAccent(accent, ctx);
    if (!accentProps.isObject()) continue;
    for (const auto& pair : accentProps.items()) {
      props[pair.first] = pair.second;
    }
  }
  std::vector<NodeMutation> batch;
  batch.push_back({node.family, node.surfaceId, std::move(props)});
  if (immediate) {
    CommitBatcher::shared().commitNow(std::move(batch));
  } else {
    CommitBatcher::shared().enqueue(std::move(batch));
  }
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
