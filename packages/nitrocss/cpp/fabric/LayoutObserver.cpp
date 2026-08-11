#include "LayoutObserver.hpp"

#include "../bgimage/BackgroundImageTargets.hpp"
#include "../clippath/ClipPathTargets.hpp"
#include "../core/NitroCssCore.hpp"
#include "../gradient/GradientAngleOverrides.hpp"
#include "../gradient/GradientTargets.hpp"
#include "../effects/EffectTargets.hpp"

#include <react/renderer/core/LayoutableShadowNode.h>
#include <react/renderer/core/ShadowNode.h>
#include <react/renderer/mounting/ShadowTree.h>
#include <react/renderer/mounting/ShadowTreeRegistry.h>

#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace nitrocss {

using namespace facebook::react;

LayoutObserver& LayoutObserver::shared() {
  static LayoutObserver instance;
  return instance;
}

void LayoutObserver::registerWith(UIManager& uiManager) {
  if (registered_ && uiManager_ == &uiManager) return;
  // A different UIManager means a new React instance (dev reload) replaced the
  // one we registered on. That instance — including its mount-hook registry —
  // is gone or being torn down; unregistering through the stale pointer would
  // be a use-after-free. Just re-point at the live UIManager and register: the
  // mount hook is what re-pings the gradient applier and re-measures container
  // queries after every mount, so without this the reloaded app never paints
  // gradients again.
  uiManager_ = &uiManager;
  uiManager.registerMountHook(*this);
  registered_ = true;
}

void LayoutObserver::unregister() {
  if (!registered_ || uiManager_ == nullptr) return;
  uiManager_->unregisterMountHook(*this);
  registered_ = false;
  uiManager_ = nullptr;
}

namespace {

/**
 * Depth-first walk of the mounted tree carrying the nearest enclosing container
 * and group tags. Containers are measured; query/group nodes are bound to their
 * nearest *ancestor* (CSS semantics: an element never queries itself).
 */
void walk(const ShadowNode& node,
          Tag nearestContainer,
          Tag nearestGroup,
          const std::unordered_map<Tag, std::string>& containers,
          const std::unordered_map<Tag, std::string>& groups,
          const std::unordered_set<Tag>& linkedTags,
          const std::unordered_set<Tag>& structuralPseudoTags,
          const std::unordered_set<Tag>& queryTags,
          const std::unordered_set<Tag>& groupDependentTags,
          const std::unordered_set<Tag>& gridTags,
          std::vector<NitroCssCore::ContainerMeasurement>& measurements,
          std::unordered_map<Tag, Tag>& nodeToContainer,
          std::unordered_map<Tag, Tag>& nodeToGroup,
          std::unordered_map<Tag, NitroCssCore::StructuralPseudoState>& structuralState,
          std::vector<NitroCssCore::GridMeasurement>& gridMeasurements) {
  const Tag tag = node.getTag();

  // Bind this query node to the nearest container found above it.
  if (nearestContainer != 0 && queryTags.find(tag) != queryTags.end()) {
    nodeToContainer[tag] = nearestContainer;
  }

  if (nearestGroup != 0 && groupDependentTags.find(tag) != groupDependentTags.end()) {
    nodeToGroup[tag] = nearestGroup;
  }

  // If this node is itself a container, measure it and make it the nearest
  // container for its subtree.
  Tag childNearest = nearestContainer;
  auto containerIt = containers.find(tag);
  if (containerIt != containers.end()) {
    if (auto* layoutable = dynamic_cast<const LayoutableShadowNode*>(&node)) {
      const auto size = layoutable->getLayoutMetrics().frame.size;
      measurements.push_back({tag, containerIt->second,
                              static_cast<double>(size.width),
                              static_cast<double>(size.height)});
    }
    childNearest = tag;
  }

  Tag childNearestGroup = nearestGroup;
  if (groups.find(tag) != groups.end()) {
    childNearestGroup = tag;
  }

  // Native grid: measure the container's content width and collect its grid-item
  // children (in tree order) so the engine can lay them out and commit absolute
  // frames. Placements travel positionally with these families (see grid.tsx).
  if (gridTags.find(tag) != gridTags.end()) {
    if (auto* layoutable = dynamic_cast<const LayoutableShadowNode*>(&node)) {
      NitroCssCore::GridMeasurement measurement;
      measurement.tag = tag;
      measurement.family = node.getFamilyShared();
      measurement.surfaceId = node.getSurfaceId();
      measurement.width =
          static_cast<double>(layoutable->getLayoutMetrics().frame.size.width);
      for (const auto& child : node.getChildren()) {
        if (child == nullptr) continue;
        auto* childLayoutable =
            dynamic_cast<const LayoutableShadowNode*>(child.get());
        if (childLayoutable == nullptr) {
          continue;
        }
        measurement.childFamilies.push_back(child->getFamilyShared());
        const auto childSize = childLayoutable->getLayoutMetrics().frame.size;
        measurement.childWidths.push_back(static_cast<double>(childSize.width));
        measurement.childHeights.push_back(static_cast<double>(childSize.height));
      }
      gridMeasurements.push_back(std::move(measurement));
    }
  }

  std::vector<Tag> linkedChildTags;
  for (const auto& child : node.getChildren()) {
    if (child == nullptr) continue;
    const Tag childTag = child->getTag();
    if (linkedTags.find(childTag) != linkedTags.end()) {
      linkedChildTags.push_back(childTag);
    }
  }
  if (!linkedChildTags.empty()) {
    const Tag first = linkedChildTags.front();
    const Tag last = linkedChildTags.back();
    for (const auto childTag : linkedChildTags) {
      if (structuralPseudoTags.find(childTag) == structuralPseudoTags.end()) continue;
      structuralState[childTag] = {childTag == first, childTag == last};
    }
  }

  for (const auto& child : node.getChildren()) {
    if (child != nullptr) {
      walk(*child, childNearest, childNearestGroup, containers, groups,
           linkedTags, structuralPseudoTags, queryTags, groupDependentTags,
           gridTags, measurements, nodeToContainer, nodeToGroup, structuralState,
           gridMeasurements);
    }
  }
}

/**
 * Measure every registered container reachable from `root` and push the result
 * (plus each query node's nearest-container binding) to the engine. Shared by
 * the mount hook and the out-of-band {@link LayoutObserver::remeasure} path.
 */
void measureAndSync(const ShadowNode& root, bool forceRecompute) {
  auto& core = NitroCssCore::shared();
  const auto containers = core.containerTags();
  const auto groups = core.groupTags();
    const auto structuralPseudoTags = core.structuralPseudoTags();
    const auto gridTags = core.gridTags();
    if (containers.empty() && groups.empty() && structuralPseudoTags.empty() &&
        gridTags.empty()) return;
  const auto queryTags = core.containerQueryTags();
  const auto groupDependentTags = core.groupDependentTags();
    const auto linkedTags = core.linkedTags();

  std::vector<NitroCssCore::ContainerMeasurement> measurements;
  std::unordered_map<Tag, Tag> nodeToContainer;
  std::unordered_map<Tag, Tag> nodeToGroup;
    std::unordered_map<Tag, NitroCssCore::StructuralPseudoState> structuralState;
    std::vector<NitroCssCore::GridMeasurement> gridMeasurements;
  walk(root, /*nearestContainer=*/0, /*nearestGroup=*/0, containers, groups,
      linkedTags, structuralPseudoTags, queryTags, groupDependentTags,
      gridTags, measurements, nodeToContainer, nodeToGroup, structuralState,
      gridMeasurements);

  if (!measurements.empty() || !nodeToContainer.empty()) {
    core.syncContainers(measurements, nodeToContainer, forceRecompute);
  }
  if (!nodeToGroup.empty()) {
    core.syncGroups(nodeToGroup, forceRecompute);
  }
  if (!structuralState.empty()) {
    core.syncStructuralPseudos(structuralState, forceRecompute);
  }
  if (!gridMeasurements.empty()) {
    core.syncGrids(gridMeasurements, forceRecompute);
  }
}

} // namespace

void LayoutObserver::shadowTreeDidMount(
    const RootShadowNode::Shared& rootShadowNode,
    HighResTimeStamp /*mountTime*/) noexcept {
  if (rootShadowNode == nullptr) return;

  // This hook is `noexcept`: a thrown exception would terminate the app, so we
  // contain any failure to a skipped frame rather than a crash.
  try {
    // Native gradients: a mount transaction may have created/recycled/resized
    // component views (view culling deletes off-screen views and re-creates
    // them on scroll-back). Ping the platform applier so every registered
    // gradient target is re-applied/pruned. O(1) when no gradients exist; the
    // applier coalesces onto the main thread and skips unchanged views.
    GradientTargets::shared().onMountTransaction();
    // Same re-apply rationale for the other view-layer effects: a recycled or
    // re-created view must get its clip-path mask, background image, and
    // in-flight animated gradient angle back. Each is O(1) when unused.
    ClipPathTargets::shared().onMountTransaction();
    BackgroundImageTargets::shared().onMountTransaction();
    GradientAngleOverrides::shared().onMountTransaction();
    EffectTargets::shared().onMountTransaction();

    measureAndSync(*rootShadowNode, false);
  } catch (...) {
    // Swallow — container styles will be reconciled on the next mount.
  }
}

void LayoutObserver::remeasure() noexcept {
  if (uiManager_ == nullptr) return;

  // Same containment rationale as `shadowTreeDidMount`: never let a failure
  // escape onto the JS thread that calls us from `NitroCssCore::link`.
  try {
    // Cheap pre-check so the registry walk is skipped entirely when the app
    // uses no container queries.
    auto& core = NitroCssCore::shared();
    if (core.containerTags().empty() && core.groupTags().empty() &&
      core.structuralPseudoTags().empty() && core.gridTags().empty()) return;

    uiManager_->getShadowTreeRegistry().enumerate(
        [](const ShadowTree& shadowTree, bool& /*stop*/) {
          const auto revision = shadowTree.getCurrentRevision();
          if (revision.rootShadowNode != nullptr) {
            measureAndSync(*revision.rootShadowNode, true);
          }
        });
  } catch (...) {
    // Swallow — the next mount will reconcile container styles.
  }
}

} // namespace nitrocss
