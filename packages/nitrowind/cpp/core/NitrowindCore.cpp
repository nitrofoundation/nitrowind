#include "NitrowindCore.hpp"

#include "../fabric/LayoutObserver.hpp"
#include "../fabric/ShadowTreeMutator.hpp"
#include "../grid/GridLayoutEngine.hpp"

#include <cstdint>
#include <cmath>

namespace nitrowind {

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

void processColorProps(folly::dynamic& style) {
  if (!style.isObject()) return;
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
  if (auto* columnGap = value.get_ptr("columnGap"); columnGap != nullptr) {
    config.columnGap = numberOr(*columnGap, 0.0);
  }
  if (auto* rowGap = value.get_ptr("rowGap"); rowGap != nullptr) {
    config.rowGap = numberOr(*rowGap, 0.0);
  }
  if (auto* padding = value.get_ptr("paddingHorizontal"); padding != nullptr) {
    config.paddingHorizontal = numberOr(*padding, 0.0);
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

NitrowindCore& NitrowindCore::shared() {
  static NitrowindCore instance;
  return instance;
}

// --- Runtime ---------------------------------------------------------------

RuntimeState NitrowindCore::runtimeState() const {
  std::lock_guard<std::mutex> lock(stateMutex_);
  return state_;
}

void NitrowindCore::setRuntimeState(const RuntimeState& next) {
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

void NitrowindCore::setTheme(const std::string& themeName) {
  styleEngine_.setTheme(themeName);
  {
    std::lock_guard<std::mutex> lock(stateMutex_);
    state_.currentThemeName = themeName;
  }
  const uint32_t changed = depFlag(Dependency::Theme);
  recompute(changed);
  notifyDependencyListeners(changed);
}

std::string NitrowindCore::currentTheme() const {
  return styleEngine_.currentTheme();
}

bool NitrowindCore::hasAdaptiveThemes() const {
  std::lock_guard<std::mutex> lock(stateMutex_);
  return state_.hasAdaptiveThemes;
}

// --- Registry --------------------------------------------------------------

void NitrowindCore::link(Tag tag,
                         ShadowNodeFamily::Shared family,
                         SurfaceId surfaceId,
                         std::string className,
                         std::string componentName,
                         uint32_t dependencyMask,
                         ResolveContext context,
                         SharedFolly inlineStyle,
                         std::vector<LinkedAccent> accents,
                         Tag containerTag) {
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
    if (auto* g = node.inlineStyle->get_ptr("__nitrowindGrid");
        g != nullptr && g->isObject()) {
      gridConfig = parseGridConfig(*g);
      isGrid = !gridConfig.columns.empty();
    }
    node.inlineStyle->erase("__nitrowindGrid");
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

  // Native-first first paint: JS only registers the host and className; C++
  // resolves the actual props and commits them into the ShadowTree.
  commitResolvedNode(node, runtimeState().toContext());
}

void NitrowindCore::unlink(Tag tag) {
  index_.remove(tag);
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

void NitrowindCore::suspend(Tag tag) {
  index_.setSuspended(tag, true);
}

bool NitrowindCore::updateShadowTree(
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

folly::dynamic NitrowindCore::resolveAccent(const LinkedAccent& accent,
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

void NitrowindCore::setContainerSize(Tag containerTag,
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

void NitrowindCore::syncContainers(
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

void NitrowindCore::syncGroups(
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

void NitrowindCore::syncStructuralPseudos(
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

void NitrowindCore::syncGrids(const std::vector<GridMeasurement>& measurements,
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
    input.columnGap = config.columnGap;
    input.rowGap = config.rowGap;
    input.items = config.items;
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
      props["top"] = item.y;
      props["width"] = item.width;
      props["height"] = item.height;
      batch.push_back({m.childFamilies[i], m.surfaceId, std::move(props)});
    }

    // Grid items are out of flow, so the container would collapse to 0 height —
    // commit the engine's computed height onto the container itself.
    if (m.family != nullptr) {
      folly::dynamic containerProps = folly::dynamic::object();
      containerProps["height"] = output.height;
      batch.push_back({m.family, m.surfaceId, std::move(containerProps)});
    }
  }

  if (!batch.empty()) {
    ShadowTreeMutator::commit(batch);
  }
}

void NitrowindCore::setGroupState(Tag groupTag, GroupState state) {
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

void NitrowindCore::setComponentState(Tag tag, const ResolveContext& context) {
  if (!index_.updateContext(tag, context)) return;
  LinkedNode node;
  if (!index_.tryGet(tag, node)) return;
  commitResolvedNode(node, runtimeState().toContext());
}

std::unordered_map<Tag, std::string> NitrowindCore::containerTags() const {
  std::lock_guard<std::mutex> lock(containerMutex_);
  return containerTags_;
}

std::unordered_map<Tag, std::string> NitrowindCore::groupTags() const {
  std::lock_guard<std::mutex> lock(groupMutex_);
  return groupTags_;
}

std::unordered_set<Tag> NitrowindCore::containerQueryTags() const {
  return index_.tagsForBit(static_cast<uint32_t>(Dependency::ContainerSize));
}

std::unordered_set<Tag> NitrowindCore::groupDependentTags() const {
  return index_.tagsForBit(static_cast<uint32_t>(Dependency::GroupState));
}

std::unordered_set<Tag> NitrowindCore::linkedTags() const {
  return index_.activeTags();
}

std::unordered_set<Tag> NitrowindCore::structuralPseudoTags() const {
  std::lock_guard<std::mutex> lock(structuralMutex_);
  return structuralPseudoTags_;
}

std::unordered_set<Tag> NitrowindCore::gridTags() const {
  std::lock_guard<std::mutex> lock(gridMutex_);
  std::unordered_set<Tag> tags;
  tags.reserve(gridConfigs_.size());
  for (const auto& entry : gridConfigs_) tags.insert(entry.first);
  return tags;
}

void NitrowindCore::applyContainerSizes(ResolveContext& ctx,
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

void NitrowindCore::applyGroupState(ResolveContext& ctx,
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

folly::dynamic NitrowindCore::resolveForNode(const LinkedNode& node,
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
  return style;
}

void NitrowindCore::recompute(uint32_t changedMask) {
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
    ShadowTreeMutator::commit(batch);
  }
}

void NitrowindCore::commitResolvedNode(const LinkedNode& node,
                                       const ResolveContext& ctx) {
  if (node.family == nullptr) return;
  folly::dynamic props = resolveForNode(node, ctx);
  for (const auto& accent : node.accents) {
    folly::dynamic accentProps = resolveAccent(accent, ctx);
    if (!accentProps.isObject()) continue;
    for (const auto& pair : accentProps.items()) {
      props[pair.first] = pair.second;
    }
  }
  ShadowTreeMutator::commit({{node.family, node.surfaceId, std::move(props)}});
}

// --- Listeners -------------------------------------------------------------

int NitrowindCore::addDependencyListener(DependencyListener listener) {
  std::lock_guard<std::mutex> lock(listenerMutex_);
  const int id = nextListenerId_++;
  dependencyListeners_.emplace(id, std::move(listener));
  return id;
}

void NitrowindCore::removeDependencyListener(int id) {
  std::lock_guard<std::mutex> lock(listenerMutex_);
  dependencyListeners_.erase(id);
}

void NitrowindCore::setResolveListener(ResolveListener listener) {
  std::lock_guard<std::mutex> lock(listenerMutex_);
  resolveListener_ = std::move(listener);
}

void NitrowindCore::notifyDependencyListeners(uint32_t changedMask) {
  std::vector<DependencyListener> snapshot;
  {
    std::lock_guard<std::mutex> lock(listenerMutex_);
    snapshot.reserve(dependencyListeners_.size());
    for (const auto& entry : dependencyListeners_) snapshot.push_back(entry.second);
  }
  for (const auto& listener : snapshot) listener(changedMask);
}

} // namespace nitrowind
