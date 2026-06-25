#include "LayoutObserver.hpp"

#include "../core/NitrowindCore.hpp"

#include <react/renderer/core/LayoutableShadowNode.h>
#include <react/renderer/core/ShadowNode.h>
#include <react/renderer/mounting/ShadowTree.h>
#include <react/renderer/mounting/ShadowTreeRegistry.h>

#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace nitrowind {

using namespace facebook::react;

LayoutObserver& LayoutObserver::shared() {
  static LayoutObserver instance;
  return instance;
}

void LayoutObserver::registerWith(UIManager& uiManager) {
  if (registered_) return;
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
 * tag. Containers are measured; query nodes are bound to their nearest *ancestor*
 * container (CSS semantics: an element never queries itself).
 */
void walk(const ShadowNode& node,
          Tag nearestContainer,
          const std::unordered_map<Tag, std::string>& containers,
          const std::unordered_set<Tag>& queryTags,
          std::vector<NitrowindCore::ContainerMeasurement>& measurements,
          std::unordered_map<Tag, Tag>& nodeToContainer) {
  const Tag tag = node.getTag();

  // Bind this query node to the nearest container found above it.
  if (nearestContainer != 0 && queryTags.find(tag) != queryTags.end()) {
    nodeToContainer[tag] = nearestContainer;
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

  for (const auto& child : node.getChildren()) {
    if (child != nullptr) {
      walk(*child, childNearest, containers, queryTags, measurements,
           nodeToContainer);
    }
  }
}

/**
 * Measure every registered container reachable from `root` and push the result
 * (plus each query node's nearest-container binding) to the engine. Shared by
 * the mount hook and the out-of-band {@link LayoutObserver::remeasure} path.
 */
void measureAndSync(const ShadowNode& root, bool forceRecompute) {
  auto& core = NitrowindCore::shared();
  const auto containers = core.containerTags();
  if (containers.empty()) return; // fast path: no container queries in use.
  const auto queryTags = core.containerQueryTags();

  std::vector<NitrowindCore::ContainerMeasurement> measurements;
  std::unordered_map<Tag, Tag> nodeToContainer;
  walk(root, /*nearestContainer=*/0, containers, queryTags, measurements,
       nodeToContainer);

  if (!measurements.empty() || !nodeToContainer.empty()) {
    core.syncContainers(measurements, nodeToContainer, forceRecompute);
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
    measureAndSync(*rootShadowNode, false);
  } catch (...) {
    // Swallow — container styles will be reconciled on the next mount.
  }
}

void LayoutObserver::remeasure() noexcept {
  if (uiManager_ == nullptr) return;

  // Same containment rationale as `shadowTreeDidMount`: never let a failure
  // escape onto the JS thread that calls us from `NitrowindCore::link`.
  try {
    // Cheap pre-check so the registry walk is skipped entirely when the app
    // uses no container queries.
    if (NitrowindCore::shared().containerTags().empty()) return;

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

} // namespace nitrowind
